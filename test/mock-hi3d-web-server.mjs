// Mock of a website-session backend for `hi3d-cli login --mode web` (generic paths; real ones are configured, not committed).
// Password must be AES-128-ECB(MOCK_WEB_KEY) of MOCK_WEB_PASSWORD, mirroring the real site's scheme (key not included here).
import http from 'node:http';
import crypto from 'node:crypto';

const ACCOUNT = process.env.MOCK_WEB_ACCOUNT ?? 'user@example.com';
const PASSWORD = process.env.MOCK_WEB_PASSWORD ?? 'Passw0rd';
const SESSION = 'MOCK_SESSION=sess-' + crypto.randomBytes(6).toString('hex');
export const MOCK_WEB_KEY = process.env.MOCK_WEB_KEY ?? 'mock-key-16bytes';
export const MOCK_WEB_APPID = process.env.MOCK_WEB_APPID ?? 'mock-appid';
const MOCK_GLB = process.env.MOCK_GLB;
const jobs = new Map();
let seq = 0;

function encrypt(pw) {
  const c = crypto.createCipheriv('aes-128-ecb', Buffer.from(MOCK_WEB_KEY), null);
  return Buffer.concat([c.update(pw, 'utf8'), c.final()]).toString('base64').replace(/\+/g, '{cand}');
}
const json = (res, body, headers = {}) => res.writeHead(200, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
const loggedIn = (req) => (req.headers.cookie ?? '').includes(SESSION.split('=')[0] + '=');

export function startMockWeb(port = 0) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {};
    if (req.headers.appid !== MOCK_WEB_APPID) return json(res, { code: 400, msg: 'missing appid' });

    if (p.startsWith('/files/')) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      if (MOCK_GLB && p.endsWith('.glb')) return res.end(await import('node:fs').then((fs) => fs.readFileSync(MOCK_GLB)));
      return res.end(Buffer.from(`fake-${p.slice(7)}`));
    }
    if (p === '/api/auth/login') {
      if (body.account !== ACCOUNT) return json(res, { code: 2004, msg: 'user does not exist' });
      if (body.password !== encrypt(PASSWORD)) return json(res, { code: 2005, msg: 'wrong password' });
      return json(res, { code: 200, msg: 'success', data: { token: 'tok-' + seq++, userId: 'u-1' } }, { 'set-cookie': `${SESSION}; Path=/; HttpOnly` });
    }
    if (!loggedIn(req)) return json(res, { code: 401, msg: 'login expired' });

    if (p === '/api/auth/renew') return json(res, { code: 200, data: {} });
    if (p === '/api/auth/logout') return json(res, { code: 200, data: {} });
    if (p === '/api/user/info') return json(res, { code: 200, data: { userId: 'u-1', nickName: 'Mock User', email: ACCOUNT } });
    if (p === '/api/points') return json(res, { code: 200, data: { credits: 320, membershipLevel: 'Pro' } });
    if (p === '/api/generate/config') return json(res, { code: 200, data: { isKol: false, feVersion: '1.0.0' } });
    if (p === '/api/generate/upload-token') return json(res, { code: 200, data: { accessKeyId: 'AK', secretAccessKey: 'SK', sessionKey: 'ST' } });
    if (p === '/api/generate/submit') console.log(`UA ${req.headers['user-agent'] ?? ''}`);
    if (p === '/api/generate/submit') {
      const src = body?.otherParam?.multiViewSourceImageList?.[0]?.sourceOriginImageUrl;
      if (!src) return json(res, { code: 400, msg: 'missing image' });
      const id = `job_${crypto.randomBytes(8).toString('hex')}`;
      jobs.set(id, { i: 0, body });
      return json(res, { code: 200, msg: 'success', data: { jobId: id } });
    }
    if (p === '/api/generate/batch-result') {
      const out = (body.jobIds ?? []).map((id) => {
        const j = jobs.get(id);
        if (!j) return { jobId: id, status: 'NOT_FOUND' };
        const step = Math.min(j.i++, 3);
        const base = `http://127.0.0.1:${server.address().port}/files/${encodeURIComponent(id)}`;
        return step < 3
          ? { jobId: id, generateId: 'g-' + id.slice(0, 6), status: ['QUEUING', 'RUNNING', 'RUNNING'][step], progress: step * 33 }
          : { jobId: id, generateId: 'g-' + id.slice(0, 6), status: 'SUCCESS', progress: 100, model3DGlbUrl: `${base}.glb`, imageResize512Url: `${base}.webp`, npsPresentation: null };
      });
      return json(res, { code: 200, msg: 'success', data: out });
    }
    json(res, { code: 404, msg: `no route ${p}` });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, jobs })));
}

if (process.argv[1] && process.argv[1].endsWith('mock-hi3d-web-server.mjs')) {
  const { port } = await startMockWeb(Number(process.env.PORT ?? 8794));
  console.log(`mock hi3d web on http://127.0.0.1:${port}  (account=${ACCOUNT} password=${PASSWORD}; clients need HI3D_WEB_APPID=${MOCK_WEB_APPID} HI3D_WEB_PASSWORD_KEY=${MOCK_WEB_KEY})`);
}
