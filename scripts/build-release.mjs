#!/usr/bin/env node
/**
 * Bundle the CLI into a single self-contained npm package: release/hi3d-cli/
 *   node scripts/build-release.mjs            → release/hi3d-cli/{package.json, bin/hi3d-cli.mjs, README.md, LICENSE}
 *   npm pack ./release/hi3d-cli               → hi3d-cli-<version>.tgz  (what `npm publish` ships)
 * Pure JS, no native modules, Node >= 18, works on macOS / Windows / Linux.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'release', 'hi3d-cli');
const cliPkg = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'hi3d-cli', 'package.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'bin'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'packages', 'cli', 'src', 'main.ts')],
  outfile: path.join(out, 'bin', 'hi3d-cli.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node18'],
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  // CJS deps (commander, tos-sdk, axios…) need `require` inside an ESM bundle
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __dirname_ } from 'node:path';",
      'const __filename = __fileURLToPath(import.meta.url); const __dirname = __dirname_(__filename);',
    ].join('\n'),
  },
  define: {
    // optional build-time injection of site constants (kept out of git): HI3D_WEB_APPID, HI3D_WEB_PASSWORD_KEY, HI3D_TOS_*
    ...Object.fromEntries(
      ['HI3D_WEB_CONSTANTS_JSON', 'HI3D_WEB_APPID', 'HI3D_WEB_PASSWORD_KEY', 'HI3D_TOS_REGION', 'HI3D_TOS_ENDPOINT', 'HI3D_TOS_BUCKET', 'HI3D_TOS_ASSET_HOST']
        .filter((k) => process.env[k])
        .map((k) => [`process.env.${k}`, JSON.stringify(process.env[k])]),
    ),
  },
  logLevel: 'warning',
});
fs.chmodSync(path.join(out, 'bin', 'hi3d-cli.mjs'), 0o755);

const pkg = {
  name: cliPkg.name,
  version: cliPkg.version,
  description: cliPkg.description,
  license: cliPkg.license,
  homepage: cliPkg.homepage,
  repository: cliPkg.repository,
  keywords: cliPkg.keywords,
  type: 'module',
  bin: { 'hi3d-cli': 'bin/hi3d-cli.mjs' },
  files: ['bin', 'README.md', 'LICENSE'],
  engines: { node: '>=18' },
  os: ['darwin', 'linux', 'win32'],
};
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
for (const f of ['README.md', 'LICENSE']) {
  const src = path.join(root, 'packages', 'hi3d-cli', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f));
}
const size = fs.statSync(path.join(out, 'bin', 'hi3d-cli.mjs')).size;
console.log(`release/hi3d-cli ready: ${pkg.name}@${pkg.version}, bin/hi3d-cli.mjs ${(size / 1024).toFixed(0)} KB`);
