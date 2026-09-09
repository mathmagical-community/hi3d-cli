/**
 * Tool table for the Hi3D MCP server. The CLI exposes the same names 1:1.
 * `local` tools need filesystem access and are only registered for stdio mode.
 */
import { z } from 'zod';
import {
  OpContext,
  balance,
  downloadAsset,
  imageTo3D,
  imageToRelief,
  multicolorModel,
  queryTask,
  splitModel,
  whoAmI,
  CATALOG,
} from '@hi3d/core';

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  local?: boolean;
  schema: z.ZodRawShape;
  handler: (args: Record<string, unknown>, ctx: OpContext) => Promise<unknown>;
}

const pollShape = {
  poll: z.boolean().optional().describe('Block until the task reaches success/failed (default false).'),
  poll_timeout_s: z.number().int().positive().optional().describe('Max seconds to wait when polling (default 3600).'),
};
const downloadShape = {
  download: z.boolean().optional().describe('LOCAL ONLY: after success, download model + cover to `out` (implies poll).'),
  out: z.string().optional().describe('LOCAL ONLY: directory for downloaded files.'),
  name: z.string().optional().describe('LOCAL ONLY: base file name for downloads (default task_id).'),
};
const fileDesc = (what: string) => `${what}: a public https URL, or (local mode only) a file path.`;
const modelFormat = z.enum(['glb', 'obj', 'stl', 'fbx', 'usdz', '3mf']);

export const TOOLS: ToolDef[] = [
  {
    name: 'who_am_i',
    title: 'Who am I / capabilities',
    description:
      'Verify Hi3D credentials and return account balance plus the full capability catalog (models, resolutions, credits, formats, limits). Call this first in a new session.',
    schema: {},
    handler: (_a, ctx) => whoAmI(ctx),
  },
  {
    name: 'image_to_3d',
    title: 'Image to 3D',
    description: [
      'Generate a 3D model from one image (or up to 4 multi-view images). Async: returns task_id; poll with query_task or set poll=true.',
      `Models: ${CATALOG.tools.image_to_3d.models.map((m) => m.model).join(', ')} (default hi3dv3.0).`,
      'hi3dv3.0 resolutions: 2048quality (105 credits) or 2048master (455 credits). Result URLs expire 1h after success, so download promptly.',
    ].join(' '),
    schema: {
      image: z.string().optional().describe(fileDesc('Input image (png/jpg/webp, <=20MB)')),
      multi_images: z.array(z.string()).max(4).optional().describe(fileDesc('2-4 multi-view images')),
      multi_images_bit: z.string().optional().describe('Bitmap of used multi-view slots, e.g. "1010".'),
      model: z.string().optional().describe('Model version, e.g. hi3dv3.0, hitem3dv2.1, scene-portraitv2.1.'),
      resolution: z.string().optional().describe('e.g. 2048quality | 2048master (v3.0); 1536fast | 1536pro (v2.1).'),
      request_type: z.enum(['geometry', 'texture', 'all']).optional().describe('geometry only, texture only (needs mesh), or both (default).'),
      format: modelFormat.optional().describe('Output format (default obj on the API; glb recommended).'),
      face: z.number().int().min(100000).max(5000000).optional().describe('Target face count.'),
      pbr: z.boolean().optional().describe('Generate PBR maps (default true).'),
      shading: z.number().min(0).max(1).optional().describe('De-shading strength 0..1 (default 0.5).'),
      mesh: z.string().optional().describe(fileDesc('Existing GLB geometry for request_type=texture')),
      callback_url: z.string().url().optional().describe('Webhook POSTed on completion.'),
      ...pollShape,
      ...downloadShape,
    },
    handler: (a, ctx) => imageTo3D(a as never, ctx),
  },
  {
    name: 'query_task',
    title: 'Query task',
    description:
      'Get status of any Hi3D task (image_to_3d, split_, depth_, multicolor_ ids are auto-detected). States: created → queueing → processing → success | failed. On success returns url (model) and cover_url, valid ~1h.',
    schema: { task_id: z.string(), ...pollShape, ...downloadShape },
    handler: (a, ctx) => queryTask(a as never, ctx),
  },
  {
    name: 'split_model',
    title: 'Split model for printing',
    description: 'Split a 3D model (glb/stl/obj, <=200MB) into printable parts with connectors. 20 credits. Async; returns task_id.',
    schema: {
      mesh: z.string().describe(fileDesc('Input mesh')),
      model: z.enum(['character', 'general']).optional().describe('Split strategy (default character).'),
      part: z.enum(['a', 'b', 'c', 'd', 'e', 'f']).optional().describe('Character split template (default a).'),
      joint: z.enum(['none', 'ball', 'dovetail', 'pin']).optional().describe('Connector type (default ball).'),
      merge: z.boolean().optional().describe('Merge connectors into parts (default true).'),
      level: z.enum(['low', 'medium', 'high']).optional().describe('Granularity for general split.'),
      format: modelFormat.optional(),
      callback_url: z.string().url().optional(),
      ...pollShape,
      ...downloadShape,
    },
    handler: (a, ctx) => splitModel(a as never, ctx),
  },
  {
    name: 'image_to_relief',
    title: 'Image to relief (depth map)',
    description: 'Generate a relief / depth-map based 3D from an image. 10 credits. Formats: exr, png, stl, glb, 3mf, bmp. Async; returns task_id.',
    schema: {
      image: z.string().describe(fileDesc('Input image')),
      model_type: z.enum(['base', 'pro']).optional().describe('base = 1K, pro = 2K (default base).'),
      format: z.enum(['exr', 'png', 'stl', 'glb', '3mf', 'bmp']).optional().describe('Output format (default glb).'),
      rmbg: z.boolean().optional().describe('Remove background (default true).'),
      height_relief: z.number().min(0.1).max(50).optional().describe('Relief height (default 1.3).'),
      callback_url: z.string().url().optional(),
      ...pollShape,
      ...downloadShape,
    },
    handler: (a, ctx) => imageToRelief(a as never, ctx),
  },
  {
    name: 'multicolor_model',
    title: 'Multicolor model',
    description: 'Quantize a textured GLB into N colors for multi-color printing. 20 credits. Async; returns task_id.',
    schema: {
      mesh: z.string().describe(fileDesc('Textured GLB (<=200MB)')),
      number_color: z.number().int().min(0).max(8).optional().describe('Number of colors 1-8, 0 = max (default 4).'),
      format: z.enum(['obj', 'glb', 'fbx', '3mf']).optional(),
      callback_url: z.string().url().optional(),
      ...pollShape,
      ...downloadShape,
    },
    handler: (a, ctx) => multicolorModel(a as never, ctx),
  },
  {
    name: 'balance',
    title: 'Credit balance',
    description: 'Return remaining credits (1 credit = $0.02).',
    schema: {},
    handler: (_a, ctx) => balance(ctx),
  },
  {
    name: 'download_asset',
    title: 'Download asset',
    local: true,
    description: 'LOCAL ONLY. Download a finished task’s model + cover (or any URL) to disk. Use right after success: result URLs expire in ~1h.',
    schema: {
      task_id: z.string().optional(),
      url: z.string().url().optional(),
      out: z.string().optional().describe('Directory (default ./hi3d-out).'),
      name: z.string().optional(),
    },
    handler: (a, ctx) => downloadAsset(a as never, ctx),
  },
];

export function listTools(local: boolean) {
  return TOOLS.filter((t) => local || !t.local).map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    local: !!t.local,
    inputSchema: z.toJSONSchema(z.object(t.schema)),
  }));
}
