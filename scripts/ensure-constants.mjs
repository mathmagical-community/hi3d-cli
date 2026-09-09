// Create packages/core/src/web-constants.ts from the example when it is absent (CI, fresh clones).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'core', 'src');
const target = path.join(dir, 'web-constants.ts');
if (!fs.existsSync(target)) {
  fs.copyFileSync(path.join(dir, 'web-constants.example.ts'), target);
  console.log('web-constants.ts created from example (web mode disabled until configured)');
}
