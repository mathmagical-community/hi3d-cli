/**
 * Builds the `hi3d-cli` commander program: login/configure, Hi3D commands, MCP server.
 * Pure JS; runs on macOS / Windows / Linux with Node >= 18.
 */
import fs from 'node:fs';
import { Command, Option } from 'commander';
import { z } from 'zod';
import { Hi3DError, NPM_PACKAGE_NAME, configPath, describeProfile, loadProfile } from '@hi3d/core';
import { activeTools, listTools, makeContext, runStdio, runHttp, ToolResult, ToolDef } from '@hi3d/mcp';
import { registerBlenderCommands } from './blender-cmds.js';
import { registerAuthCommands } from './auth-cmds.js';
import { checkForUpdate } from './update-check.js';

export const VERSION = '2.1.1-rc.1';
/** npm package name used for the update hint; overridden at release build via NPM_PACKAGE_NAME */
export const PACKAGE_NAME = NPM_PACKAGE_NAME;

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
  retexture_model: 'mesh',
  blender_load: 'path',
  blender_export: 'path',
  blender_run_script: 'code',
  blender_session: 'action',
  blender_scale_to_size: 'size_mm',
  blender_decimate: 'target_faces',
  blender_delete_objects: 'names',
  blender_join: 'names',
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

const SCALAR_KINDS = new Set(['number', 'int', 'string', 'boolean', 'enum', 'literal']);
function unionOptions(s: ZodAny): ZodAny[] {
  return ((s as { def?: { options?: ZodAny[] } }).def?.options ?? []) as ZodAny[];
}
function unionHasArray(s: ZodAny): boolean {
  return unionOptions(s).some((o) => kindOf(unwrap(o).inner) === 'array');
}

/**
 * Shell arguments arrive as strings (or string arrays for variadic options); convert them to what the
 * zod schema expects: number elements inside arrays, numbers in number|number[] unions, booleans.
 * Values that do not look numeric are left untouched so zod reports the real problem.
 */
export function coerceCliValue(schema: ZodAny, v: unknown): unknown {
  const { inner } = unwrap(schema);
  const kind = kindOf(inner);
  const def = (inner as { def?: { element?: ZodAny } }).def;
  if (kind === 'array') {
    const el = def?.element;
    const arr = Array.isArray(v) ? v : [v];
    return el ? arr.map((x) => coerceCliValue(el, x)) : arr;
  }
  if (kind === 'number' || kind === 'int') return typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
  if (kind === 'boolean') return v === 'true' ? true : v === 'false' ? false : v;
  if (kind === 'union') {
    const opts = unionOptions(inner);
    const arr = Array.isArray(v) ? v : [v];
    const scalar = opts.find((o) => SCALAR_KINDS.has(kindOf(unwrap(o).inner)));
    const array = opts.find((o) => kindOf(unwrap(o).inner) === 'array');
    if (arr.length === 1 && scalar && !(Array.isArray(v) && !array)) return coerceCliValue(scalar, arr[0]);
    if (array) return coerceCliValue(array, arr);
    return v;
  }
  return v;
}

