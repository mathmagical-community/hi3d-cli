/**
 * `hi3d-cli login` / `hi3d-cli logout` / `hi3d-cli configure ...` — profile handling like `aws configure`.
 *   hi3d login                       interactive: pick mode, enter keys or account
 *   hi3d login --mode ak --ak <AK> --sk <SK> [--profile name] [--endpoint url]
 *   hi3d login --mode web --account <email> [--password <pw>]     (transition path B)
 *   hi3d login --mode web --cookie "<cookie header>" [--token <t>]  (paste from browser)
 *   hi3d configure list | get [name] | set ... | delete <name> | profile <name>
 */
import { Command, Option } from 'commander';
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import {
  ClientInfo,
  CONSOLE_URL,
  DEFAULT_BASE_URL,
  DEFAULT_WEB_BASE,
  Hi3DClient,
  Hi3DError,
  Hi3DWebClient,
  userAgentFor,
  Profile,
  clearCredentials,
  configPath,
  deleteProfile,
  describeProfile,
  loadConfig,
  loadProfile,
  newPkce,
  newWebId,
  parseAuthorizationInput,
  saveConfig,
  setCurrentProfile,
  upsertProfile,
} from '@hi3d/core';

type Emit = (body: unknown, status?: number) => void;
type Fail = (e: unknown) => never;
const log = (m: string) => process.stderr.write(m + '\n');

async function ask(question: string, opts: { hidden?: boolean; def?: string } = {}): Promise<string> {
  if (!process.stdin.isTTY) return opts.def ?? '';
  const muted = { muted: false };
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted.muted) process.stderr.write(chunk);
      cb();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
  process.stderr.write(question + (opts.def ? ` [${opts.def}]` : '') + ': ');
  muted.muted = !!opts.hidden;
  const ans = (await rl.question('')).trim();
  muted.muted = false;
  if (opts.hidden) process.stderr.write('\n');
  rl.close();
  return ans || opts.def || '';
}

async function loginAk(o: { ak?: string; sk?: string; profile: string; endpoint?: string; verify: boolean }, emit: Emit) {
  let ak = o.ak;
  let sk = o.sk;
  if (!ak || !sk) {
    log(`Hi3D Open Platform keys: ${CONSOLE_URL}`);
    ak ||= await ask('Access Key (AK)');
    sk ||= await ask('Secret Key (SK)', { hidden: true });
  }
  if (!ak || !sk) throw new Hi3DError('Missing --ak / --sk (non-interactive), or HI3D_CLIENT_ID / HI3D_CLIENT_SECRET.', { code: 'BAD_ARGS', status: 400 });
  const profile: Profile = { name: o.profile, mode: 'ak', accessKey: ak, secretKey: sk, endpoint: o.endpoint };
  let balance: number | undefined;
  if (o.verify) {
    const c = new Hi3DClient({ credentials: { clientId: ak, clientSecret: sk, baseUrl: o.endpoint }, persistToken: false, userAgent: userAgentFor(CLIENT_INFO) });
    await c.fetchAccessToken();
    balance = (await c.balance()).totalBalance;
  }
  const saved = upsertProfile(profile);
  emit({ mode: 'ak', profile: describeProfile(profile), verified: o.verify, balance, config: saved });
}

interface WebLoginOpts {
  account?: string;
  password?: string;
  cookie?: string;
  token?: string;
  profile: string;
  endpoint?: string;
  /** browser authorization: try to open the browser (default true), fixed loopback port, seconds to wait */
  browser?: boolean;
  port?: number;
  timeout?: number;
}

async function loginWeb(o: WebLoginOpts, emit: Emit) {
  const before = loadConfig();
  const profile: Profile = { name: o.profile, mode: 'web', webBase: o.endpoint ?? DEFAULT_WEB_BASE, webId: newWebId() };
  upsertProfile(profile); // create first so the client can persist cookies into it
  try {
    await loginWebInner(o, profile, emit);
  } catch (e) {
    saveConfig(before); // roll back: no half-created profile, previous current profile restored
    throw e;
  }
}

async function loginWebInner(o: WebLoginOpts, profile: Profile, emit: Emit) {
  const client = new Hi3DWebClient({ profile, userAgent: userAgentFor(CLIENT_INFO, true) });
  if (o.cookie) {
    const me = await client.loginWithCookie(o.cookie, o.token);
    return emit({ mode: 'web', method: 'cookie', profile: describeProfile(profile), user: me, config: configPath() });
  }
  if (!o.account && !o.password) return loginWebAuthorize(o, profile, client, emit);
  const account = o.account || (await ask('hi3d.ai account (email)'));
  const password = o.password || (await ask('Password', { hidden: true }));
  if (!account || !password) throw new Hi3DError('Missing --account / --password, or --cookie.', { code: 'BAD_ARGS', status: 400 });
  log('Signing in to hi3d.ai with your account password (legacy; plain `hi3d-cli login --mode web` uses browser authorization).');
  const r = await client.loginWithPassword(account, password);
  emit({ mode: 'web', method: 'password', profile: describeProfile(profile), user: r.user, config: configPath() });
}

