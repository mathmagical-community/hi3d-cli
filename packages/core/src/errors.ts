/** Error raised for any Hi3D Open API failure (HTTP or business code). */
export class Hi3DError extends Error {
  readonly code: string | number;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, opts: { code?: string | number; status?: number; details?: unknown } = {}) {
    super(message);
    this.name = 'Hi3DError';
    this.code = opts.code ?? 'UNKNOWN';
    this.status = opts.status ?? 0;
    this.details = opts.details;
  }

  toJSON() {
    return { name: this.name, code: this.code, status: this.status, message: this.message, details: this.details };
  }
}

/** Known business error codes documented at docs.hi3d.ai. */
export const KNOWN_ERROR_CODES: Record<string, string> = {
  '30010000': 'Insufficient account balance',
  '10031001': 'File exceeds 20MB',
  '10031005': 'Unsupported image format',
  '10031007': 'Both images and multi_images provided',
  '10031009': 'More than 4 multi-view images submitted',
  '50010001': 'Generation failed (timeout or parsing error; credits refunded)',
};
