import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDir } from '@hi3d/core';

/** ~/.hi3d/blender — managed environments, detection cache, logs. */
export function blenderHome(): string {
  return process.env.HI3D_BLENDER_HOME || path.join(configDir(), 'blender');
}
export function envDir(bpyMajorMinor: string): string {
  return path.join(blenderHome(), 'envs', `bpy-${bpyMajorMinor}`);
}
export function envPython(dir: string): string {
  return process.platform === 'win32' ? path.join(dir, 'Scripts', 'python.exe') : path.join(dir, 'bin', 'python');
}

/** python/executor.py next to the built code: packages/blender/python in dev, release/hi3d-cli/python in the bundle. */
export function executorScriptPath(): string {
  if (process.env.HI3D_BLENDER_EXECUTOR) return process.env.HI3D_BLENDER_EXECUTOR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const tried: string[] = [];
  for (const rel of ['../python/executor.py', '../../python/executor.py', './python/executor.py', '../../../packages/blender/python/executor.py']) {
    const p = path.resolve(here, rel);
    tried.push(p);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`executor.py not found; tried:\n  ${tried.join('\n  ')}`);
}

export function tmpDir(): string {
  return process.env.HI3D_TMP || os.tmpdir();
}
