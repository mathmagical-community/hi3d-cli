/** Once-a-day hint on stderr when a newer version is on npm. Never blocks longer than 1.5 s, never throws. */
import fs from 'node:fs';
import path from 'node:path';
import { configDir } from '@hi3d/core';

const DAY = 24 * 60 * 60 * 1000;

function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

export async function checkForUpdate(pkg: string, current: string): Promise<void> {
  if (process.env.HI3D_NO_UPDATE_CHECK || process.env.CI) return;
  const stamp = path.join(configDir(), '.update-check.json');
  let cache: { at?: number; latest?: string } = {};
  try {
    cache = JSON.parse(fs.readFileSync(stamp, 'utf8'));
  } catch {
    /* none */
  }
  let latest = cache.latest;
  if (!cache.at || Date.now() - cache.at > DAY) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (res.ok) latest = ((await res.json()) as { version?: string }).version;
    } catch {
      /* offline */
    } finally {
      clearTimeout(t);
    }
    try {
      fs.mkdirSync(path.dirname(stamp), { recursive: true });
      fs.writeFileSync(stamp, JSON.stringify({ at: Date.now(), latest }));
    } catch {
      /* read-only */
    }
  }
  if (latest && newer(latest, current)) {
    process.stderr.write(`hi3d ${current} → ${latest} available: npm i -g ${pkg}@latest\n`);
  }
}
