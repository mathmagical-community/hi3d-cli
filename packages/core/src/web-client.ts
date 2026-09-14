/**
 * Consumer-site client: drives the same endpoints the www.hi3d.ai web app uses, with a
 * logged-in account session (cookie). EXPERIMENTAL — these endpoints are not a public API.
 *
 * Auth: cookie session. `hi3d-cli login --mode web` obtains it by POSTing account+password
 * (password encrypted the same way the web app does) to the site login endpoint, or by pasting a cookie.
 * Uploads go straight to the site's object storage with a temporary token (like the web app does),
 * using a generic SigV4-style signed PUT (algorithm/service names come from the site constants).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Hi3DError } from './errors.js';
import { DEFAULT_WEB_BASE, Profile, fetchViaProxy, proxyHeaders, saveWebSession, userAgentFor } from './config.js';
import { FileRef, ImageTo3DOptions, PollOptions, TERMINAL_STATES, TaskKind, TaskResult, TaskState, extOf, sleep } from './client.js';

import { loadWebConstants } from './web-constants-loader.js';

/**
 * Site-specific constants (header ids, endpoint paths, password scheme key, upload target) are NOT part
 * of this repository. They come from web-constants.ts (git-ignored, see web-constants.example.ts) or the
 * HI3D_WEB_CONSTANTS_JSON env var. Without them `--mode web` reports WEB_NOT_CONFIGURED.
 */
const WEB_CONSTANTS = loadWebConstants();
export const WEB_APPID = process.env.HI3D_WEB_APPID ?? WEB_CONSTANTS.appid;
const PASSWORD_AES_KEY = process.env.HI3D_WEB_PASSWORD_KEY ?? WEB_CONSTANTS.passwordKey;

/** Endpoint paths of the site (configured, not hard-coded; see web-constants.example.ts). */
export const WEB_PATHS = WEB_CONSTANTS.paths;

/** Object-storage target for image uploads (override with HI3D_STORE_* env). */
export const STORE_DEFAULTS = {
  region: process.env.HI3D_STORE_REGION ?? WEB_CONSTANTS.store.region,
  endpoint: process.env.HI3D_STORE_ENDPOINT ?? WEB_CONSTANTS.store.endpoint,
  bucket: process.env.HI3D_STORE_BUCKET ?? WEB_CONSTANTS.store.bucket,
  assetHostBase: process.env.HI3D_STORE_ASSET_HOST ?? WEB_CONSTANTS.store.assetHostBase,
  /** SigV4-style signing parameters, e.g. { algorithm: 'AWS4-HMAC-SHA256', service: 's3', headerPrefix: 'x-amz-' } */
  signing: WEB_CONSTANTS.store.signing,
};

export function encryptWebPassword(pw: string): string {
  if (!PASSWORD_AES_KEY) throw new Hi3DError('web login is not configured in this build (missing HI3D_WEB_PASSWORD_KEY / web-constants.ts)', { code: 'WEB_NOT_CONFIGURED' });
  const c = crypto.createCipheriv('aes-128-ecb', Buffer.from(PASSWORD_AES_KEY, 'utf8'), null);
  const out = Buffer.concat([c.update(pw, 'utf8'), c.final()]).toString('base64');
  return out.replace(/\+/g, '{cand}');
}

export function newWebId(): string {
  // 19-digit numeric id like the web app's localStorage web_id
  return '7' + Array.from(crypto.randomBytes(9)).map((b) => (b % 10).toString()).join('').padEnd(18, '0');
}

export interface WebEnvelope<T> {
  code: number;
  msg?: string;
  data: T;
}

export interface WebJob {
  jobId?: string;
  generateId?: string;
  status?: string | number;
  state?: string | number;
  jobStatus?: string | number;
  generateStatus?: string | number;
  progress?: number;
  model3DGlbUrl?: string;
  modelUrl?: string;
  glbUrl?: string;
  imageResize512Url?: string;
  imageResize200Url?: string;
  coverUrl?: string;
  sourceImageUrl?: string;
  errorMsg?: string;
  failReason?: string;
  [k: string]: unknown;
}

