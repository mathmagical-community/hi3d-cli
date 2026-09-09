/**
 * Static capability catalog for Hi3D. Mirrors the docs at docs.hi3d.ai.
 * Served by `who_am_i` so agents can pick models/params without guessing.
 * Prices: 1 credit = $0.02 (docs.hi3d.ai/en/api/getting-started/pricing).
 */

export const MODEL_FORMATS = { obj: 1, glb: 2, stl: 3, fbx: 4, usdz: 5, '3mf': 6 } as const;
export type ModelFormat = keyof typeof MODEL_FORMATS;

export const DEPTH_FORMATS = { exr: 1, png: 2, stl: 3, glb: 4, '3mf': 5, bmp: 6 } as const;
export type DepthFormat = keyof typeof DEPTH_FORMATS;

export const MULTICOLOR_FORMATS = { obj: 1, glb: 2, fbx: 4, '3mf': 6 } as const;
export type MulticolorFormat = keyof typeof MULTICOLOR_FORMATS;

export const REQUEST_TYPES = { geometry: 1, texture: 2, all: 3 } as const;
export type RequestType = keyof typeof REQUEST_TYPES;

export interface ModelSpec {
  model: string;
  description: string;
  pbr: boolean;
  resolutions: { name: string; credits: number; note?: string }[];
  recommendedFace?: Record<string, number>;
}

export const IMAGE_TO_3D_MODELS: ModelSpec[] = [
  {
    model: 'hi3dv3.0',
    description: 'Latest general model with PBR. Best fidelity; recommended default.',
    pbr: true,
    resolutions: [
      { name: '2048quality', credits: 105, note: 'faster' },
      { name: '2048master', credits: 455, note: 'highest quality' },
    ],
    recommendedFace: { '2048quality': 2_000_000, '2048master': 5_000_000 },
  },
  {
    model: 'hitem3dv2.1',
    description: 'General model v2.1 with PBR, cheaper than v3.0.',
    pbr: true,
    resolutions: [
      { name: '1536fast', credits: 25 },
      { name: '1536pro', credits: 45 },
    ],
  },
  {
    model: 'hitem3dv2.0',
    description: 'General model v2.0 with PBR.',
    pbr: true,
    resolutions: [{ name: '1536', credits: 35 }],
  },
  {
    model: 'hitem3dv1.5',
    description: 'General model v1.5, no PBR. Cheapest.',
    pbr: false,
    resolutions: [
      { name: '1536', credits: 30 },
      { name: '1024', credits: 20 },
      { name: '512', credits: 15 },
    ],
  },
  {
    model: 'scene-portraitv2.1',
    description: 'Portrait/character-specialised model v2.1.',
    pbr: true,
    resolutions: [{ name: '1536pro', credits: 45 }, { name: '1536fast', credits: 25 }],
  },
  {
    model: 'scene-portraitv2.0',
    description: 'Portrait/character-specialised model v2.0.',
    pbr: true,
    resolutions: [{ name: '1536', credits: 35 }],
  },
  {
    model: 'scene-portraitv1.5',
    description: 'Portrait/character-specialised model v1.5.',
    pbr: false,
    resolutions: [{ name: '1536', credits: 30 }],
  },
];

export const CATALOG = {
  creditUsd: 0.02,
  limits: {
    imageMaxBytes: 20 * 1024 * 1024,
    imageFormats: ['png', 'jpg', 'jpeg', 'webp'],
    multiViewMaxImages: 4,
    meshMaxBytes: 200 * 1024 * 1024,
    defaultConcurrency: 30,
    taskTimeoutMinutes: 60,
    resultUrlTtlMinutes: 60,
  },
  tools: {
    image_to_3d: {
      models: IMAGE_TO_3D_MODELS,
      request_type: REQUEST_TYPES,
      formats: Object.keys(MODEL_FORMATS),
      face: { min: 100_000, max: 5_000_000 },
      shading: { min: 0, max: 1, step: 0.1, default: 0.5 },
    },
    split_model: {
      models: ['character', 'general'],
      part: ['a', 'b', 'c', 'd', 'e', 'f'],
      joint: ['none', 'ball', 'dovetail', 'pin'],
      level: ['low', 'medium', 'high'],
      formats: Object.keys(MODEL_FORMATS),
      credits: 20,
    },
    image_to_relief: {
      model_type: ['base', 'pro'],
      formats: Object.keys(DEPTH_FORMATS),
      height_relief: { min: 0.1, max: 50, default: 1.3 },
      credits: 10,
    },
    multicolor_model: {
      number_color: { min: 0, max: 8, default: 4, note: '0 = max colors' },
      formats: Object.keys(MULTICOLOR_FORMATS),
      credits: 20,
    },
  },
};

export function estimateCredits(model: string, resolution?: string): number | undefined {
  const spec = IMAGE_TO_3D_MODELS.find((m) => m.model === model);
  if (!spec) return undefined;
  const res = resolution ? spec.resolutions.find((r) => r.name === resolution) : spec.resolutions[0];
  return res?.credits;
}
