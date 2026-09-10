/**
 * Find a way to run Blender headless. Order:
 *   1. HI3D_BLENDER env (app:/path | python:/path | managed) or config.blender (set by `hi3d-cli blender use`)
 *   2. installed Blender app on PATH or in well-known locations  (preferred: zero install)
 *   3. managed env ~/.hi3d/blender/envs/bpy-X.Y (created by `hi3d-cli blender setup`)
 *   4. (doctor / --refresh only) any python on PATH that can `import bpy`
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '@hi3d/core';
import { MIN_BLENDER, parseVersion, versionAtLeast, appInstallHint } from './matrix.js';
import { blenderHome, envPython, executorScriptPath } from './paths.js';

export type BackendKind = 'app' | 'managed' | 'python';

export interface BackendInfo {
  kind: BackendKind;
  /** argv prefix that launches the executor when `executorScriptPath()` and protocol flags are appended */
  command: string[];
  path: string;
  blenderVersion?: string;
  pythonVersion?: string;
  source: 'env' | 'config' | 'path' | 'well-known' | 'managed' | 'python';
  ok: boolean;
  error?: string;
}

interface CacheEntry {
  info: BackendInfo;
  mtimeMs: number;
  size: number;
  checkedAt: number;
}

function cachePath(): string {
  return path.join(blenderHome(), 'detect.json');
}
function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), 'utf8'));
  } catch {
    return {};
  }
}
function writeCache(c: Record<string, CacheEntry>) {
  try {
    fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
    fs.writeFileSync(cachePath(), JSON.stringify(c, null, 2));
  } catch {
    /* ignore */
  }
}

function which(bin: string): string[] {
  const out: string[] = [];
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, bin + ext);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        if (fs.statSync(p).isFile()) out.push(p);
      } catch {
        /* next */
      }
    }
  }
  return out;
}

function globDirs(base: string, prefix: string): string[] {
  try {
    return fs
      .readdirSync(base)
      .filter((n) => n.startsWith(prefix))
      .sort()
      .reverse()
      .map((n) => path.join(base, n));
  } catch {
    return [];
  }
}

/** Candidate Blender executables in well-known places (not verified yet). */
export function wellKnownBlenderPaths(): string[] {
  const c: string[] = [];
  if (process.platform === 'darwin') {
    c.push('/Applications/Blender.app/Contents/MacOS/Blender', path.join(os.homedir(), 'Applications/Blender.app/Contents/MacOS/Blender'));
    for (const d of globDirs('/Applications', 'Blender')) c.push(path.join(d, 'Contents/MacOS/Blender'));
  } else if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], path.join(process.env.LOCALAPPDATA ?? '', 'Programs')].filter(Boolean) as string[]) {
      for (const d of globDirs(path.join(base, 'Blender Foundation'), 'Blender')) c.push(path.join(d, 'blender.exe'));
    }
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean) as string[]) {
      c.push(path.join(base, 'Steam', 'steamapps', 'common', 'Blender', 'blender.exe'));
    }
  } else {
    c.push('/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender', '/var/lib/flatpak/exports/bin/org.blender.Blender', path.join(os.homedir(), '.local/share/flatpak/exports/bin/org.blender.Blender'));
    for (const d of [...globDirs('/opt', 'blender'), ...globDirs(os.homedir(), 'blender-')]) c.push(path.join(d, 'blender'));
  }
  return [...new Set(c)].filter((p) => fs.existsSync(p));
}

