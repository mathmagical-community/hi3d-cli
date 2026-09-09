/** Resolve site constants: HI3D_WEB_CONSTANTS_JSON env (runtime or baked at release build) > web-constants.ts > empty. */
import { WEB_CONSTANTS as FILE_CONSTANTS, WebConstants } from './web-constants.js';

export function loadWebConstants(): WebConstants {
  const raw = process.env.HI3D_WEB_CONSTANTS_JSON;
  if (raw) {
    try {
      const j = JSON.parse(raw) as Partial<WebConstants>;
      return { ...FILE_CONSTANTS, ...j, paths: { ...FILE_CONSTANTS.paths, ...(j.paths ?? {}) }, store: { ...FILE_CONSTANTS.store, ...(j.store ?? {}), signing: { ...FILE_CONSTANTS.store.signing, ...(j.store?.signing ?? {}) } } };
    } catch {
      /* ignore malformed env */
    }
  }
  return FILE_CONSTANTS;
}
