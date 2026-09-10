import { Hi3DError } from '@hi3d/core';

export type BlenderErrorCode = 'BLENDER_NOT_AVAILABLE' | 'BLENDER_SETUP_REQUIRED' | 'BLENDER_OP_FAILED' | 'PATH_OUTSIDE_WORKSPACE' | 'BLENDER_TIMEOUT' | 'BLENDER_START_FAILED' | 'NO_BPY_WHEEL';

export class BlenderError extends Hi3DError {
  constructor(message: string, code: BlenderErrorCode, details?: unknown) {
    super(message, { code, status: 0, details });
    this.name = 'BlenderError';
  }
}
