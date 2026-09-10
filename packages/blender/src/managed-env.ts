/**
 * `hi3d-cli blender setup`: create ~/.hi3d/blender/envs/bpy-X.Y with a matching Python and `pip install bpy`.
 * Python is obtained from (in order): --python, `uv` (downloads CPython if needed), a system interpreter of the
 * exact required minor version. bpy is installed from PyPI only, pinned, wheels only.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BlenderError } from './errors.js';
import { BpyRelease, installableReleases, platformKey, appInstallHint } from './matrix.js';
import { envDir, envPython, executorScriptPath } from './paths.js';
import { probePython } from './detect.js';

export interface SetupOptions {
  bpy?: string;
  python?: string;
  force?: boolean;
  log?: (m: string) => void;
  /** run a command with inherited stdio (progress) or captured */
  quiet?: boolean;
}

function run(cmd: string, args: string[], log?: (m: string) => void, quiet = false): { ok: boolean; out: string } {
  log?.(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: quiet ? 'pipe' : ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  if (!quiet && out.trim()) log?.(out.trim().split('\n').slice(-8).join('\n'));
  return { ok: r.status === 0, out };
}

function which(bin: string): string | undefined {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const ext of exts) {
      const p = path.join(dir, bin + ext);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {
        /* next */
      }
    }
  }
  return undefined;
}

function pythonMinor(py: string): string | undefined {
  const r = spawnSync(py, ['-c', 'import sys;print("%d.%d"%sys.version_info[:2])'], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

/** Find a system interpreter of exactly `minor` (e.g. "3.13"). */
export function findSystemPython(minor: string): string | undefined {
  const names = process.platform === 'win32' ? [`python${minor}`, 'python3', 'python'] : [`python${minor}`, 'python3', 'python'];
  for (const n of names) {
    const p = which(n);
    if (p && pythonMinor(p) === minor) return p;
  }
  if (process.platform === 'win32') {
    const py = which('py');
    if (py) {
      const r = spawnSync(py, [`-${minor}`, '-c', 'import sys;print(sys.executable)'], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
      if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
    }
  }
  return undefined;
}

export function pickRelease(want?: string): BpyRelease {
  const list = installableReleases();
  if (!list.length) throw new BlenderError(`No bpy wheel is published for ${platformKey()}. Install the Blender app instead: ${appInstallHint()}`, 'NO_BPY_WHEEL');
  if (want) {
    const r = list.find((x) => want.startsWith(x.bpy));
    if (!r) throw new BlenderError(`bpy ${want} is not installable here; choose one of ${list.map((x) => x.bpy).join(', ')}`, 'NO_BPY_WHEEL');
    return r;
  }
  return list[0];
}

export interface SetupResult {
  envDir: string;
  python: string;
  bpy: string;
  blender?: string;
  pythonVersion?: string;
  seconds: number;
  reused: boolean;
}

export function setupManagedEnv(o: SetupOptions = {}): SetupResult {
  const log = o.log ?? (() => {});
  const rel = pickRelease(o.bpy);
  const dir = envDir(rel.bpy);
  const py = envPython(dir);
  const t0 = Date.now();
  if (fs.existsSync(py) && !o.force) {
    const info = probePython(py, 'managed', 'managed');
    if (info.ok) return { envDir: dir, python: py, bpy: rel.bpy, blender: info.blenderVersion, pythonVersion: info.pythonVersion, seconds: 0, reused: true };
    log(`existing env at ${dir} is broken (${info.error}); recreating`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });

  // 1. create venv with the right Python
  const uv = which('uv');
  let usedPython = o.python;
  if (usedPython) {
    const minor = pythonMinor(usedPython);
    if (minor !== rel.python) throw new BlenderError(`bpy ${rel.bpy} needs Python ${rel.python}, but ${usedPython} is ${minor}`, 'BLENDER_SETUP_REQUIRED');
    if (!run(usedPython, ['-m', 'venv', dir], log, o.quiet).ok) throw new BlenderError('python -m venv failed', 'BLENDER_SETUP_REQUIRED');
  } else if (uv) {
    log(`using uv to provision Python ${rel.python}`);
    if (!run(uv, ['venv', '--python', rel.python, dir], log, o.quiet).ok) throw new BlenderError('uv venv failed', 'BLENDER_SETUP_REQUIRED');
  } else {
    const sys = findSystemPython(rel.python);
    if (!sys) {
      throw new BlenderError(
        `Python ${rel.python} is required for bpy ${rel.bpy} and was not found. Install uv (https://docs.astral.sh/uv/ — it downloads Python for you) or Python ${rel.python} from https://www.python.org/downloads/, or install the Blender app (${appInstallHint()}).`,
        'BLENDER_SETUP_REQUIRED',
      );
    }
    usedPython = sys;
    if (!run(sys, ['-m', 'venv', dir], log, o.quiet).ok) throw new BlenderError('python -m venv failed', 'BLENDER_SETUP_REQUIRED');
  }

  // 2. install bpy (wheels only, pinned major.minor)
  const spec = `bpy==${rel.bpy}.*`;
  log(`installing ${spec} (~${rel.approxMb} MB download)`);
  const ok = uv ? run(uv, ['pip', 'install', '--python', py, '--only-binary=:all:', spec], log, o.quiet).ok : run(py, ['-m', 'pip', 'install', '--only-binary=:all:', spec], log, o.quiet).ok;
  if (!ok) throw new BlenderError(`pip install ${spec} failed`, 'BLENDER_SETUP_REQUIRED');

  // 3. verify
  const info = probePython(py, 'managed', 'managed');
  if (!info.ok) throw new BlenderError(`bpy installed but selfcheck failed: ${info.error}`, 'BLENDER_SETUP_REQUIRED');
  fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify({ bpy: rel.bpy, blender: info.blenderVersion, python: py, pythonVersion: info.pythonVersion, platform: platformKey(), createdAt: new Date().toISOString(), executor: executorScriptPath() }, null, 2));
  return { envDir: dir, python: py, bpy: rel.bpy, blender: info.blenderVersion, pythonVersion: info.pythonVersion, seconds: Math.round((Date.now() - t0) / 1000), reused: false };
}

export function removeManagedEnv(bpy?: string): string[] {
  const removed: string[] = [];
  const base = path.dirname(envDir('x'));
  for (const n of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    if (!n.startsWith('bpy-')) continue;
    if (bpy && n !== `bpy-${bpy}`) continue;
    fs.rmSync(path.join(base, n), { recursive: true, force: true });
    removed.push(path.join(base, n));
  }
  return removed;
}
