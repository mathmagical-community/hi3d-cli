#!/usr/bin/env node
/** Fail when the release version is inconsistent: packages/hi3d-cli/package.json, cli VERSION, CHANGELOG top entry. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/hi3d-cli/package.json'), 'utf8')).version;
const cli = /export const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(root, 'packages/cli/src/program.ts'), 'utf8'))?.[1];
const changelog = /^## ([^\s(]+)/m.exec(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'))?.[1];
const semver = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const problems = [];
if (!semver.test(pkg)) problems.push(`package.json version "${pkg}" is not semver`);
if (cli !== pkg) problems.push(`packages/cli/src/program.ts VERSION "${cli}" != package.json "${pkg}"`);
if (changelog !== pkg) problems.push(`CHANGELOG.md top entry "${changelog}" != package.json "${pkg}"`);
if (problems.length) {
  for (const p of problems) console.error('::error::' + p);
  process.exit(1);
}
console.log(`version ${pkg}: package.json, cli VERSION and CHANGELOG agree (${pkg.includes('-') ? 'pre-release' : 'stable'})`);
