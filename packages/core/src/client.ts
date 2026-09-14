import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Hi3DError, KNOWN_ERROR_CODES } from './errors.js';
import { Credentials, DEFAULT_BASE_URL, fetchViaProxy, loadCredentials, proxyHeaders, saveCredentials, userAgentFor } from './config.js';
import {
  DEPTH_FORMATS,
  DepthFormat,
  MODEL_FORMATS,
  ModelFormat,
  MULTICOLOR_FORMATS,
  MulticolorFormat,
  REQUEST_TYPES,
  RequestType,
} from './catalog.js';

export type TaskState = 'created' | 'queueing' | 'processing' | 'success' | 'failed';
export const TERMINAL_STATES: TaskState[] = ['success', 'failed'];

export type TaskKind = 'image_to_3d' | 'split' | 'depth' | 'multicolor';

export interface TaskResult {
  task_id: string;
  state: TaskState;
  /** generated asset id */
  id?: string;
  /** model download url, valid ~1h */
  url?: string;
  /** thumbnail url, valid ~1h */
  cover_url?: string;
  [k: string]: unknown;
}

export interface ApiEnvelope<T> {
  code: number | string;
  msg?: string;
  message?: string;
  data: T;
}

/** A local file path or a remote URL. */
export type FileRef = { path: string } | { url: string };

export interface ImageTo3DOptions {
  /** single image (path or url) */
  image?: FileRef;
  /** up to 4 multi-view images (paths or urls) */
  multiImages?: FileRef[];
  /** bitmap of which multi-view slots are used, e.g. "1010" */
  multiImagesBit?: string;
  model?: string;
  resolution?: string;
  requestType?: RequestType;
  format?: ModelFormat;
  face?: number;
  pbr?: boolean;
  shading?: number;
  /** existing geometry for requestType=texture (glb only) */
  mesh?: FileRef;
  callbackUrl?: string;
}

export interface SplitOptions {
  mesh: FileRef;
  model?: 'character' | 'general';
  part?: string;
  joint?: 'none' | 'ball' | 'dovetail' | 'pin';
  merge?: 'yes' | 'no';
  level?: 'low' | 'medium' | 'high';
  format?: ModelFormat;
  callbackUrl?: string;
}

export interface DepthOptions {
  image: FileRef;
  modelType?: 'base' | 'pro';
  format?: DepthFormat;
  rmbg?: boolean;
  heightRelief?: number;
  callbackUrl?: string;
}

export interface MulticolorOptions {
  mesh: FileRef;
  numberColor?: number;
  format?: MulticolorFormat;
  callbackUrl?: string;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onProgress?: (r: TaskResult) => void;
  signal?: AbortSignal;
}

export interface Hi3DClientOptions {
  credentials?: Credentials;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** persist refreshed access token back to credentials file */
  persistToken?: boolean;
  userAgent?: string;
}

const PATHS = {
  token: '/open-api/v1/auth/token',
  submit: '/open-api/v1/submit-task',
  query: '/open-api/v1/query-task',
  balance: '/open-api/v1/balance',
  splitCreate: '/open-api/v1/split/create-task',
  splitQuery: '/open-api/v1/split/query-task',
  depthCreate: '/open-api/v1/depth/create-task',
  depthQuery: '/open-api/v1/depth/query-task',
  // NOTE: the path really is spelled "muilticolor" in the official docs.
  multicolorCreate: '/open-api/v1/muilticolor/create-task',
  multicolorQuery: '/open-api/v1/muilticolor/query-task',
} as const;

export function inferTaskKind(taskId: string): TaskKind {
  if (taskId.startsWith('split_')) return 'split';
  if (taskId.startsWith('depth_')) return 'depth';
  if (taskId.startsWith('multicolor_')) return 'multicolor';
  return 'image_to_3d';
}

export class Hi3DClient {
  readonly baseUrl: string;
  private creds: Credentials;
  private readonly fetchImpl: typeof fetch;
  private readonly persistToken: boolean;
  private readonly userAgent: string;
  private tokenPromise?: Promise<string>;

  constructor(opts: Hi3DClientOptions = {}) {
    const creds = opts.credentials ?? loadCredentials();
    if (!creds) {
      throw new Hi3DError(
        'No Hi3D credentials. Run `hi3d-cli login --client-id ... --client-secret ...` or set HI3D_CLIENT_ID/HI3D_CLIENT_SECRET.',
        { code: 'NO_CREDENTIALS', status: 401 },
      );
    }
    this.creds = creds;
    this.baseUrl = (opts.baseUrl || process.env.HI3D_BASE_URL || creds.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.persistToken = opts.persistToken ?? !opts.credentials;
    this.userAgent = opts.userAgent ?? userAgentFor();
  }

  // ---------- auth ----------

  /** Exchange AK/SK (Basic) for a bearer access token. */
  async fetchAccessToken(): Promise<string> {
    const basic = Buffer.from(`${this.creds.clientId}:${this.creds.clientSecret}`).toString('base64');
    const res = await this.fetchImpl(this.baseUrl + PATHS.token, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json', 'User-Agent': this.userAgent, ...proxyHeaders() },
    });
    const body = (await parseJson(res)) as unknown as ApiEnvelope<{ accessToken: string; tokenType?: string }>;
    if (!res.ok || String(body.code) !== '200' || !body.data?.accessToken) {
      throw new Hi3DError(`Auth failed: ${body.msg ?? body.message ?? res.statusText}`, {
        code: body.code ?? res.status,
        status: res.status,
        details: body,
      });
    }
    this.creds.accessToken = body.data.accessToken;
    this.creds.accessTokenIssuedAt = Date.now();
    if (this.persistToken) {
      try {
        saveCredentials(this.creds);
      } catch {
        /* read-only home, ignore */
      }
    }
    return body.data.accessToken;
  }

