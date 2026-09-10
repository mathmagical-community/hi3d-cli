/**
 * Protocol + detection tests that need NO bpy: run executor.py with plain python (ops needing bpy fail cleanly),
 * and detect a fake `blender` app on PATH (verifies --version parsing and launch argv). Run: node test/blender-protocol.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlenderExecutor, BlenderSession, detectBackends, launchArgs, resolveBackend, blenderStatus } from '@hi3d/blender';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hi3d-bl-'));
process.env.HI3D_CONFIG_DIR = path.join(tmp, 'home');
process.env.HI3D_BLENDER_HOME = path.join(tmp, 'blender-home');
const py = process.env.PLAIN_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
let n = 0;
const ok = (m) => console.log(`  ok ${++n} ${m}`);

// 1. executor with a bpy-less python: handshake, ping, unknown op, bpy op error, close
{
  const ex = new BlenderExecutor({ backend: { kind: 'python', command: [py], path: py, source: 'env', ok: true }, cwd: tmp, log: () => {} });
  const ready = await ex.start();
  assert.equal(ready.event, 'ready');
  assert.ok(Array.isArray(ready.ops) && ready.ops.includes('scale_to_size'));
  ok('ready handshake ' + JSON.stringify({ backend: ready.backend, python: ready.python }));
  const p = await ex.call('ping');
  assert.equal(p.pong, true);
  ok('ping');
  await assert.rejects(ex.call('nope'), /unknown op/);
  ok('unknown op → error');
  if (!(await ex.call('info')).bpy) {
    await assert.rejects(ex.call('inspect'), /ModuleNotFoundError|No module named 'bpy'/);
    ok('bpy op without bpy → clean error');
  } else ok('python has bpy; skipped no-bpy check');
  await assert.rejects(ex.call('ping', {}, 1), /timed out|timeout/i).catch(() => {}); // may resolve fast; just must not hang
  ex.close();
  assert.equal(ex.alive, false);
  ok('close');
}

// 2. path confinement without any backend
{
  const s = new BlenderSession({ workspace: tmp, log: () => {} });
  assert.throws(() => s.resolve('../x.glb'), /PATH_OUTSIDE_WORKSPACE|outside the workspace/);
  assert.throws(() => s.resolve('/etc/passwd'), /outside the workspace/);
  assert.equal(s.resolve('a/b.glb'), path.join(tmp, 'a', 'b.glb'));
  const open = new BlenderSession({ workspace: tmp, confinePaths: false });
  assert.equal(open.resolve('/x/y.glb'), path.resolve(tmp, '/x/y.glb')); // on Windows a drive-less absolute path takes the workspace's drive
  ok('workspace confinement');
}

// 3. no backend at all → status not ready with a hint (PATH emptied, no managed env)
{
  const savedPath = process.env.PATH;
  process.env.PATH = path.join(tmp, 'empty-bin');
  fs.mkdirSync(process.env.PATH, { recursive: true });
  delete process.env.HI3D_BLENDER;
  const st = blenderStatus({ refresh: true });
  assert.equal(st.ready, false);
  assert.ok(st.setup_hint && st.app_install_hint);
  ok('no backend → hint: ' + st.setup_hint.split('\n')[0].slice(0, 80));
  process.env.PATH = savedPath;
}

// 4. fake blender app on PATH (bash shim on POSIX, .cmd shim on Windows, both run fake-blender.mjs)
{
  const fakeDir = path.resolve('test/fake-blender');
  const savedPath = process.env.PATH;
  process.env.PATH = fakeDir + path.delimiter + savedPath;
  process.env.FAKE_BLENDER_PYTHON = py;
  const all = detectBackends({ refresh: true });
  console.log('  candidates:', JSON.stringify(all.map((b) => ({ kind: b.kind, path: b.path, ok: b.ok, v: b.blenderVersion, err: b.error }))));
  const found = all.filter((b) => b.kind === 'app');
  assert.ok(found.length >= 1, 'fake blender detected (PATH=' + process.env.PATH.split(path.delimiter)[0] + ')');
  const app = found.find((b) => b.path.startsWith(fakeDir));
  assert.ok(app && app.ok && app.blenderVersion.startsWith('5.2.1'), JSON.stringify(found));
  ok('app detected via PATH: ' + app.blenderVersion);
  const argv = launchArgs(app);
  assert.deepEqual(argv.slice(1, 8), ['-b', '--factory-startup', '--disable-autoexec', '-noaudio', '--python-exit-code', '1', '--python']);
  assert.deepEqual(argv.slice(-3), ['--', '--channel', 'stdio']);
  ok('app launch argv');
  const r = resolveBackend({ refresh: true });
  assert.equal(r.backend?.path, app.path, 'app preferred over managed env');
  ok('app preferred');
  const ex = new BlenderExecutor({ backend: app, cwd: tmp, log: () => {} });
  const ready = await ex.start();
  assert.equal(ready.event, 'ready');
  assert.equal((await ex.call('ping')).pong, true);
  ex.close();
  ok('executor through the app launcher (stdout noise ignored)');
  // explicit override wins and is reported as source=env
  process.env.HI3D_BLENDER = 'app:' + app.path;
  const r2 = resolveBackend({ refresh: true });
  assert.equal(r2.backend?.source, 'env');
  delete process.env.HI3D_BLENDER;
  ok('HI3D_BLENDER override');
  process.env.PATH = savedPath;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('blender-protocol: ALL OK');
