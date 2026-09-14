/** Once-a-day hint on stderr when a newer version is on npm (logic lives in @hi3d/core). */
import { checkLatestVersion } from '@hi3d/core';

export async function checkForUpdate(pkg: string, current: string): Promise<void> {
  const u = await checkLatestVersion(current, pkg);
  if (u.update_available) process.stderr.write(`hi3d-cli ${current} → ${u.latest} available: ${u.update_command}\n`);
}
