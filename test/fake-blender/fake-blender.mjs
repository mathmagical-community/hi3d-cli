// Cross-platform fake Blender app for tests: answers `--version`, and for `--python <script> -- <args>` runs the
// script with plain python (like `blender -b --python` would) after printing some stdout noise.
import { spawnSync } from 'node:child_process';
const argv = process.argv.slice(2);
if (argv.includes('--version')) {
  process.stdout.write('Blender 5.2.1 LTS\n\tbuild date: 2026-07-01\n');
  process.exit(0);
}
const i = argv.indexOf('--python');
if (i < 0) {
  process.stderr.write('fake blender: no --python\n');
  process.exit(2);
}
const script = argv[i + 1];
const dd = argv.indexOf('--');
const rest = dd >= 0 ? argv.slice(dd + 1) : [];
process.stdout.write(`Blender 5.2.1 LTS (fake) ${argv.join(' ')}\n`); // stdout noise, must not break the protocol
const py = process.env.FAKE_BLENDER_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const r = spawnSync(py, ['-u', script, '--', ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