/** Run `<blender> -b --version` and parse the version. */
export function probeBlenderApp(exe: string, source: BackendInfo['source']): BackendInfo {
  const r = spawnSync(exe, ['-b', '--version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const m = out.match(/Blender\s+(\d+\.\d+(?:\.\d+)?)/);
  const v = m ? parseVersion(m[1]) : undefined;
  if (r.error || !v) return { kind: 'app', command: [exe], path: exe, source, ok: false, error: r.error?.message ?? `could not parse version from: ${out.slice(0, 120)}` };
  if (!versionAtLeast(v, MIN_BLENDER)) return { kind: 'app', command: [exe], path: exe, blenderVersion: m![1], source, ok: false, error: `Blender ${m![1]} is older than ${MIN_BLENDER.join('.')}` };
  return { kind: 'app', command: [exe], path: exe, blenderVersion: m![1], source, ok: true };
}

/** Run `<python> executor.py --selfcheck`. */
export function probePython(py: string, kind: 'managed' | 'python', source: BackendInfo['source']): BackendInfo {
  const r = spawnSync(py, ['-u', executorScriptPath(), '--selfcheck'], { encoding: 'utf8', timeout: 120_000, windowsHide: true });
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('HI3D:'));
  let j: { bpy?: boolean; blender?: string; python?: string; error?: string } = {};
  try {
    if (line) j = JSON.parse(line.slice(5));
  } catch {
    /* ignore */
  }
  if (r.error || !j.bpy) return { kind, command: [py], path: py, pythonVersion: j.python, source, ok: false, error: r.error?.message ?? j.error ?? (r.stderr ?? '').slice(-200) };
  const v = parseVersion(j.blender ?? '');
  if (v && !versionAtLeast(v, MIN_BLENDER)) return { kind, command: [py], path: py, blenderVersion: j.blender, pythonVersion: j.python, source, ok: false, error: `bpy ${j.blender} is older than ${MIN_BLENDER.join('.')}` };
  return { kind, command: [py], path: py, blenderVersion: j.blender, pythonVersion: j.python, source, ok: true };
}

function cached(key: string, probe: () => BackendInfo, refresh: boolean): BackendInfo {
  const c = readCache();
  let st: fs.Stats | undefined;
  try {
    st = fs.statSync(key);
  } catch {
    /* missing */
  }
  const e = c[key];
  if (!refresh && e && st && e.mtimeMs === st.mtimeMs && e.size === st.size && Date.now() - e.checkedAt < 7 * 24 * 3600e3) return e.info;
  const info = probe();
  if (st) {
    c[key] = { info, mtimeMs: st.mtimeMs, size: st.size, checkedAt: Date.now() };
    writeCache(c);
  }
  return info;
}

export function managedEnvs(): { dir: string; python: string; meta?: Record<string, unknown> }[] {
  const base = path.join(blenderHome(), 'envs');
  return globDirs(base, 'bpy-')
    .map((dir) => {
      let meta: Record<string, unknown> | undefined;
      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'));
      } catch {
        /* none */
      }
      return { dir, python: envPython(dir), meta };
    })
    .filter((e) => fs.existsSync(e.python));
}

export interface DetectOptions {
  refresh?: boolean;
  /** also try `python3`/`python` on PATH (slow) */
  deep?: boolean;
  log?: (m: string) => void;
}

/** All candidates, verified, in preference order. */
export function detectBackends(o: DetectOptions = {}): BackendInfo[] {
  const out: BackendInfo[] = [];
  const seen = new Set<string>();
  const add = (info: BackendInfo) => {
    if (seen.has(info.path)) return;
    seen.add(info.path);
    out.push(info);
  };
  // 1. explicit
  const spec = process.env.HI3D_BLENDER ?? loadConfig().blender;
  if (spec) {
    const src: BackendInfo['source'] = process.env.HI3D_BLENDER ? 'env' : 'config';
    if (spec.startsWith('app:')) add(cached(spec.slice(4), () => probeBlenderApp(spec.slice(4), src), !!o.refresh));
    else if (spec.startsWith('python:')) add(cached(spec.slice(7), () => probePython(spec.slice(7), 'python', src), !!o.refresh));
    else if (spec === 'managed') for (const e of managedEnvs()) add(cached(e.python, () => probePython(e.python, 'managed', src), !!o.refresh));
    else if (fs.existsSync(spec)) {
      const st = fs.statSync(spec);
      if (st.isDirectory()) add(cached(spec, () => probePython(envPython(spec), 'managed', src), !!o.refresh));
      else if (/python[\d.]*(\.exe)?$/i.test(spec)) add(cached(spec, () => probePython(spec, 'python', src), !!o.refresh));
      else add(cached(spec, () => probeBlenderApp(spec, src), !!o.refresh));
    }
  }
  // 2. installed app
  for (const exe of which('blender')) add(cached(exe, () => probeBlenderApp(exe, 'path'), !!o.refresh));
  for (const exe of wellKnownBlenderPaths()) add(cached(exe, () => probeBlenderApp(exe, 'well-known'), !!o.refresh));
  // 3. managed env
  for (const e of managedEnvs()) add(cached(e.python, () => probePython(e.python, 'managed', 'managed'), !!o.refresh));
  // 4. deep: any python with bpy
  if (o.deep) {
    for (const py of [...(process.env.HI3D_PYTHON ? [process.env.HI3D_PYTHON] : []), ...which('python3'), ...which('python')]) {
      add(cached(py, () => probePython(py, 'python', 'python'), true));
    }
  }
  return out;
}

/** The backend to use, or null with a hint. */
export function resolveBackend(o: DetectOptions = {}): { backend: BackendInfo | null; candidates: BackendInfo[]; hint?: string } {
  const candidates = detectBackends(o);
  const backend = candidates.find((c) => c.ok) ?? null;
  const hint = backend
    ? undefined
    : `No usable Blender found. Either install Blender 4.2+ (${appInstallHint()}) or run \`hi3d-cli blender setup\` to create a managed Python environment with the bpy module.`;
  return { backend, candidates, hint };
}
