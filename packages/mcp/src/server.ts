import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Hi3DBackend, Hi3DClient, Hi3DError, OpContext, Credentials, createBackend } from '@hi3d/core';
import { TOOLS } from './tools.js';

export interface ServerOptions {
  /** local = stdio with filesystem access; remote = HTTP, URLs only */
  mode: 'local' | 'remote';
  credentials?: Credentials;
  outDir?: string;
  log?: (msg: string) => void;
}

export function makeContext(o: ServerOptions): OpContext {
  let client: Hi3DBackend | undefined;
  return {
    client: () => (client ??= o.credentials ? new Hi3DClient({ credentials: o.credentials }) : createBackend()),
    outDir: o.outDir ?? process.env.HI3D_OUT_DIR ?? 'hi3d-out',
    allowLocalFiles: o.mode === 'local',
    log: o.log,
  };
}

export function createServer(o: ServerOptions): McpServer {
  const server = new McpServer({ name: 'hi3d', version: '0.1.0' }, { instructions: INSTRUCTIONS });
  const ctx = makeContext(o);
  for (const t of TOOLS) {
    if (t.local && o.mode !== 'local') continue;
    server.registerTool(
      t.name,
      { title: t.title, description: t.description, inputSchema: t.schema },
      async (args: Record<string, unknown>) => {
        try {
          const body = await t.handler(args ?? {}, ctx);
          return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
        } catch (e) {
          const err = e instanceof Hi3DError ? e.toJSON() : { message: (e as Error).message };
          return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: err }, null, 2) }] };
        }
      },
    );
  }
  return server;
}

const INSTRUCTIONS = `Hi3D turns images into production-ready 3D models (hi3d.ai).
Workflow: who_am_i → image_to_3d (returns task_id) → query_task until state=success → use url/cover_url.
Generation takes minutes; prefer image_to_3d with poll=true when the client tolerates long calls, otherwise poll query_task every ~10s.
Result URLs expire ~1h after success; in local mode pass download=true (or call download_asset) to keep files.
Credits: hi3dv3.0 2048quality=105, 2048master=455, v2.1 fast=25/pro=45; 1 credit = $0.02. Check balance before large batches.`;
