/** Pick the Hi3D backend (Open Platform ak, or consumer web session) for the active profile. */
import { Hi3DError } from './errors.js';
import { Profile, loadProfile } from './config.js';
import { Hi3DClient } from './client.js';
import { Hi3DWebClient } from './web-client.js';

/** The surface ops.ts needs; both clients implement it. */
export type Hi3DBackend = Pick<
  Hi3DClient,
  'baseUrl' | 'submitImageTo3D' | 'queryTask' | 'pollTask' | 'download' | 'downloadTaskAssets' | 'balance' | 'submitSplit' | 'submitDepth' | 'submitMulticolor'
>;

export function createBackend(profile?: Profile): Hi3DBackend {
  const p = profile ?? loadProfile();
  if (!p) {
    throw new Hi3DError('No Hi3D credentials. Run `hi3d-cli login` (Open Platform AK/SK or hi3d.ai account) or set HI3D_CLIENT_ID/HI3D_CLIENT_SECRET.', { code: 'NO_CREDENTIALS', status: 401 });
  }
  if (p.mode === 'web') return new Hi3DWebClient({ profile: p }) as unknown as Hi3DBackend;
  if (!p.accessKey || !p.secretKey) throw new Hi3DError(`Profile "${p.name}" has no access key / secret key`, { code: 'NO_CREDENTIALS', status: 401 });
  return new Hi3DClient({ credentials: { clientId: p.accessKey, clientSecret: p.secretKey, baseUrl: p.endpoint, accessToken: p.accessToken, accessTokenIssuedAt: p.accessTokenIssuedAt }, persistToken: p.name !== 'env' });
}
