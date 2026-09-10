/**
 * Spawn helpers. Node >= 18.20 / 20.12 refuses to spawn `.cmd` / `.bat` files on Windows without `shell: true`
 * (EINVAL, CVE-2024-27980). Real Blender is `blender.exe`, but shims and test doubles are `.cmd`, so every spawn in
 * this package goes through here: batch files get a shell and every argument is quoted for cmd.exe.
 */
import { spawn, spawnSync, SpawnOptions, SpawnSyncOptions, ChildProcess, SpawnSyncReturns } from 'node:child_process';

export function needsShell(exe: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe);
}

function quoteForCmd(a: string): string {
  return /[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
}

function prepare(exe: string, args: string[]): { file: string; args: string[]; shell: boolean } {
  if (!needsShell(exe)) return { file: exe, args, shell: false };
  return { file: quoteForCmd(exe), args: args.map(quoteForCmd), shell: true };
}

export function spawnSyncX(exe: string, args: string[], opts: SpawnSyncOptions = {}): SpawnSyncReturns<string> {
  const p = prepare(exe, args);
  return spawnSync(p.file, p.args, { ...opts, shell: p.shell || opts.shell, windowsHide: true }) as SpawnSyncReturns<string>;
}

export function spawnX(exe: string, args: string[], opts: SpawnOptions = {}): ChildProcess {
  const p = prepare(exe, args);
  return spawn(p.file, p.args, { ...opts, shell: p.shell || opts.shell, windowsHide: true });
}
