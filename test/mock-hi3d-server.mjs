// Minimal mock of api.hitem3d.ai for tests. Tasks advance one state per query.
import http from 'node:http';
import fs from 'node:fs';
const MOCK_GLB = process.env.MOCK_GLB; // optional real glb to serve for *.glb downloads

const AK = process.env.MOCK_AK ?? 'test-ak';
const SK = process.env.MOCK_SK ?? 'test-sk';
const TOKEN = 'mock-jwt-token';
const STATES = ['created', 'queueing', 'processing', 'success'];
const tasks = new Map();
let seq = 0;

const json = (res, code, body) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
const unauthorized = (res) => json(res, 401, { code: 401, msg: 'unauthorized' });

export function startMock(port = 0) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const auth = req.headers.authorization ?? '';

    if (p === '/open-api/v1/auth/token') console.log(`UA ${req.headers['user-agent'] ?? ''}`);
    if (p === '/open-api/v1/auth/token') {
      const expect = 'Basic ' + Buffer.from(`${AK}:${SK}`).toString('base64');
      if (auth !== expect) return unauthorized(res);
      return json(res, 200, { code: 200, message: 'success', data: { accessToken: TOKEN, tokenType: 'Bearer', nonce: 'n' } });
    }
    if (p.endsWith('/latest')) return json(res, 200, { version: '9.9.9' }); // mock npm registry for the update hint
    if (p.startsWith('/files/')) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      if (MOCK_GLB && p.endsWith('.glb')) return res.end(fs.readFileSync(MOCK_GLB));
      return res.end(Buffer.from(`fake-${p.slice(7)}`));
    }
    if (auth !== `Bearer ${TOKEN}`) return unauthorized(res);

    if (p === '/open-api/v1/balance') return json(res, 200, { code: 200, msg: 'success', data: { totalBalance: 1234 } });

    const create = (prefix) => {
      const id = prefix ? `${prefix}_${Date.now()}_${++seq}` : `task_${++seq}`;
      tasks.set(id, { i: 0 });
      return id;
    };
    if (req.method === 'POST' && /create-task$|submit-task$/.test(p)) {
      // drain multipart body; record field names for assertions
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks).toString('latin1');
      const fields = [...body.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
      if (p.includes('submit-task') && !fields.some((f) => /^(images|image_url|multi_images|multi_images_url|mesh|mesh_url)$/.test(f))) {
        return json(res, 200, { code: 10031005, msg: 'missing image' });
      }
      console.log(`UA ${req.headers['user-agent'] ?? ''}`);
      const prefix = p.includes('/split/') ? 'split' : p.includes('/depth/') ? 'depth' : p.includes('muilticolor') ? 'multicolor' : '';
      const id = create(prefix);
      tasks.get(id).fields = fields;
      return json(res, 200, { code: 200, msg: 'success', data: { task_id: id, state: 'queueing' } });
    }
    if (req.method === 'GET' && p.endsWith('query-task')) {
      const id = url.searchParams.get('task_id');
      const t = tasks.get(id);
      if (!t) return json(res, 200, { code: 40040000, msg: 'task not found' });
      const state = STATES[Math.min(t.i++, STATES.length - 1)];
      const data = { task_id: id, state };
      if (state === 'success') {
        data.id = `${id}_0`;
        data.url = `http://127.0.0.1:${server.address().port}/files/${id}.glb`;
        data.cover_url = `http://127.0.0.1:${server.address().port}/files/${id}.webp`;
      }
      return json(res, 200, { code: 200, msg: 'success', data });
    }
    json(res, 404, { code: 404, msg: `no route ${p}` });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, tasks })));
}

if (process.argv[1] && process.argv[1].endsWith('mock-hi3d-server.mjs')) {
  const { port } = await startMock(Number(process.env.PORT ?? 8790));
  console.log(`mock hi3d on http://127.0.0.1:${port}  (AK=${AK} SK=${SK})`);
}
