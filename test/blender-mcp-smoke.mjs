/** Real-bpy MCP check: blender tools listed, scene built, preview returns image content, export + retexture via mock. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ws = process.env.WS;
const t = new StdioClientTransport({ command: 'node', args: [path.resolve('packages/cli/dist/main.js'), '--workspace', ws, 'mcp'], env: process.env, stderr: 'pipe' });
const c = new Client({ name: 't', version: '0' });
await c.connect(t);
const text = (r) => JSON.parse(r.content.find((x) => x.type === 'text').text);
const call = async (name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return r;
};
const tools = (await c.listTools()).tools;
assert.ok(tools.some((x) => x.name === 'blender_render_preview' && x.annotations?.readOnlyHint === true));
assert.ok(tools.some((x) => x.name === 'retexture_model'));
console.log('tools ok:', tools.length);
const st = text(await call('blender_status'));
assert.equal(st.ready, true);
console.log('status ok:', st.backend.kind, st.backend.blender);
await call('blender_session', { action: 'reset' });
const s = text(await call('blender_run_script', { code: 'bpy.ops.mesh.primitive_monkey_add(size=1.5)\nresult={"objs":[o.name for o in D.objects]}' }));
assert.deepEqual(s.result.objs, ['Suzanne']);
console.log('run_script ok');
const ex1 = text(await call('blender_export', { path: 'gen/monkey.glb' }));
assert.ok(ex1.bytes > 1000);
const ld = text(await call('blender_load', { path: 'gen/monkey.glb' }));
assert.equal(ld.totals.objects, 1);
console.log('export+load ok:', ld.totals.faces, 'faces, welded', ld.welded_vertices);
const sc = text(await call('blender_scale_to_size', { size_mm: 50 }));
assert.ok(Math.abs(Math.max(...sc.after.dimensions_m) - 0.05) < 1e-4, JSON.stringify(sc.after));
const rp = text(await call('blender_repair'));
assert.equal(rp.after.non_manifold_edges, 0);
console.log('scale+repair ok');
const rr = await call('blender_render_preview', { views: ['iso'], resolution: 128, samples: 4 });
const img = rr.content.find((x) => x.type === 'image');
assert.ok(img && img.mimeType === 'image/png' && img.data.length > 1000, 'image content');
assert.ok(Buffer.from(img.data, 'base64').subarray(1, 4).toString() === 'PNG');
console.log('render preview → image content ok:', text(rr).engine_used, text(rr).seconds + 's');
const ex2 = text(await call('blender_export', { path: 'out/monkey_50mm.glb' }));
assert.ok(fs.existsSync(ex2.path));
const bad = await c.callTool({ name: 'blender_export', arguments: { path: '/tmp/escape.glb' } });
assert.ok(bad.isError && /outside the workspace/.test(bad.content[0].text));
console.log('confinement ok');
if (process.env.IMG) {
  const rt = text(await call('retexture_model', { mesh: 'out/monkey_50mm.glb', image: process.env.IMG, poll: true, download: true }));
  assert.equal(rt.state, 'success');
  console.log('retexture (mock) ok:', rt.task_id);
  const g = await c.callTool({ name: 'image_to_3d', arguments: { image: process.env.IMG, request_type: 'texture' } });
  assert.ok(g.isError && /needs a GLB mesh/.test(g.content[0].text));
  console.log('texture guard ok');
}
await c.close();
console.log('blender-mcp-smoke: ALL OK');