export interface WebSubmitOptions {
  image: FileRef;
  multiImages?: FileRef[];
  /** general | portrait */
  scene?: string;
  /** v3.0 | v2.1 | v2.0 | v1.5 */
  version?: string;
  /** quality | master (v3.0) etc. */
  modelType?: string;
  texture?: boolean;
  rmbg?: boolean;
  face?: number;
  pbr?: boolean;
  shading?: number;
  privacy?: 'public' | 'private';
  extra?: Record<string, unknown>;
}

const FAIL_WORDS = /fail|error|cancel|timeout|reject/i;
const RUN_WORDS = /run|process|generat|pending|queue|wait|init|create|submit/i;

/**
 * Map a web job record to the unified TaskResult shape.
 * Observed on the live site (batch-result, v3.0): { jobId, status: 1, percentage: 100, retryCount,
 *   model3ds: [{ itemId, model3DGlbUrl, url (cover), imageResize512Url, imageResize200Url, numFaces, numVertices, whetherTex, voxelResolution }],
 *   version, scene, modelType, createTime, multiViewInfo }
 * Result URLs are signed (auth_key + t) and expire, so download promptly.
 */
export function normalizeWebJob(j: WebJob, jobId?: string): TaskResult {
  const items = (Array.isArray(j.model3ds) ? j.model3ds : []) as Record<string, unknown>[];
  const first = items[0] ?? {};
  const url = (j.model3DGlbUrl || j.modelUrl || j.glbUrl || first.model3DGlbUrl || first.modelUrl || first.glbUrl) as string | undefined;
  const cover = (j.imageResize512Url || j.imageResize200Url || j.coverUrl || first.imageResize512Url || first.url || first.imageResize200Url) as string | undefined;
  const raw = j.status ?? j.state ?? j.jobStatus ?? j.generateStatus;
  const s = raw === undefined ? '' : String(raw).toLowerCase();
  const pct = typeof j.percentage === 'number' ? j.percentage : typeof j.progress === 'number' ? j.progress : undefined;
  const errText = (j.errorMsg || j.failReason || j.errMsg || j.failMsg) as string | undefined;
  let state: TaskState;
  if (url) state = 'success';
  else if (errText || (s && (FAIL_WORDS.test(s) || s === '2' || s === '3' || s === '-1'))) state = 'failed';
  else if (pct !== undefined && pct < 100) state = pct <= 0 ? 'queueing' : 'processing';
  else if (s === '' || s === '0' || /queue|pending|wait|create|submit/.test(s)) state = 'queueing';
  else state = 'processing';
  return {
    task_id: String(j.jobId ?? j.generateId ?? jobId ?? ''),
    state,
    id: (first.itemId as string) ?? (j.generateId ? String(j.generateId) : undefined),
    url,
    cover_url: cover,
    progress: pct,
    raw_status: raw,
    error: errText,
    faces: first.numFaces,
    vertices: first.numVertices,
    textured: first.whetherTex,
    resolution: first.voxelResolution,
    version: j.version,
    model_type: j.modelType,
    items: items.length > 1 ? items.map((it) => ({ id: it.itemId, url: it.model3DGlbUrl, cover: it.imageResize512Url ?? it.url })) : undefined,
    raw: j,
  };
}

export class Hi3DWebClient {
  readonly baseUrl: string;
  readonly profile: Profile;
  private readonly fetchImpl: typeof fetch;
  private readonly persist: boolean;
  private readonly userAgent: string;
  private cookies = new Map<string, string>();

  constructor(opts: { profile: Profile; fetch?: typeof fetch; persist?: boolean; baseUrl?: string; userAgent?: string }) {
    this.profile = opts.profile;
    this.userAgent = opts.userAgent ?? userAgentFor(undefined, true);
    this.baseUrl = (opts.baseUrl || process.env.HI3D_BASE_URL || opts.profile.webBase || DEFAULT_WEB_BASE).replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.persist = opts.persist ?? opts.profile.name !== 'env';
    if (!this.profile.webId) this.profile.webId = newWebId();
    this.importCookie(this.profile.cookie);
  }