function htmlPage(title: string, text: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;margin:12vh auto;max-width:36em;text-align:center"><h2>${title}</h2><p>${text}</p></body>`;
}

function openBrowser(url: string): boolean {
  try {
    const child =
      process.platform === 'darwin'
        ? spawn('open', [url], { stdio: 'ignore', detached: true })
        : process.platform === 'win32'
          ? spawn('cmd', ['/c', 'start', '""', `"${url}"`], { stdio: 'ignore', detached: true, windowsVerbatimArguments: true })
          : spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Default web login: loopback callback + PKCE. Opens the site's authorization page in the browser; the signed-in user
 * approves, the site redirects to http://127.0.0.1:<port>/callback?code&state, and the code is exchanged for the
 * session. On a machine without a browser the URL is printed and the redirected URL (or code) can be pasted back.
 */
async function loginWebAuthorize(o: WebLoginOpts, profile: Profile, client: Hi3DWebClient, emit: Emit) {
  const timeoutS = o.timeout && o.timeout > 0 ? o.timeout : 300;
  const pkce = newPkce();
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(o.port ?? 0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const url = client.authorizeUrl({ redirectUri, state: pkce.state, codeChallenge: pkce.codeChallenge });
  log(`Open this URL in your browser to authorize hi3d-cli (waiting up to ${timeoutS}s):\n  ${url}`);
  if (o.browser !== false && openBrowser(url)) log('A browser window should open; if not, copy the URL above.');
  let rl: readline.Interface | undefined;
  let timer: NodeJS.Timeout | undefined;
  const fromCallback = new Promise<string>((resolve, reject) => {
    timer = setTimeout(() => reject(new Hi3DError(`No authorization received within ${timeoutS}s. Run \`hi3d-cli login --mode web\` again.`, { code: 'AUTH_TIMEOUT', status: 408 })), timeoutS * 1000);
    server.on('request', (req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (u.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const err = u.searchParams.get('error');
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      if (err) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(htmlPage('Authorization failed', `The site reported: ${err}`));
        reject(new Hi3DError(`authorization denied: ${err}`, { code: 'AUTH_DENIED', status: 401 }));
        return;
      }
      if (!code || state !== pkce.state) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(htmlPage('Authorization failed', 'Missing code or state mismatch. Run `hi3d-cli login` again.'));
        return; // keep waiting; a stray request must not consume the attempt
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(htmlPage('hi3d-cli authorized', 'You can close this window and return to the terminal.'));
      resolve(code);
    });
  });
  const fromPaste = new Promise<string>((resolve) => {
    if (!process.stdin.isTTY) return; // agents / pipes: only the loopback callback can complete the login
    rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    const prompt = () =>
      rl!
        .question('If the browser cannot reach this machine, paste the redirected URL (or just the code) here: ')
        .then((ans) => {
          const parsed = parseAuthorizationInput(ans, pkce.state);
          if (parsed) resolve(parsed.code);
          else if (rl) {
            log('Not a valid authorization code / callback URL, try again.');
            prompt();
          }
        })
        .catch(() => {});
    prompt();
  });
  let code: string;
  try {
    code = await Promise.race([fromCallback, fromPaste]);
  } finally {
    if (timer) clearTimeout(timer);
    rl?.close();
    server.closeAllConnections?.();
    server.close();
  }
  const me = await client.loginWithAuthorizationCode({ code, codeVerifier: pkce.codeVerifier, redirectUri, state: pkce.state });
  emit({ mode: 'web', method: 'authorize', profile: describeProfile(profile), user: me, config: configPath() });
}

let CLIENT_INFO: ClientInfo | undefined;

export function registerAuthCommands(program: Command, emit: Emit, fail: Fail, clientInfo?: ClientInfo) {
  CLIENT_INFO = clientInfo;
  program
    .command('login')
    .description('Sign in: Open Platform AK/SK (--mode ak) or hi3d.ai account (--mode web, authorizes in your browser). Interactive when flags are omitted.')
    .addOption(new Option('--mode <mode>', 'ak | web').choices(['ak', 'web']))
    .option('-p, --profile <name>', 'profile name', 'default')
    .option('--ak <accessKey>', 'Open Platform Access Key')
    .option('--sk <secretKey>', 'Open Platform Secret Key')
    .option('--client-id <id>', 'alias of --ak')
    .option('--client-secret <secret>', 'alias of --sk')
    .option('--endpoint <url>', `API base (ak: ${DEFAULT_BASE_URL}, web: ${DEFAULT_WEB_BASE})`)
    .option('--no-browser', 'web mode: do not try to open a browser, only print the authorization URL')
    .option('--port <n>', 'web mode: fixed loopback port for the authorization callback (default: random)', (v) => Number(v))
    .option('--timeout <seconds>', 'web mode: how long to wait for the browser authorization (default 300)', (v) => Number(v))
    .option('--account <email>', 'web mode: legacy account-password login instead of the browser')
    .option('--password <pw>', 'web mode: legacy account-password login (prompted when --account is given without it)')
    .option('--cookie <header>', 'web mode: paste the Cookie header from a logged-in browser instead')
    .option('--token <token>', 'web mode: token to send alongside the cookie (optional)')
    .option('--no-verify', 'ak mode: skip the test call')
    .action(async (o) => {
      try {
        let mode: 'ak' | 'web' | undefined = o.mode;
        if (!mode) {
          if (o.ak || o.sk || o.clientId || o.clientSecret) mode = 'ak';
          else if (o.account || o.password || o.cookie) mode = 'web';
          else if (process.stdin.isTTY) {
            log('How do you want to sign in?\n  1) Hi3D Open Platform Access Key / Secret Key (platform.hi3d.ai, pay-as-you-go API)\n  2) hi3d.ai account (the same credits as the website)');
            const pick = await ask('Choose 1 or 2', { def: '1' });
            mode = pick === '2' ? 'web' : 'ak';
          } else mode = 'ak';
        }
        if (mode === 'ak') await loginAk({ ak: o.ak ?? o.clientId, sk: o.sk ?? o.clientSecret, profile: o.profile, endpoint: o.endpoint, verify: o.verify !== false }, emit);
        else await loginWeb({ account: o.account, password: o.password, cookie: o.cookie, token: o.token, profile: o.profile, endpoint: o.endpoint, browser: o.browser !== false, port: o.port, timeout: o.timeout }, emit);
      } catch (e) {
        fail(e);
      }
    });

  program
    .command('logout')
    .description('Remove a profile (default: the current one); web sessions are also invalidated server-side')
    .option('-p, --profile <name>')
    .action(async (o) => {
      const cfg = loadConfig();
      const name = o.profile ?? cfg.current;
      const p = cfg.profiles[name];
      if (p?.mode === 'web' && p.cookie) await new Hi3DWebClient({ profile: p, persist: false, userAgent: userAgentFor(CLIENT_INFO, true) }).logout();
      emit({ removed: clearCredentials(name), profile: name, config: configPath() });
    });

  const conf = program.command('configure').description('Manage profiles (like `aws configure`)');
  conf
    .command('list')
    .description('List profiles')
    .action(() => {
      const cfg = loadConfig();
      emit({ current: cfg.current, config: configPath(), profiles: Object.values(cfg.profiles).map(describeProfile) });
    });
  conf
    .command('get')
    .description('Show one profile (default: current)')
    .argument('[name]')
    .action((name?: string) => {
      const p = loadProfile(name);
      if (!p) fail(new Hi3DError(`profile not found: ${name ?? '(current)'}`, { code: 'NOT_FOUND', status: 404 }));
      emit(describeProfile(p!));
    });
  conf
    .command('set')
    .description('Add or modify a profile without verification')
    .requiredOption('-p, --profile <name>')
    .addOption(new Option('--mode <mode>').choices(['ak', 'web']).default('ak'))
    .option('--ak <accessKey>')
    .option('--sk <secretKey>')
    .option('--endpoint <url>')
    .option('--cookie <header>')
    .option('--token <token>')
    .option('--no-current', 'do not switch the current profile to this one')
    .action((o) => {
      const cfg = loadConfig();
      const prev = cfg.profiles[o.profile];
      const p: Profile = {
        ...(prev ?? {}),
        name: o.profile,
        mode: o.mode,
        ...(o.ak ? { accessKey: o.ak } : {}),
        ...(o.sk ? { secretKey: o.sk } : {}),
        ...(o.endpoint ? (o.mode === 'web' ? { webBase: o.endpoint } : { endpoint: o.endpoint }) : {}),
        ...(o.cookie ? { cookie: o.cookie, webLogin: 'cookie', loginAt: Date.now() } : {}),
        ...(o.token ? { token: o.token } : {}),
      };
      if (p.mode === 'web' && !p.webId) p.webId = newWebId();
      emit({ saved: upsertProfile(p, o.current !== false), profile: describeProfile(p) });
    });
  conf
    .command('delete')
    .description('Delete a profile')
    .argument('<name>')
    .action((name: string) => emit({ deleted: deleteProfile(name), profile: name }));
  conf
    .command('profile')
    .description('Switch the current profile')
    .argument('<name>')
    .action((name: string) => {
      if (!setCurrentProfile(name)) fail(new Hi3DError(`profile not found: ${name}`, { code: 'NOT_FOUND', status: 404 }));
      emit({ current: name });
    });
}