function addToolCommand(program: Command, t: ToolDef) {
  const cmd = program.command(t.name).description(t.description);
  const pos = POSITIONAL[t.name];
  const posKind = pos ? kindOf(unwrap((t.schema as Record<string, ZodAny>)[pos]).inner) : '';
  if (pos) cmd.argument(posKind === 'array' ? `[${pos}...]` : `[${pos}]`, `same as --${pos}`);
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
    } else if (kind === 'array' || (kind === 'union' && unionHasArray(inner))) cmd.addOption(new Option(`--${flag} <values...>`, desc));
    else if (kind === 'number' || kind === 'int') cmd.addOption(new Option(`--${flag} <n>`, desc).argParser(Number));
    else if (kind === 'enum') cmd.addOption(new Option(`--${flag} <value>`, desc).choices(enumValues(inner) ?? []));
    else cmd.addOption(new Option(`--${flag} <value>`, desc));
  }
  cmd.action(async (...cliArgs: unknown[]) => {
    const opts = cliArgs[cliArgs.length - 2] as Record<string, unknown>;
    const args: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const camel = key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
      if (opts[camel] !== undefined) args[key] = coerceCliValue(shape[key], opts[camel]);
    }
    if (pos && args[pos] === undefined) {
      const v = cliArgs[0];
      if (typeof v === 'string' || (Array.isArray(v) && v.length)) args[pos] = coerceCliValue(shape[pos], v);
    }
    if (t.name === 'blender_run_script' && typeof args.code === 'string' && args.code.startsWith('@')) args.code = fs.readFileSync(args.code.slice(1), 'utf8');
    const parsed = z.object(t.schema).safeParse(args);
    if (!parsed.success) fail(new Hi3DError('Invalid arguments: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), { code: 'BAD_ARGS', status: 400 }));
    const ctx = makeContext({ mode: 'local', outDir: program.opts().out, workspace: program.opts().workspace, confinePaths: !program.opts().allowAnyPath, clientInfo: { channel: 'cli', version: VERSION }, log });
    try {
      const r = await t.handler(parsed.data, ctx);
      emit(r instanceof ToolResult ? r.body : r);
    } catch (e) {
      fail(e);
    } finally {
      ctx.dispose();
    }
  });
}

export function buildProgram(): Command {
  const program = new Command('hi3d-cli')
    .version(VERSION, '-V, --version', 'print version')
    .description(`hi3d-cli ${VERSION} — image to 3D for terminals and AI agents. All output is JSON: { ok, status, body }.`)
    .option('--out <dir>', 'default download directory (default: <workspace>/hi3d-out)', process.env.HI3D_OUT_DIR)
    .option('--workspace <dir>', 'directory Blender/file commands are confined to (default: cwd)', process.env.HI3D_WORKSPACE)
    .option('--allow-any-path', 'let Blender commands read/write outside the workspace')
    .option('--no-update-check', 'skip the once-a-day new-version hint')
    .showHelpAfterError()
    .hook('preAction', async (thisCmd) => {
      if (thisCmd.opts().updateCheck !== false) await checkForUpdate(PACKAGE_NAME, VERSION).catch(() => {});
    });

  registerAuthCommands(program, emit, fail, { channel: 'cli', version: VERSION });

  program
    .command('status')
    .description('Show the active profile (no API call)')
    .action(() => {
      const p = loadProfile();
      emit({ version: VERSION, profile: p ? { ...describeProfile(p), source: p.name === 'env' ? 'env' : configPath() } : null });
    });

  for (const t of activeTools({ local: true })) addToolCommand(program, t);
  registerBlenderCommands(program, emit, fail, log);

  program
    .command('tool_list')
    .description('List MCP tools (name, description, inputSchema) exposed by this version')
    .option('--remote', 'only tools available in remote/HTTP mode')
    .option('--no-scripts', 'hide blender_run_script (as `mcp --no-scripts` does)')
    .action((o) => emit({ version: VERSION, tools: listTools(!o.remote, o.scripts !== false) }));

  program
    .command('mcp')
    .description('Run the Hi3D MCP server (stdio by default; --http <port> for Streamable HTTP)')
    .option('--http [port]', 'serve Streamable HTTP on this port (remote mode)')
    .option('--require-auth', 'HTTP: reject requests without Authorization header')
    .option('--no-scripts', 'do not expose blender_run_script (only fixed recipes)')
    .action(async (o) => {
      if (o.http !== undefined) await runHttp(Number(o.http) || 8787, { requireAuth: !!o.requireAuth, version: VERSION });
      else await runStdio({ version: VERSION, outDir: program.opts().out, workspace: program.opts().workspace, confinePaths: !program.opts().allowAnyPath, scripts: o.scripts !== false });
    });

  program
    .command('docs')
    .description('Print the agent-facing usage reference (what the SKILL.md teaches)')
    .action(async () => {
      const { AGENT_DOCS } = await import('./docs.js');
      process.stdout.write(AGENT_DOCS);
    });

  // no sub-command → help (exit 0)
  program.action(() => {
    program.outputHelp();
  });
  return program;
}
