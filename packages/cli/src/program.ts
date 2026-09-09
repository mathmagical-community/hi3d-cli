/**
 * Builds the `hi3d-cli` commander program: login/configure, Hi3D commands, MCP server.
 * Pure JS; runs on macOS / Windows / Linux with Node >= 18.
 */
import { Command, Option } from 'commander';
import { z } from 'zod';
import { Hi3DError, configPath, describeProfile, loadProfile } from '@hi3d/core';
import { TOOLS, listTools, makeContext, runStdio, runHttp } from '@hi3d/mcp';
import { registerAuthCommands } from './auth-cmds.js';
import { checkForUpdate } from './update-check.js';

export const VERSION = '1.0.1';
/** npm package name used for the update hint; overridden at release build via NPM_PACKAGE_NAME */
export const PACKAGE_NAME = process.env.HI3D_NPM_NAME ?? 'hi3d-cli';

const log = (m: string) => process.stderr.write(m + '\n');

export function emit(body: unknown, status = 200) {
  process.stdout.write(JSON.stringify({ ok: true, status, body }, null, 2) + '\n');
}
export function fail(e: unknown): never {
  const err: { code?: string | number; message: string; [k: string]: unknown } = e instanceof Hi3DError ? e.toJSON() : { message: (e as Error).message ?? String(e) };
  const status = e instanceof Hi3DError && e.status ? e.status : 1;
  process.stdout.write(JSON.stringify({ ok: false, status, error: err }, null, 2) + '\n');
  process.exit(exitCodeFor(err.code));
}

/** Stable exit codes for agents: 1 generic, 2 bad args, 3 auth, 4 not found, 5 upstream/API, 6 unsupported. */
export function exitCodeFor(code: unknown): number {
  const c = String(code ?? '');
  if (c === 'BAD_ARGS') return 2;
  if (c === 'NO_CREDENTIALS' || c === '401' || c === '40010000') return 3;
  if (c === 'NOT_FOUND' || c === '40040000') return 4;
  if (c === 'UNSUPPORTED_WEB') return 6;
  if (/^\d{6,}$/.test(c) || c === 'POLL_TIMEOUT' || c === 'DOWNLOAD_FAILED') return 5;
  return 1;
}

/** Positional aliases: `hi3d image_to_3d ./cat.png` == `--image ./cat.png`. */
const POSITIONAL: Record<string, string> = {
  image_to_3d: 'image',
  query_task: 'task_id',
  split_model: 'mesh',
  image_to_relief: 'image',
  multicolor_model: 'mesh',
  download_asset: 'task_id',
};

type ZodAny = z.ZodTypeAny;
function unwrap(s: ZodAny): { inner: ZodAny; optional: boolean } {
  let inner = s;
  let optional = false;
  for (;;) {
    const t = (inner as { def?: { type?: string; innerType?: ZodAny } }).def;
    if (t?.type === 'optional' || t?.type === 'default' || t?.type === 'nullable') {
      optional = true;
      inner = t.innerType as ZodAny;
    } else break;
  }
  return { inner, optional };
}
const kindOf = (s: ZodAny): string => ((s as { def?: { type?: string } }).def?.type ?? 'unknown') as string;
function enumValues(s: ZodAny): string[] | undefined {
  const d = (s as { def?: { entries?: Record<string, string>; options?: string[] } }).def;
  if (d?.entries) return Object.values(d.entries);
  if (d?.options) return d.options;
  return undefined;
}

function addToolCommand(program: Command, t: (typeof TOOLS)[number]) {
  const cmd = program.command(t.name).description(t.description);
  const pos = POSITIONAL[t.name];
  if (pos) cmd.argument(`[${pos}]`, `same as --${pos}`);
  const flagName = (k: string) => k.replace(/_/g, '-');
  const shape = t.schema as Record<string, ZodAny>;
  for (const [key, raw] of Object.entries(shape)) {
    const { inner } = unwrap(raw);
    const desc = raw.description ?? inner.description ?? '';
    const kind = kindOf(inner);
    const flag = flagName(key);
    if (kind === 'boolean') {
      cmd.addOption(new Option(`--${flag}`, desc));
      cmd.addOption(new Option(`--no-${flag}`).hideHelp());
    } else if (kind === 'array') cmd.addOption(new Option(`--${flag} <values...>`, desc));
    else if (kind === 'number' || kind === 'int') cmd.addOption(new Option(`--${flag} <n>`, desc).argParser(Number));
    else if (kind === 'enum') cmd.addOption(new Option(`--${flag} <value>`, desc).choices(enumValues(inner) ?? []));
    else cmd.addOption(new Option(`--${flag} <value>`, desc));
  }
  cmd.action(async (...cliArgs: unknown[]) => {
    const opts = cliArgs[cliArgs.length - 2] as Record<string, unknown>;
    const args: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const camel = key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
      if (opts[camel] !== undefined) args[key] = opts[camel];
    }
    if (pos && typeof cliArgs[0] === 'string' && args[pos] === undefined) args[pos] = cliArgs[0];
    const parsed = z.object(t.schema).safeParse(args);
    if (!parsed.success) fail(new Hi3DError('Invalid arguments: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), { code: 'BAD_ARGS', status: 400 }));
    const ctx = makeContext({ mode: 'local', outDir: program.opts().out, log });
    try {
      emit(await t.handler(parsed.data, ctx));
    } catch (e) {
      fail(e);
    }
  });
}

export function buildProgram(): Command {
  const program = new Command('hi3d-cli')
    .version(VERSION, '-V, --version', 'print version')
    .description(`hi3d-cli ${VERSION} — image to 3D for terminals and AI agents. All output is JSON: { ok, status, body }.`)
    .option('--out <dir>', 'default download directory', process.env.HI3D_OUT_DIR ?? 'hi3d-out')
    .option('--no-update-check', 'skip the once-a-day new-version hint')
    .showHelpAfterError()
    .hook('preAction', async (thisCmd) => {
      if (thisCmd.opts().updateCheck !== false) await checkForUpdate(PACKAGE_NAME, VERSION).catch(() => {});
    });

  registerAuthCommands(program, emit, fail);

  program
    .command('status')
    .description('Show the active profile (no API call)')
    .action(() => {
      const p = loadProfile();
      emit({ version: VERSION, profile: p ? { ...describeProfile(p), source: p.name === 'env' ? 'env' : configPath() } : null });
    });

  for (const t of TOOLS) addToolCommand(program, t);

  program
    .command('tool_list')
    .description('List MCP tools (name, description, inputSchema) exposed by this version')
    .option('--remote', 'only tools available in remote/HTTP mode')
    .action((o) => emit({ version: VERSION, tools: listTools(!o.remote) }));

  program
    .command('mcp')
    .description('Run the Hi3D MCP server (stdio by default; --http <port> for Streamable HTTP)')
    .option('--http [port]', 'serve Streamable HTTP on this port (remote mode)')
    .option('--require-auth', 'HTTP: reject requests without Authorization header')
    .action(async (o) => {
      if (o.http !== undefined) await runHttp(Number(o.http) || 8787, { requireAuth: !!o.requireAuth });
      else await runStdio({ outDir: program.opts().out });
    });

  program
    .command('docs')
    .description('Print the agent-facing usage reference (what the SKILL.md teaches)')
    .action(async () => {
      const { AGENT_DOCS } = await import('./docs.js');
      process.stdout.write(AGENT_DOCS);
    });

  return program;
}