  private async getToken(force = false): Promise<string> {
    if (!force && this.creds.accessToken) return this.creds.accessToken;
    if (!this.tokenPromise) {
      this.tokenPromise = this.fetchAccessToken().finally(() => (this.tokenPromise = undefined));
    }
    return this.tokenPromise;
  }

  /** Authenticated request with one automatic token refresh on 401. */
  private async request<T>(method: 'GET' | 'POST', p: string, init: { body?: BodyInit; query?: Record<string, string> } = {}): Promise<ApiEnvelope<T>> {
    const url = new URL(this.baseUrl + p);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    const doFetch = async (token: string) =>
      this.fetchImpl(url, {
        method,
        body: init.body,
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': this.userAgent,
          ...proxyHeaders(),
          ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        },
      });
    let res = await doFetch(await this.getToken());
    if (res.status === 401) res = await doFetch(await this.getToken(true));
    const body = (await parseJson(res)) as unknown as ApiEnvelope<T>;
    if (!res.ok || (body.code !== undefined && String(body.code) !== '200')) {
      const code = body.code ?? res.status;
      const known = KNOWN_ERROR_CODES[String(code)];
      throw new Hi3DError(body.msg ?? body.message ?? known ?? `HTTP ${res.status}`, {
        code,
        status: res.status,
        details: { ...body, hint: known },
      });
    }
    return body;
  }

  // ---------- account ----------

  async balance(): Promise<{ totalBalance: number }> {
    return (await this.request<{ totalBalance: number }>('GET', PATHS.balance)).data;
  }

  // ---------- image -> 3d ----------

  async submitImageTo3D(o: ImageTo3DOptions): Promise<{ task_id: string }> {
    if (!o.image && !(o.multiImages && o.multiImages.length) && !o.mesh) {
      throw new Hi3DError('image, multiImages or mesh is required', { code: 'BAD_ARGS', status: 400 });
    }
    if (o.image && o.multiImages?.length) {
      throw new Hi3DError('Provide either image or multiImages, not both', { code: '10031007', status: 400 });
    }
    if (o.multiImages && o.multiImages.length > 4) {
      throw new Hi3DError('At most 4 multi-view images', { code: '10031009', status: 400 });
    }
    const fd = new FormData();
    fd.set('request_type', String(REQUEST_TYPES[o.requestType ?? 'all']));
    fd.set('model', o.model ?? 'hi3dv3.0');
    if (o.resolution) fd.set('resolution', o.resolution);
    if (o.format) fd.set('format', String(MODEL_FORMATS[o.format]));
    if (o.face !== undefined) fd.set('face', String(o.face));
    if (o.pbr !== undefined) fd.set('pbr', o.pbr ? '1' : '0');
    if (o.shading !== undefined) fd.set('shading', String(o.shading));
    if (o.multiImagesBit) fd.set('multi_images_bit', o.multiImagesBit);
    if (o.callbackUrl) fd.set('callback_url', o.callbackUrl);
    if (o.image) await appendFile(fd, 'images', 'image_url', o.image);
    for (const img of o.multiImages ?? []) await appendFile(fd, 'multi_images', 'multi_images_url', img);
    if (o.mesh) await appendFile(fd, 'mesh', 'mesh_url', o.mesh);
    return (await this.request<{ task_id: string }>('POST', PATHS.submit, { body: fd })).data;
  }

  async queryTask(taskId: string, kind: TaskKind = inferTaskKind(taskId)): Promise<TaskResult> {
    const p = { image_to_3d: PATHS.query, split: PATHS.splitQuery, depth: PATHS.depthQuery, multicolor: PATHS.multicolorQuery }[kind];
    const data = (await this.request<TaskResult>('GET', p, { query: { task_id: taskId } })).data;
    return { ...data, task_id: data.task_id ?? taskId };
  }

  /** Poll until terminal state. Throws Hi3DError on timeout/abort; returns failed results without throwing. */
  async pollTask(taskId: string, opts: PollOptions = {}, kind: TaskKind = inferTaskKind(taskId)): Promise<TaskResult> {
    const interval = opts.intervalMs ?? 5000;
    const timeout = opts.timeoutMs ?? 60 * 60 * 1000;
    const start = Date.now();
    let last: TaskResult | undefined;
    for (;;) {
      if (opts.signal?.aborted) throw new Hi3DError('Polling aborted', { code: 'ABORTED', details: last });
      const r = await this.queryTask(taskId, kind);
      if (!last || last.state !== r.state || last.progress !== r.progress) opts.onProgress?.(r);
      last = r;
      if (TERMINAL_STATES.includes(r.state)) return r;
      if (Date.now() - start > timeout) {
        throw new Hi3DError(`Timed out after ${Math.round(timeout / 1000)}s waiting for ${taskId} (last state: ${r.state})`, {
          code: 'POLL_TIMEOUT',
          details: r,
        });
      }
      await sleep(interval, opts.signal);
    }
  }

  // ---------- split / depth / multicolor ----------

  async submitSplit(o: SplitOptions): Promise<{ task_id: string; state?: TaskState }> {
    const fd = new FormData();
    await appendFile(fd, 'mesh', 'mesh_url', o.mesh);
    if (o.model) fd.set('model', o.model);
    if (o.part) fd.set('part', o.part);
    if (o.joint) fd.set('joint', o.joint);
    if (o.merge) fd.set('merge', o.merge);
    if (o.level) fd.set('level', o.level);
    if (o.format) fd.set('format', String(MODEL_FORMATS[o.format]));
    if (o.callbackUrl) fd.set('callback_url', o.callbackUrl);
    return (await this.request<{ task_id: string; state?: TaskState }>('POST', PATHS.splitCreate, { body: fd })).data;
  }

  async submitDepth(o: DepthOptions): Promise<{ task_id: string }> {
    const fd = new FormData();
    await appendFile(fd, 'image', 'image_url', o.image);
    fd.set('model_type', o.modelType ?? 'base');
    fd.set('format', String(DEPTH_FORMATS[o.format ?? 'glb']));
    fd.set('rmbg', o.rmbg === false ? '0' : '1');
    if (o.heightRelief !== undefined) fd.set('height_relief', String(o.heightRelief));
    if (o.callbackUrl) fd.set('callback_url', o.callbackUrl);
    return (await this.request<{ task_id: string }>('POST', PATHS.depthCreate, { body: fd })).data;
  }

  async submitMulticolor(o: MulticolorOptions): Promise<{ task_id: string; state?: TaskState }> {
    const fd = new FormData();
    await appendFile(fd, 'mesh', 'mesh_url', o.mesh);
    fd.set('model', 'multicolor');
    if (o.numberColor !== undefined) fd.set('number_color', String(o.numberColor));
    if (o.format) fd.set('format', String(MULTICOLOR_FORMATS[o.format]));
    if (o.callbackUrl) fd.set('callback_url', o.callbackUrl);
    return (await this.request<{ task_id: string; state?: TaskState }>('POST', PATHS.multicolorCreate, { body: fd })).data;
  }

  // ---------- download ----------

  /** Download a result URL to disk. Result URLs expire ~1h after task success, so call this promptly. */
  async download(url: string, dest: string): Promise<{ path: string; bytes: number }> {
    const res = await this.fetchImpl(fetchViaProxy(url), { headers: { 'User-Agent': this.userAgent, ...proxyHeaders() } });
    if (!res.ok || !res.body) throw new Hi3DError(`Download failed: HTTP ${res.status}`, { code: 'DOWNLOAD_FAILED', status: res.status });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(dest));
    return { path: dest, bytes: fs.statSync(dest).size };
  }

  /** Download model + cover of a successful task into `dir`. Returns local paths. */
  async downloadTaskAssets(r: TaskResult, dir: string, baseName?: string): Promise<{ model?: string; cover?: string }> {
    const out: { model?: string; cover?: string } = {};
    const name = baseName ?? r.task_id;
    if (r.url) out.model = (await this.download(r.url, path.join(dir, `${name}${extOf(r.url, '.glb')}`))).path;
    if (r.cover_url) out.cover = (await this.download(r.cover_url, path.join(dir, `${name}_cover${extOf(r.cover_url, '.webp')}`))).path;
    return out;
  }
}

// ---------- helpers ----------

async function appendFile(fd: FormData, fileField: string, urlField: string, ref: FileRef) {
  if ('url' in ref) {
    fd.append(urlField, ref.url);
    return;
  }
  const p = ref.path;
  if (!fs.existsSync(p)) throw new Hi3DError(`File not found: ${p}`, { code: 'FILE_NOT_FOUND', status: 400 });
  const buf = await fs.promises.readFile(p);
  fd.append(fileField, new Blob([buf], { type: mimeOf(p) }), path.basename(p));
}

function mimeOf(p: string): string {
  const ext = path.extname(p).toLowerCase();
  return (
    {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.glb': 'model/gltf-binary',
      '.obj': 'model/obj',
      '.stl': 'model/stl',
    }[ext] ?? 'application/octet-stream'
  );
}

export function extOf(url: string, fallback: string): string {
  try {
    const e = path.extname(new URL(url).pathname);
    return e || fallback;
  } catch {
    return fallback;
  }
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { code: res.status, msg: text.slice(0, 500) };
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Hi3DError('aborted', { code: 'ABORTED' }));
      },
      { once: true },
    );
  });
}
