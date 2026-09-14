/**
 * "Is a newer hi3d-cli on npm?" — cached once a day in ~/.hi3d/.update-check.json, never blocks longer than
 * 1.5 s, never throws, disabled by HI3D_NO_UPDATE_CHECK or CI. Used for the CLI's stderr hint and for the
 * `client` block in who_am_i so agents can tell users to upgrade.
 */
import fs from 'node:fs';
import path from 'node:path';
import { configDir } from './config.js';

const DAY = 24 * 60 * 60 * 1000;
/** published npm name; the release build bakes HI3D_NPM_NAME */
export const NPM_PACKAGE_NAME = process.env.HI3D_NPM_NAME ?? '@hi3d/hi3d-cli';

export interface UpdateInfo {
  package: string;
  current: string;
  latest?: string;
  update_available: boolean;
  update_command?: string;
}

/** semver-ish compare on the numeric x.y.z part; pre-release suffixes are ignored */
export function isNewerVersion(candidate: string, current: string): boolean {
  const pa = candidate.split('-')[0].split('.').map(Number);
  const pb = current.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

export async function checkLatestVersion(current: string, pkg = NPM_PACKAGE_NAME): Promise<UpdateInfo> {
  const info: UpdateInfo = { package: pkg, current, update_available: false };
  if (process.env.HI3D_NO_UPDATE_CHECK || process.env.CI) return info;
  const stamp = path.join(configDir(), '.update-check.json');
  let cache: { at?: number; latest?: string; pkg?: string } = {};
  try {
    cache = JSON.parse(fs.readFileSync(stamp, 'utf8'));
  } catch {
    /* none */
  }
  let latest = cache.pkg === pkg ? cache.latest : undefined;
  if (!cache.at || cache.pkg !== pkg || Date.now() - cache.at > DAY) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    try {
      const registry = (process.env.HI3D_NPM_REGISTRY ?? 'https://registry.npmjs.org').replace(/\/+$/, '');
      const res = await fetch(`${registry}/${encodeURIComponent(pkg)}/latest`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (res.ok) latest = ((await res.json()) as { version?: string }).version;
    } catch {
      /* offline */
    } finally {
      clearTimeout(t);
    }
    try {
      fs.mkdirSync(path.dirname(stamp), { recursive: true });
      fs.writeFileSync(stamp, JSON.stringify({ at: Date.now(), latest, pkg }));
    } catch {
      /* read-only */
    }
  }
  if (latest) {
    info.latest = latest;
    if (isNewerVersion(latest, current)) {
      info.update_available = true;
      info.update_command = `npm i -g ${pkg}@latest`;
    }
  }
  return info;
}