  // ---------- cookies ----------

  private importCookie(header?: string) {
    if (!header) return;
    for (const part of header.split(/;\s*/)) {
      const i = part.indexOf('=');
      if (i > 0) this.cookies.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }
  }
  private absorbSetCookie(res: Response) {
    const h = res.headers as unknown as { getSetCookie?: () => string[]; get: (k: string) => string | null };
    // Node ≥ 19.7 has getSetCookie(); on Node 18 fall back to splitting the joined header on ", <name>="
    const list: string[] = h.getSetCookie ? h.getSetCookie() : (h.get('set-cookie') ?? '').split(/,\s*(?=[^;,\s=]+=)/).filter(Boolean);
    for (const sc of list) {
      const first = sc.split(';')[0];
      const i = first.indexOf('=');
      if (i > 0) this.cookies.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
    }
    if (list.length) this.saveSession();
  }
  get cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  private saveSession(extra: Partial<Profile> = {}) {
    this.profile.cookie = this.cookieHeader;
    Object.assign(this.profile, extra);
    if (this.persist) {
      try {
        saveWebSession(this.profile.name, { cookie: this.profile.cookie, webId: this.profile.webId, ...extra });
      } catch {
        /* read-only */
      }
    }
  }

  private headers(extra: Record<string, string> = {}, opts: { browserHeaders?: boolean } = {}): Record<string, string> {
    const h: Record<string, string> = {
      accept: 'application/json',
      appid: WEB_APPID,
      'entry-type': 'main',
      'web-id': this.profile.webId!,
      tz: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      'accept-language': 'en-US',
      'user-agent': this.userAgent,
      ...proxyHeaders(),
      ...extra,
    };
    if (opts.browserHeaders !== false) {
      h.referer = `${this.baseUrl}/workspace?panel=generate-3d`;
      h.origin = this.baseUrl;
    }
    if (this.cookies.size) h.cookie = this.cookieHeader;
    if (this.profile.token) h.token = this.profile.token;
    return h;
  }

