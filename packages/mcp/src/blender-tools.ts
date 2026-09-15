/** Blender tools (2.0). Same table drives the MCP server and the CLI commands. */
import { z } from 'zod';
import { blenderDoctor, blenderExport, blenderInspect, blenderLoad, blenderRecipe, blenderRender, blenderRunScript, blenderSession, blenderStatus, setupManagedEnv, removeManagedEnv } from '@hi3d/blender';
import type { ToolDef } from './tools.js';
import { ToolResult } from './tools.js';

const obj = (d: string) => z.string().optional().describe(d);
const OBJECT = obj('Limit to one mesh object by name (default: all mesh objects).');
const PATH_DESC = 'Path relative to the workspace (absolute paths are rejected unless the server runs with --allow-any-path).';

export const BLENDER_TOOLS: ToolDef[] = [
  {
    name: 'blender_status',
    title: 'Blender status',
    local: true,
    feature: 'blender',
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: 'Report which headless Blender backend is available (installed Blender app or managed bpy env), its version, the current session, and how to set one up if none is found. Call this before other blender_* tools when unsure.',
    schema: { refresh: z.boolean().optional().describe('Re-probe candidates instead of using the cache.'), deep: z.boolean().optional().describe('Also try every python on PATH (slow).') },
    handler: async (a, ctx) => blenderStatus({ refresh: a.refresh as boolean, deep: a.deep as boolean }, ctx.blenderCtx()),
  },
  {
    name: 'blender_doctor',
    title: 'Blender doctor',
    local: true,
    feature: 'blender',
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: 'Full diagnostic: detect all Blender candidates, start the executor, render a 64px cube with Cycles CPU, export a GLB, check the workspace is writable. Returns pass/fail per check with fix hints.',
    schema: {},
    handler: async (_a, ctx) => blenderDoctor(ctx.blenderCtx()),
  },
  {
    name: 'blender_load',
    title: 'Load model into Blender',
    local: true,
    feature: 'blender',
    annotations: { destructiveHint: true, openWorldHint: false },
    description: 'Load a model file (glb/gltf/obj/stl/fbx/usd/usdz/ply/blend) into a fresh headless Blender scene and return its statistics (faces, dimensions in metres, manifold state, textures). Seam-split vertices are welded back on import so topology checks are meaningful.',
    schema: {
      path: z.string().describe(PATH_DESC),
      clear: z.boolean().optional().describe('Clear the scene first (default true).'),
      name: obj('Rename the imported object.'),
      weld: z.boolean().optional().describe('Weld duplicate vertices on import (default auto: yes unless > 1M faces).'),
    },
    handler: async (a, ctx) => blenderLoad(a as never, ctx.blenderCtx()),
  },
  {
    name: 'blender_inspect',
    title: 'Inspect scene',
    local: true,
    feature: 'blender',
    annotations: { readOnlyHint: true, openWorldHint: false },
    description: 'Statistics of the current Blender scene: per object vertices/faces/triangles, dimensions (m and mm), materials and textures, UVs, non-manifold and boundary edges, loose parts, watertight flag, volume (cm³) for closed meshes, bounds. Use after every edit to verify.',
    schema: { detail: z.enum(['summary', 'full']).optional().describe('summary skips the slow per-object island/volume analysis.'), object: OBJECT },
    handler: async (a, ctx) => blenderInspect(a as never, ctx.blenderCtx()),
  },
  {
    name: 'blender_run_script',
    title: 'Run Python in Blender',
    local: true,
    feature: 'blender',
    annotations: { destructiveHint: true, openWorldHint: false },
    description:
      'Execute Python in the persistent headless Blender session. Globals: bpy, bmesh, mathutils, C (context), D (data), math, os, json. Set a variable named `result` to return JSON. No GUI/GPU: use the data API, bmesh and object-mode operators; edit-mode operators need an active object and bpy.ops.object.mode_set. print() output is returned. Runs with the user’s privileges on their machine (same trust as a shell). Scene state persists between calls and is autosaved to .hi3d/session.blend.',
    schema: { code: z.string().describe('Python source.'), purpose: obj('One line describing the edit (logged).'), timeout_s: z.number().int().positive().max(3600).optional().describe('Timeout, default 600.') },
    handler: async (a, ctx) => blenderRunScript(a as never, ctx.blenderCtx()),
  },
  {
    name: 'blender_render_preview',
    title: 'Render preview',
    local: true,
    feature: 'blender',
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      'Render the current scene with Cycles on CPU using automatic camera framing and a 3-light rig, and RETURN THE IMAGES so you can look at the model. Views: iso, front, back, left, right, top, bottom, iso_back. Keep resolution ≤ 768 and samples ≤ 64 for speed (512/32 ≈ seconds). engine workbench/eevee need OpenGL and are opt-in.',
    schema: {
      views: z.array(z.string()).max(8).optional().describe('Default ["iso","front"].'),
      resolution: z.number().int().min(64).max(1024).optional().describe('Pixels, default 512.'),
      samples: z.number().int().min(1).max(512).optional().describe('Cycles samples, default 32.'),
      engine: z.enum(['auto', 'cycles', 'workbench', 'eevee']).optional(),
      shading: z.enum(['material', 'solid', 'wire']).optional().describe('Workbench only.'),
      transparent: z.boolean().optional().describe('Transparent background.'),
      name: obj('Output base name under .hi3d/renders (default preview).'),
      object: OBJECT,
    },
    handler: async (a, ctx) => {
      const r = await blenderRender(a as never, ctx.blenderCtx());
      return new ToolResult(r, r.images.map((p) => ({ path: p, mimeType: 'image/png' })));
    },
  },
  {
    name: 'blender_export',
    title: 'Export scene',
    local: true,
    feature: 'blender',
    annotations: { openWorldHint: false },
    description: 'Export all (or selected) mesh objects to a file in the workspace: glb, gltf, obj, stl, fbx, usdz, ply, blend (by extension). Modifiers are applied. The output can be passed to retexture_model, split_model or multicolor_model.',
    schema: {
      path: z.string().describe(PATH_DESC + ' e.g. out/model_fixed.glb'),
      format: z.enum(['glb', 'gltf', 'obj', 'stl', 'fbx', 'usdz', 'ply', 'blend']).optional().describe('Override the format implied by the extension.'),
      apply_modifiers: z.boolean().optional(),
      objects: z.array(z.string()).optional().describe('Only these object names.'),
      draco: z.boolean().optional().describe('Draco-compress glb (smaller, not accepted by every consumer).'),
    },
    handler: async (a, ctx) => blenderExport(a as never, ctx.blenderCtx()),
  },
  {
    name: 'blender_session',
    title: 'Session',
    local: true,
    feature: 'blender',
    annotations: { openWorldHint: false },
    description: 'Inspect, save, reset or open the persistent scene (.hi3d/session.blend in the workspace). save --path / open --path write or read a separate .blend copy (autosave keeps targeting the session file); reset clears the scene.',
    schema: { action: z.enum(['info', 'save', 'reset', 'open']), path: obj('For save/open: a .blend path.') },
    handler: async (a, ctx) => blenderSession(a as never, ctx.blenderCtx()),
  },
  // ---------- recipes ----------
  recipe('blender_scale_to_size', 'Scale to size', 'Uniformly scale the model so its largest (or chosen) dimension equals size_mm, then apply the transform. Hi3D outputs are ~1–2 m; use this to bring them to real print size.', {
    size_mm: z.number().positive().optional().describe('Target size in millimetres.'),
    size_m: z.number().positive().optional().describe('Target size in metres (alternative).'),
    axis: z.enum(['max', 'x', 'y', 'z']).optional(),
    object: OBJECT,
    apply: z.boolean().optional(),
  }, 'scale_to_size', { idempotentHint: true }),
  recipe('blender_center', 'Center on origin', 'Move the model so its bounding box is centred on X/Y and (with floor) its lowest point sits on Z=0, then apply the location.', { center: z.boolean().optional(), floor: z.boolean().optional(), origin: z.enum(['bottom', 'center', 'keep']).optional(), object: OBJECT }, 'center', { idempotentHint: true }),
  recipe('blender_transform', 'Transform', 'Translate (m), rotate (degrees, XYZ euler; objects imported in quaternion mode are switched automatically) and/or scale objects, then apply.', { object: OBJECT, translate: z.array(z.number()).length(3).optional(), rotate_deg: z.array(z.number()).length(3).optional(), scale: z.union([z.number(), z.array(z.number()).length(3)]).optional(), apply: z.boolean().optional() }, 'transform'),
  recipe('blender_decimate', 'Decimate', 'Reduce face count with the Decimate modifier (collapse keeps shape and UVs; planar dissolves flat regions). Returns before/after counts. 5M → 200k faces takes ~1–2 minutes on CPU.', { target_faces: z.number().int().positive().optional(), ratio: z.number().min(0.001).max(1).optional(), method: z.enum(['collapse', 'planar']).optional(), symmetry: z.boolean().optional(), object: OBJECT }, 'decimate', { destructiveHint: true }),
  recipe('blender_repair', 'Repair mesh', 'Make the mesh printable: merge duplicate vertices, dissolve degenerate faces, delete loose geometry, fill holes, recalculate normals. Returns non-manifold counts before/after and the list of fixes applied.', { merge_distance: z.number().min(0).optional().describe('Merge vertices closer than this (metres); default auto = 1e-5 × model size. Steps that would increase the non-manifold count are rolled back.'), fill_holes: z.boolean().optional(), max_hole_sides: z.number().int().min(0).optional().describe('0 = any size.'), recalc_normals: z.boolean().optional(), delete_loose: z.boolean().optional(), dissolve_degenerate: z.boolean().optional(), triangulate: z.boolean().optional(), object: OBJECT }, 'repair', { destructiveHint: true }),
  recipe('blender_split_loose', 'Split loose parts', 'Separate disconnected pieces into individual objects, drop tiny fragments, optionally keep only the largest / top N.', { min_faces: z.number().int().min(0).optional().describe('Delete parts with fewer faces (default 50).'), keep: z.enum(['all', 'largest', 'top_n']).optional(), n: z.number().int().positive().optional(), rename_prefix: obj('Rename parts prefix_1, prefix_2 …'), object: OBJECT }, 'split_loose', { destructiveHint: true }),
  recipe('blender_join', 'Join objects', 'Join several mesh objects into one.', { names: z.array(z.string()).optional(), target_name: obj('Name of the joined object.') }, 'join', { destructiveHint: true }),
  recipe('blender_delete_objects', 'Delete objects', 'Delete mesh objects by name.', { names: z.array(z.string()).min(1) }, 'delete_objects', { destructiveHint: true }),
  recipe('blender_apply_modifiers', 'Apply modifiers', 'Apply all modifiers on the object(s).', { object: OBJECT }, 'apply_modifiers', { destructiveHint: true }),
  recipe('blender_hollow', 'Hollow (experimental)', 'Shell the model inward with the given wall thickness to save print material. Experimental: check the result with blender_inspect / blender_repair.', { wall_thickness_mm: z.number().positive().optional().describe('Wall thickness in mm (default 2).'), even_offset: z.boolean().optional().describe('Blender even-thickness correction; default false because it can blow up organic meshes. Objects whose bounding box grows >2% are rolled back.'), object: OBJECT }, 'hollow', { destructiveHint: true }),
  {
    name: 'blender_setup',
    title: 'Set up managed Blender env',
    local: true,
    feature: 'blender',
    annotations: { openWorldHint: true },
    description: 'Create ~/.hi3d/blender/envs/bpy-X.Y with a matching Python and `pip install bpy` (≈300 MB download from PyPI). Only needed when blender_status reports no backend; ask the user before running. Prefer an installed Blender app when available.',
    schema: { bpy: obj('bpy major.minor, e.g. 5.2 (default: newest installable).'), python: obj('Path to a Python interpreter of the matching version (default: uv or system python).'), force: z.boolean().optional() },
    handler: async (a, ctx) => setupManagedEnv({ bpy: a.bpy as string, python: a.python as string, force: !!a.force, log: ctx.log, quiet: false }),
  },
  {
    name: 'blender_uninstall',
    title: 'Remove managed Blender env',
    local: true,
    feature: 'blender',
    annotations: { destructiveHint: true, openWorldHint: false },
    description: 'Delete the managed bpy environment(s) under ~/.hi3d/blender/envs.',
    schema: { bpy: obj('Only this major.minor.') },
    handler: async (a) => ({ removed: removeManagedEnv(a.bpy as string | undefined) }),
  },
];

function recipe(name: string, title: string, description: string, schema: z.ZodRawShape, op: string, ann: Record<string, boolean> = {}): ToolDef {
  return {
    name,
    title,
    description: description + ' Returns before/after totals (faces, vertices, non-manifold edges, dimensions).',
    local: true,
    feature: 'blender',
    annotations: { openWorldHint: false, ...ann },
    schema,
    handler: async (a, ctx) => blenderRecipe(op, a, ctx.blenderCtx()),
  };
}
