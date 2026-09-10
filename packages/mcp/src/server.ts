import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Hi3DBackend, Hi3DClient, Hi3DError, Credentials, createBackend } from '@hi3d/core';
import { BlenderSession } from '@hi3d/blender';
import { ToolContext, ToolResult, activeTools } from './tools.js';

export const SERVER_VERSION = process.env.HI3D_VERSION ?? '2.0.0';

export interface ServerOptions {
  /** local = stdio with filesystem access; remote = HTTP, URLs only */
  mode: 'local' | 'remote';
  credentials?: Credentials;
  outDir?: string;
  /** directory Blender/file tools are confined to (default cwd) */
  workspace?: string;
  confinePaths?: boolean;
  /** expose blender_run_script (default true) */
  scripts?: boolean;
  log?: (msg: string) => void;
}

export interface ToolContextHandle extends ToolContext {
  dispose: () => void;
}

export function makeContext(o: ServerOptions): ToolContextHandle {
  let client: Hi3DBackend | undefined;
  let session: BlenderSession | undefined;
  const workspace = path.resolve(o.workspace ?? process.env.HI3D_WORKSPACE ?? process.cwd());
  const log = o.log;
  return {
    client: () => (client ??= o.credentials ? new Hi3DClient({ credentials: o.credentials }) : createBackend()),
    outDir: o.outDir ?? process.env.HI3D_OUT_DIR ?? path.join(workspace, 'hi3d-out'),
    allowLocalFiles: o.mode === 'local',
    baseDir: workspace,
    log,
    workspace,
    blenderCtx: () => ({ session: () => (session ??= new BlenderSession({ workspace, confinePaths: o.confinePaths ?? !process.env.HI3D_BLENDER_UNCONFINED, log })), log }),
    dispose: () => session?.close(),
  };
}

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export function toContent(res: unknown): Content[] {
  if (res instanceof ToolResult) {
    const out: Content[] = [{ type: 'text', text: JSON.stringify(res.body, null, 2) }];
    for (const img of res.images) {
      try {
        out.push({ type: 'image', data: fs.readFileSync(img.path).toString('base64'), mimeType: img.mimeType });
      } catch {
        /* image missing: text still describes the paths */
      }
    }
    return out;
  }
  return [{ type: 'text', text: JSON.stringify(res, null, 2) }];
}

export function createServer(o: ServerOptions): { server: McpServer; ctx: ToolContextHandle } {
  const server = new McpServer({ name: 'hi3d', version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  const ctx = makeContext(o);
  for (const t of activeTools({ local: o.mode === 'local', scripts: o.scripts })) {
    server.registerTool(
      t.name,
      { title: t.title, description: t.description, inputSchema: t.schema, annotations: t.annotations },
      async (args: Record<string, unknown>) => {
        try {
          const body = await t.handler(args ?? {}, ctx);
          return { content: toContent(body) };
        } catch (e) {
          const err = e instanceof Hi3DError ? e.toJSON() : { message: (e as Error).message };
          return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: err }, null, 2) }] };
        }
      },
    );
  }
  return { server, ctx };
}

const INSTRUCTIONS = `Hi3D turns images into production-ready 3D models (hi3d.ai); the blender_* tools edit them with a headless Blender on this machine.

Generate: who_am_i → image_to_3d (download=true, format glb) → the file lands in the workspace. Generation takes minutes; poll query_task every ~10s if the client cannot wait. Result URLs expire ~1h; keep files with download=true / download_asset.
Credits: hi3dv3.0 2048quality=105, 2048master=455, v2.1 fast=25/pro=45; 1 credit = $0.02. Generate once, then iterate in Blender.

Edit: blender_status (once) → blender_load → blender_inspect → recipes (blender_scale_to_size, blender_repair, blender_decimate, blender_center, blender_split_loose …) or blender_run_script for anything else → blender_render_preview to LOOK at the result (images come back to you) → blender_export out/<name>.glb.
Verify after every edit with blender_inspect; for 3D printing keep meshes watertight (non_manifold_edges 0) and at real size in metres/mm.
Edited GLBs can go back to Hi3D: retexture_model (new textures), split_model (print parts), multicolor_model.
If blender_status reports no backend, ask the user before running blender_setup (≈300 MB download) or suggest installing Blender.`;