  async request<T>(method: 'GET' | 'POST', p: string, init: { body?: unknown; query?: Record<string, string>; retryAuth?: boolean; /** omit origin/referer (the authorization-code exchange rejects browser-style requests) */ browserHeaders?: boolean } = {}): Promise<WebEnvelope<T>> {
    if (!p || !WEB_APPID) throw new Hi3DError('web login is not configured in this build (see web-constants.example.ts / HI3D_WEB_CONSTANTS_JSON)', { code: 'WEB_NOT_CONFIGURED' });
    const url = new URL(this.baseUrl + p);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    const isForm = init.body instanceof FormData;
    const res = await this.fetchImpl(url, {
      method,
      headers: this.headers(init.body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}, { browserHeaders: init.browserHeaders }),
      body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
      redirect: 'manual',
    });
    this.absorbSetCookie(res);
    const text = await res.text();
    let body: WebEnvelope<T>;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Hi3DError(`Unexpected response from ${p}: HTTP ${res.status} ${text.slice(0, 200)}`, { code: res.status, status: res.status });
    }
    if (body.code === 401 && init.retryAuth !== false && p !== WEB_PATHS.renewalToken && p !== WEB_PATHS.loginAccount && p !== WEB_PATHS.authorizeToken) {
      // try to renew once, then retry
      try {
        await this.request('GET', WEB_PATHS.renewalToken, { retryAuth: false });
      } catch {
        /* fallthrough */
      }
      const again = await this.request<T>(method, p, { ...init, retryAuth: false });
      return again;
    }
    if (body.code !== 200) {
      const hint = body.code === 401 ? 'Session expired. Run `hi3d-cli login --mode web` again.' : undefined;
      throw new Hi3DError(body.msg || hint || `web api error ${body.code}`, { code: body.code, status: res.status, details: { ...body, hint } });
    }
    return body;
  }

  // ---------- auth ----------

  /** Password login exactly like the web app (transition path until the site offers CLI authorization). */
  async loginWithPassword(account: string, password: string) {
    const r = await this.request<Record<string, unknown>>('POST', WEB_PATHS.loginAccount, { body: { account, password: encryptWebPassword(password) }, retryAuth: false });
    const data = r.data ?? {};
    const token = (data.token ?? data.accessToken) as string | undefined;
    if (token) this.profile.token = token;
    this.saveSession({ token: this.profile.token, account, loginAt: Date.now(), webLogin: 'password' });
    const me = await this.userInfo().catch(() => undefined);
    return { login: data, user: me };
  }

  /** Browser authorization: URL of the site's page that lets a signed-in user approve this CLI (loopback redirect + PKCE S256). */
  authorizeUrl(p: { redirectUri: string; state: string; codeChallenge: string }): string {
    if (!WEB_PATHS.authorizePage || !WEB_PATHS.authorizeToken) throw new Hi3DError('browser authorization is not configured in this build (web-constants: authorizePage / authorizeToken)', { code: 'WEB_NOT_CONFIGURED' });
    const q = new URLSearchParams({ redirectUri: p.redirectUri, state: p.state, codeChallenge: p.codeChallenge, codeChallengeMethod: 'S256' });
    return `${this.baseUrl}${WEB_PATHS.authorizePage}?${q.toString()}`;
  }

  /** Exchange the authorization code for a session. The site answers with the session cookie; `data` carries the user id. */
  async loginWithAuthorizationCode(p: { code: string; codeVerifier: string; redirectUri: string; state: string }) {
    this.cookies.clear();
    let r: WebEnvelope<unknown>;
    try {
      r = await this.request<unknown>('POST', WEB_PATHS.authorizeToken, { body: p, retryAuth: false, browserHeaders: false });
    } catch (e) {
      const code = e instanceof Hi3DError ? e.code : undefined;
      if (code === 401 || code === '401') throw new Hi3DError('The site rejected the authorization code (expired, already used, or PKCE mismatch). Run `hi3d-cli login --mode web` again.', { code: 'AUTH_CODE_REJECTED', status: 401 });
      throw e;
    }
    const data = r.data as unknown;
    const userId = typeof data === 'string' ? data : typeof data === 'object' && data ? ((data as Record<string, unknown>).userId as string | undefined) : undefined;
    const token = typeof data === 'object' && data ? ((data as Record<string, unknown>).token as string | undefined) : undefined;
    if (token) this.profile.token = token;
    this.saveSession({ token: this.profile.token, userId: userId ? String(userId) : this.profile.userId, loginAt: Date.now(), webLogin: 'authorize' });
    return this.userInfo();
  }

  /** Adopt a cookie string copied from the browser. */
  async loginWithCookie(cookie: string, token?: string) {
    this.cookies.clear();
    this.importCookie(cookie);
    if (token) this.profile.token = token;
    const me = await this.userInfo();
    this.saveSession({ token: this.profile.token, loginAt: Date.now(), webLogin: 'cookie' });
    return me;
  }

  async logout() {
    try {
      await this.request('POST', WEB_PATHS.logout, { retryAuth: false });
    } catch {
      /* ignore */
    }
  }

  async userInfo() {
    const r = await this.request<{ userId?: string; nickName?: string; email?: string; [k: string]: unknown }>('GET', WEB_PATHS.userInfo);
    const u = r.data ?? {};
    this.saveSession({ userId: u.userId ? String(u.userId) : this.profile.userId, nickName: (u.nickName as string) ?? this.profile.nickName });
    return u;
  }

  /** Credits / membership; the site exposes several endpoints, try the richest first. */
  async balance(): Promise<{ totalBalance: number; membership?: unknown }> {
    for (const p of [WEB_PATHS.pointAggregation, WEB_PATHS.membershipInfo]) {
      try {
        const r = await this.request<Record<string, unknown>>('GET', p);
        const d = r.data ?? {};
        const n = [d.credits, d.totalPoints, d.availablePoints, d.balance, d.totalBalance, (d.wallet as Record<string, unknown> | undefined)?.credits].find((v) => typeof v === 'number') as number | undefined;
        if (n !== undefined) return { totalBalance: n, membership: d };
        if (p === WEB_PATHS.membershipInfo) return { totalBalance: NaN, membership: d };
      } catch {
        /* try next */
      }
    }
    return { totalBalance: NaN };
  }

  async generateConfig() {
    return (await this.request<Record<string, unknown>>('GET', WEB_PATHS.generateConfig)).data;
  }

  // ---------- upload ----------

  /** Upload a local file so the site can read it; returns a public URL. */
  async uploadImage(file: string): Promise<string> {
    const buf = await fs.promises.readFile(file);
    const ext = path.extname(file).slice(1).toLowerCase() || 'png';
    const proxyUpload = process.env.HI3D_UPLOAD_PROXY;
    if (proxyUpload) {
      const res = await this.fetchImpl(`${proxyUpload}?ext=${encodeURIComponent(ext)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', ...proxyHeaders() }, body: new Uint8Array(buf) as never });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !j.url) throw new Hi3DError(`upload via proxy failed: ${j.error ?? res.status}`, { code: 'UPLOAD_FAILED', status: res.status });
      return j.url;
    }
    return this.uploadToStore(buf, ext);
  }

  /** Direct upload to the site's object storage with a temporary token from the site (what the web app does). */
  async uploadToStore(buf: Buffer, ext: string): Promise<string> {
    const tok = (await this.request<Record<string, string>>('GET', WEB_PATHS.tosTempToken)).data ?? {};
    const accessKeyId = tok.accessKeyId ?? tok.AccessKeyId;
    const secretKey = tok.secretAccessKey ?? tok.SecretAccessKey ?? tok.accessKeySecret;
    const sessionToken = tok.sessionKey ?? tok.sessionToken ?? tok.SessionToken;
    if (!accessKeyId || !secretKey) throw new Hi3DError('upload token response missing keys', { code: 'UPLOAD_TOKEN', details: Object.keys(tok) });
    const cfg = {
      region: tok.region ?? STORE_DEFAULTS.region,
      endpoint: tok.endpoint ?? STORE_DEFAULTS.endpoint,
      bucket: tok.bucket ?? STORE_DEFAULTS.bucket,
      assetHostBase: tok.assetHostBase ?? tok.cdnHost ?? STORE_DEFAULTS.assetHostBase,
    };
    const sig = STORE_DEFAULTS.signing;
    if (!cfg.bucket || !cfg.endpoint || !sig?.algorithm) throw new Hi3DError('upload target is not configured in this build (HI3D_STORE_* / web-constants.ts)', { code: 'WEB_NOT_CONFIGURED' });
    const key = `${(WEB_CONSTANTS.store.keyPrefix ?? 'uploads/').replace(/^\/+|\/+$/g, '')}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const host = `${cfg.bucket}.${cfg.endpoint}`;
    const url = `https://${host}/${key}`;
    const headers = signedPutHeaders({ host, path: `/${key}`, body: buf, region: cfg.region, accessKeyId, secretKey, sessionToken, contentType: mimeOfExt(ext), ...sig });
    const res = await this.fetchImpl(url, { method: 'PUT', headers, body: new Uint8Array(buf) as never });
    if (!res.ok) throw new Hi3DError(`upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`, { code: 'UPLOAD_FAILED', status: res.status });
    return `${cfg.assetHostBase.replace(/\/+$/, '')}/${key}`;
  }

  private async refToUrl(ref: FileRef): Promise<string> {
    return 'url' in ref ? ref.url : this.uploadImage(ref.path);
  }

  // ---------- generate ----------

  async submitWeb(o: WebSubmitOptions): Promise<{ task_id: string; raw: unknown }> {
    const urls: string[] = [];
    if (o.multiImages?.length) for (const m of o.multiImages) urls.push(await this.refToUrl(m));
    else urls.push(await this.refToUrl(o.image));
    const list = [0, 1, 2, 3].map((i) => (urls[i] ? { sourceOriginImageUrl: urls[i] } : {}));
    const version = o.version ?? 'v3.0';
    const otherParam: Record<string, unknown> = {
      multiViewSourceImageList: list,
      modelType: o.modelType ?? 'quality',
      generationType: o.texture === false ? 'mesh' : 'both',
      rmbg: o.rmbg === false ? 0 : 1,
      is_example_image: 0,
      privacyConfig: JSON.stringify({ globalPrivacy: o.privacy === 'private' ? 1 : 0 }),
      ...(o.face ? { face: o.face } : {}),
      ...(o.pbr !== undefined ? { pbr: o.pbr ? 1 : 0 } : {}),
      ...(o.shading !== undefined ? { shadingIntensity: Math.round(o.shading * 10) } : {}),
      ...(o.extra ?? {}),
    };
    const r = await this.request<{ jobId?: string; [k: string]: unknown }>('POST', WEB_PATHS.submit, { body: { scene: o.scene ?? 'general', version, otherParam } });
    const jobId = r.data?.jobId;
    if (!jobId) throw new Hi3DError('submit returned no jobId', { code: 'NO_JOB_ID', details: r });
    return { task_id: String(jobId), raw: r.data };
  }

  /** Same surface as Hi3DClient.submitImageTo3D so ops.ts can treat both backends alike. */
  async submitImageTo3D(o: ImageTo3DOptions): Promise<{ task_id: string }> {
    if (!o.image && !o.multiImages?.length) throw new Hi3DError('image or multiImages is required', { code: 'BAD_ARGS', status: 400 });
    const version = mapVersion(o.model);
    const modelType = o.resolution ? mapResolution(o.resolution) : undefined;
    return this.submitWeb({
      image: (o.image ?? o.multiImages![0]) as FileRef,
      multiImages: o.multiImages,
      scene: o.model?.startsWith('scene-portrait') ? 'portrait' : 'general',
      version,
      modelType,
      texture: o.requestType !== 'geometry',
      face: o.face,
      pbr: o.pbr,
      shading: o.shading,
    });
  }

  async batchResult(jobIds: string[]): Promise<WebJob[]> {
    const r = await this.request<WebJob[]>('POST', WEB_PATHS.batchResult, { body: { jobIds } });
    return Array.isArray(r.data) ? r.data : [];
  }

  async queryTask(taskId: string, _kind?: TaskKind): Promise<TaskResult> {
    const list = await this.batchResult([taskId]);
    const j = list.find((x) => String(x.jobId ?? x.generateId) === taskId) ?? list[0];
    if (!j) return { task_id: taskId, state: 'queueing', raw: null };
    return normalizeWebJob(j, taskId);
  }

  async pollTask(taskId: string, opts: PollOptions = {}, _kind?: TaskKind): Promise<TaskResult> {
    const interval = opts.intervalMs ?? 5000;
    const timeout = opts.timeoutMs ?? 60 * 60 * 1000;
    const start = Date.now();
    let last: TaskResult | undefined;
    for (;;) {
      if (opts.signal?.aborted) throw new Hi3DError('Polling aborted', { code: 'ABORTED' });
      const r = await this.queryTask(taskId);
      if (!last || last.state !== r.state || last.progress !== r.progress) opts.onProgress?.(r);
      last = r;
      if (TERMINAL_STATES.includes(r.state)) return r;
      if (Date.now() - start > timeout) throw new Hi3DError(`Timed out waiting for ${taskId}`, { code: 'POLL_TIMEOUT', details: r });
      await sleep(interval, opts.signal);
    }
  }

  // ---------- unsupported on the consumer site (use ak mode) ----------
  async submitSplit(): Promise<never> {
    throw new Hi3DError('split_model is only available with Open Platform (ak) credentials', { code: 'UNSUPPORTED_WEB' });
  }
  async submitDepth(): Promise<never> {
    throw new Hi3DError('image_to_relief is only available with Open Platform (ak) credentials', { code: 'UNSUPPORTED_WEB' });
  }
  async submitMulticolor(): Promise<never> {
    throw new Hi3DError('multicolor_model is only available with Open Platform (ak) credentials', { code: 'UNSUPPORTED_WEB' });
  }

  // ---------- download ----------
  async download(url: string, dest: string): Promise<{ path: string; bytes: number }> {
    const res = await this.fetchImpl(fetchViaProxy(url), { headers: { 'user-agent': this.userAgent, ...proxyHeaders() } });
    if (!res.ok || !res.body) throw new Hi3DError(`Download failed: HTTP ${res.status}`, { code: 'DOWNLOAD_FAILED', status: res.status });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(dest));
    return { path: dest, bytes: fs.statSync(dest).size };
  }
  async downloadTaskAssets(r: TaskResult, dir: string, baseName?: string): Promise<{ model?: string; cover?: string }> {
    const out: { model?: string; cover?: string } = {};
    const name = baseName ?? r.task_id.replace(/[^\w.-]+/g, '_').slice(0, 60);
    if (r.url) out.model = (await this.download(r.url, path.join(dir, `${name}${extOf(r.url, '.glb')}`))).path;
    if (r.cover_url) out.cover = (await this.download(r.cover_url, path.join(dir, `${name}_cover${extOf(r.cover_url, '.webp')}`))).path;
    return out;
  }
}

