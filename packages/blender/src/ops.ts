/** High-level Blender operations shared by the MCP tools and the CLI (same names, same results). */
import fs from 'node:fs';
import path from 'node:path';
import { detectBackends, resolveBackend, BackendInfo } from './detect.js';
import { BlenderSession } from './session.js';
import { appInstallHint, installableReleases, platformKey } from './matrix.js';
import { managedEnvs } from './detect.js';

export interface BlenderOpContext {
  session: () => BlenderSession;
  log?: (m: string) => void;
}

export interface RenderOutput {
  images: string[];
  seconds: number;
  engine_used: string;
  fallback_used: boolean;
  samples: number;
  resolution: number;
}

export function blenderStatus(o: { refresh?: boolean; deep?: boolean } = {}, ctx?: BlenderOpContext) {
  const r = resolveBackend({ refresh: o.refresh, deep: o.deep });
  const envs = managedEnvs();
  let session: unknown = null;
  try {
    session = ctx?.session().info();
  } catch {
    /* no session */
  }
  return {
    ready: !!r.backend,
    backend: r.backend ? summarize(r.backend) : null,
    candidates: r.candidates.map(summarize),
    managed_envs: envs.map((e) => ({ dir: e.dir, ...(e.meta ?? {}) })),
    installable_bpy: installableReleases().map((x) => ({ bpy: x.bpy, python: x.python, approx_mb: x.approxMb, lts: x.lts })),
    platform: platformKey(),
    session,
    setup_hint: r.hint,
    app_install_hint: appInstallHint(),
  };
}

function summarize(b: BackendInfo) {
  return { kind: b.kind, path: b.path, blender: b.blenderVersion, python: b.pythonVersion, source: b.source, ok: b.ok, error: b.error };
}

export async function blenderDoctor(ctx: BlenderOpContext) {
  const status = blenderStatus({ refresh: true, deep: true }, ctx);
  const checks: { name: string; ok: boolean; detail?: unknown }[] = [];
  checks.push({ name: 'backend', ok: status.ready, detail: status.backend ?? status.setup_hint });
  if (status.ready) {
    const s = ctx.session();
    const t0 = Date.now();
    try {
      const info = await s.call<Record<string, unknown>>('info');
      checks.push({ name: 'start + import bpy', ok: true, detail: { ...info, ms: Date.now() - t0 } });
      await s.call('session', { action: 'reset' });
      await s.call('script', { code: 'import bpy\nbpy.ops.mesh.primitive_cube_add(size=1)' });
      const r = await s.call<RenderOutput>('render', { out: path.join(s.rendersDir, 'doctor'), views: ['iso'], resolution: 64, samples: 1 });
      checks.push({ name: 'cycles cpu render', ok: r.images.every((i) => fs.existsSync(i)), detail: { seconds: r.seconds, engine: r.engine_used } });
      const e = await s.call<{ bytes: number }>('export', { path: path.join(s.stateDir, 'doctor.glb') });
      checks.push({ name: 'glb export', ok: e.bytes > 0, detail: e });
      await s.call('session', { action: 'reset' });
    } catch (err) {
      checks.push({ name: 'executor', ok: false, detail: (err as Error).message });
    }
  }
  try {
    const s = ctx.session();
    fs.mkdirSync(s.stateDir, { recursive: true });
    fs.accessSync(s.stateDir, fs.constants.W_OK);
    checks.push({ name: 'workspace writable', ok: true, detail: s.stateDir });
  } catch (err) {
    checks.push({ name: 'workspace writable', ok: false, detail: (err as Error).message });
  }
  return { ok: checks.every((c) => c.ok), checks, status, all_candidates: detectBackends({ refresh: true, deep: true }).map(summarize) };
}

export async function blenderLoad(input: { path: string; clear?: boolean; name?: string; weld?: boolean }, ctx: BlenderOpContext) {
  const s = ctx.session();
  return s.call('load', { path: s.resolve(input.path, true), clear: input.clear ?? true, name: input.name, weld: input.weld ?? 'auto' }, 30 * 60_000);
}

export async function blenderInspect(input: { detail?: 'summary' | 'full'; object?: string }, ctx: BlenderOpContext) {
  return ctx.session().call('inspect', { detail: input.detail ?? 'full', object: input.object });
}

export async function blenderRunScript(input: { code: string; purpose?: string; timeout_s?: number }, ctx: BlenderOpContext) {
  if (input.purpose) ctx.log?.(`[blender] ${input.purpose}`);
  return ctx.session().call('script', { code: input.code }, (input.timeout_s ?? 600) * 1000);
}

export async function blenderRender(input: { views?: string[]; resolution?: number; samples?: number; engine?: string; shading?: string; transparent?: boolean; name?: string; object?: string }, ctx: BlenderOpContext): Promise<RenderOutput> {
  const s = ctx.session();
  fs.mkdirSync(s.rendersDir, { recursive: true });
  const out = path.join(s.rendersDir, (input.name ?? 'preview').replace(/[^\w.-]+/g, '_'));
  return s.call<RenderOutput>('render', {
    out,
    views: input.views?.length ? input.views : ['iso', 'front'],
    resolution: input.resolution ?? 512,
    samples: input.samples ?? 32,
    engine: input.engine ?? 'auto',
    shading: input.shading ?? 'material',
    transparent: !!input.transparent,
    object: input.object,
  });
}

export async function blenderExport(input: { path: string; format?: string; apply_modifiers?: boolean; objects?: string[]; draco?: boolean }, ctx: BlenderOpContext) {
  const s = ctx.session();
  const p = s.resolve(input.path);
  const r = await s.call<Record<string, unknown>>('export', { path: p, format: input.format, apply_modifiers: input.apply_modifiers ?? true, objects: input.objects, draco: !!input.draco });
  return { ...r, next: 'This file can be passed to retexture_model / split_model / multicolor_model, or delivered to the user.' };
}

export async function blenderSession(input: { action: 'info' | 'save' | 'reset' | 'open'; path?: string }, ctx: BlenderOpContext) {
  const s = ctx.session();
  if (input.action === 'info') {
    const r = await s.call<Record<string, unknown>>('session', { action: 'info' });
    return { ...s.info(), ...r };
  }
  return s.call('session', { action: input.action, path: input.path ? s.resolve(input.path) : undefined });
}

/** Generic passthrough for recipe ops (scale_to_size, center, transform, decimate, repair, split_loose, join, delete_objects, apply_modifiers, hollow). */
export async function blenderRecipe(op: string, args: Record<string, unknown>, ctx: BlenderOpContext) {
  return ctx.session().call(op, args);
}
