/**
 * High-level operations shared by the CLI and the MCP server so both expose
 * exactly the same behaviour (same names, same result shapes).
 */
import path from 'node:path';
import { CATALOG, estimateCredits } from './catalog.js';
import { CONSOLE_URL, describeProfile, loadProfile } from './config.js';
import { FileRef, ImageTo3DOptions, PollOptions, TaskResult, inferTaskKind } from './client.js';
import { Hi3DBackend } from './backend.js';

export interface OpContext {
  client: () => Hi3DBackend;
  /** default directory for downloaded assets */
  outDir: string;
  /** whether local file paths are allowed (false for remote MCP) */
  allowLocalFiles: boolean;
  log?: (msg: string) => void;
}

export function toFileRef(v: string, ctx: OpContext): FileRef {
  if (/^https?:\/\//i.test(v)) return { url: v };
  if (!ctx.allowLocalFiles) {
    throw new Error(`Local paths are not allowed here (${v}); pass a public URL instead.`);
  }
  return { path: path.resolve(v) };
}

export async function whoAmI(ctx: OpContext) {
  const profile = loadProfile();
  if (!profile) {
    return {
      authenticated: false,
      hint: `Run \`hi3d-cli login\` — Open Platform AK/SK (create at ${CONSOLE_URL}) or \`hi3d-cli login --mode web\` for a hi3d.ai account.`,
      catalog: CATALOG,
    };
  }
  const client = ctx.client();
  const bal = await client.balance();
  return {
    authenticated: true,
    authMode: profile.mode === 'web' ? 'web_session' : 'ak_sk',
    profile: describeProfile(profile),
    baseUrl: client.baseUrl,
    balance: bal.totalBalance,
    unsupported: profile.mode === 'web' ? ['split_model', 'image_to_relief', 'multicolor_model'] : [],
    catalog: CATALOG,
  };
}

export interface ImageTo3DInput {
  image?: string;
  multi_images?: string[];
  multi_images_bit?: string;
  model?: string;
  resolution?: string;
  request_type?: 'geometry' | 'texture' | 'all';
  format?: string;
  face?: number;
  pbr?: boolean;
  shading?: number;
  mesh?: string;
  callback_url?: string;
  /** block until done */
  poll?: boolean;
  poll_timeout_s?: number;
  /** download assets after success (implies poll) */
  download?: boolean;
  out?: string;
  name?: string;
}

export async function imageTo3D(input: ImageTo3DInput, ctx: OpContext) {
  const o: ImageTo3DOptions = {
    image: input.image ? toFileRef(input.image, ctx) : undefined,
    multiImages: input.multi_images?.map((m) => toFileRef(m, ctx)),
    multiImagesBit: input.multi_images_bit,
    model: input.model,
    resolution: input.resolution,
    requestType: input.request_type,
    format: input.format as ImageTo3DOptions['format'],
    face: input.face,
    pbr: input.pbr,
    shading: input.shading,
    mesh: input.mesh ? toFileRef(input.mesh, ctx) : undefined,
    callbackUrl: input.callback_url,
  };
  const client = ctx.client();
  const { task_id } = await client.submitImageTo3D(o);
  const submitted = {
    task_id,
    state: 'created',
    model: o.model ?? 'hi3dv3.0',
    resolution: o.resolution,
    estimated_credits: estimateCredits(o.model ?? 'hi3dv3.0', o.resolution),
    message: 'Task submitted. Poll query_task with this task_id; result URLs expire 1h after success.',
  };
  if (!input.poll && !input.download) return submitted;
  return waitAndMaybeDownload(client, task_id, { ...input, task_id, poll: true }, ctx, submitted);
}

export interface QueryInput {
  task_id: string;
  poll?: boolean;
  poll_timeout_s?: number;
  download?: boolean;
  out?: string;
  name?: string;
}

export async function queryTask(input: QueryInput, ctx: OpContext) {
  const client = ctx.client();
  if (!input.poll && !input.download) return client.queryTask(input.task_id);
  return waitAndMaybeDownload(client, input.task_id, input, ctx);
}

async function waitAndMaybeDownload(client: Hi3DBackend, taskId: string, input: QueryInput, ctx: OpContext, submitted?: unknown) {
  const pollOpts: PollOptions = {
    timeoutMs: (input.poll_timeout_s ?? 3600) * 1000,
    onProgress: (r) => ctx.log?.(`[${taskId}] ${r.state}${r.progress !== undefined ? ` ${r.progress}%` : ''}${r.raw_status !== undefined ? ` (status=${r.raw_status})` : ''}`),
  };
  const result: TaskResult & { submitted?: unknown; files?: unknown; polled?: boolean } = await client.pollTask(taskId, pollOpts, inferTaskKind(taskId));
  result.polled = true;
  if (submitted) result.submitted = submitted;
  if (input.download && result.state === 'success' && ctx.allowLocalFiles) {
    const dir = path.resolve(input.out ?? ctx.outDir);
    result.files = await client.downloadTaskAssets(result, dir, input.name);
    ctx.log?.(`[${taskId}] downloaded to ${dir}`);
  }
  return result;
}

export async function downloadAsset(input: { task_id?: string; url?: string; out?: string; name?: string }, ctx: OpContext) {
  if (!ctx.allowLocalFiles) throw new Error('download_asset is only available in local mode');
  const client = ctx.client();
  const dir = path.resolve(input.out ?? ctx.outDir);
  if (input.url) {
    const name = input.name ?? path.basename(new URL(input.url).pathname) ?? 'asset';
    return client.download(input.url, path.join(dir, name));
  }
  if (!input.task_id) throw new Error('task_id or url required');
  const r = await client.queryTask(input.task_id);
  if (r.state !== 'success') return { ...r, message: 'Task not finished; nothing downloaded' };
  return { ...r, files: await client.downloadTaskAssets(r, dir, input.name) };
}

export async function splitModel(
  input: { mesh: string; model?: 'character' | 'general'; part?: string; joint?: 'none' | 'ball' | 'dovetail' | 'pin'; merge?: boolean; level?: 'low' | 'medium' | 'high'; format?: string; callback_url?: string } & Omit<QueryInput, 'task_id'>,
  ctx: OpContext,
) {
  const client = ctx.client();
  const r = await client.submitSplit({
    mesh: toFileRef(input.mesh, ctx),
    model: input.model,
    part: input.part,
    joint: input.joint,
    merge: input.merge === undefined ? undefined : input.merge ? 'yes' : 'no',
    level: input.level,
    format: input.format as never,
    callbackUrl: input.callback_url,
  });
  const submitted = { ...r, estimated_credits: CATALOG.tools.split_model.credits };
  if (!input.poll && !input.download) return submitted;
  return waitAndMaybeDownload(client, r.task_id, { ...input, task_id: r.task_id }, ctx, submitted);
}

export async function imageToRelief(
  input: { image: string; model_type?: 'base' | 'pro'; format?: string; rmbg?: boolean; height_relief?: number; callback_url?: string } & Omit<QueryInput, 'task_id'>,
  ctx: OpContext,
) {
  const client = ctx.client();
  const r = await client.submitDepth({
    image: toFileRef(input.image, ctx),
    modelType: input.model_type,
    format: input.format as never,
    rmbg: input.rmbg,
    heightRelief: input.height_relief,
    callbackUrl: input.callback_url,
  });
  const submitted = { ...r, estimated_credits: CATALOG.tools.image_to_relief.credits };
  if (!input.poll && !input.download) return submitted;
  return waitAndMaybeDownload(client, r.task_id, { ...input, task_id: r.task_id }, ctx, submitted);
}

export async function multicolorModel(
  input: { mesh: string; number_color?: number; format?: string; callback_url?: string } & Omit<QueryInput, 'task_id'>,
  ctx: OpContext,
) {
  const client = ctx.client();
  const r = await client.submitMulticolor({
    mesh: toFileRef(input.mesh, ctx),
    numberColor: input.number_color,
    format: input.format as never,
    callbackUrl: input.callback_url,
  });
  const submitted = { ...r, estimated_credits: CATALOG.tools.multicolor_model.credits };
  if (!input.poll && !input.download) return submitted;
  return waitAndMaybeDownload(client, r.task_id, { ...input, task_id: r.task_id }, ctx, submitted);
}

export async function balance(ctx: OpContext) {
  const b = await ctx.client().balance();
  return { credits: b.totalBalance, usd_equivalent: +(b.totalBalance * CATALOG.creditUsd).toFixed(2) };
}