function mapVersion(model?: string): string {
  if (!model) return 'v3.0';
  const m = model.match(/v(\d+\.\d+)/);
  return m ? `v${m[1]}` : model;
}
function mapResolution(res: string): string {
  if (/master/.test(res)) return 'master';
  if (/quality/.test(res)) return 'quality';
  if (/pro/.test(res)) return 'pro';
  if (/fast/.test(res)) return 'fast';
  return res;
}

// ---------- SigV4-style request signing (algorithm / service / header prefix are configurable) ----------

export interface SigningParams {
  algorithm: string;
  service: string;
  headerPrefix: string;
  /** string prepended to the secret key when deriving the signing key ('AWS4' for S3; some providers use none) */
  secretPrefix?: string;
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/** Headers for a signed PUT of `body` to https://host/path using a SigV4-style scheme. */
export function signedPutHeaders(o: { host: string; path: string; body: Buffer; region: string; accessKeyId: string; secretKey: string; sessionToken?: string; contentType: string } & SigningParams): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const px = o.headerPrefix;
  const payloadHash = sha256Hex(o.body);
  const headers: Record<string, string> = {
    host: o.host,
    'content-type': o.contentType,
    [`${px}content-sha256`]: payloadHash,
    [`${px}date`]: amzDate,
  };
  if (o.sessionToken) headers[`${px}security-token`] = o.sessionToken;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((k) => `${k}:${headers[k].trim()}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = ['PUT', encodePath(o.path), '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${o.region}/${o.service}/request`;
  const stringToSign = [o.algorithm, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac((o.secretPrefix ?? '') + o.secretKey, dateStamp);
  const kRegion = hmac(kDate, o.region);
  const kService = hmac(kRegion, o.service);
  const kSigning = hmac(kService, 'request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const auth = `${o.algorithm} Credential=${o.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const { host: _h, ...rest } = headers;
  return { ...rest, authorization: auth, 'content-length': String(o.body.length) };
}

function encodePath(p: string): string {
  return p.split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
}

function mimeOfExt(ext: string): string {
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext.toLowerCase()] ?? 'application/octet-stream';
}
