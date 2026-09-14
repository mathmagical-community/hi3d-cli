/**
 * Site-specific constants for the hi3d.ai account ("web") login mode. Not part of the repository.
 *
 * Provide them in ONE of these ways:
 *   1. copy this file to web-constants.ts (git-ignored) and fill in the values, or
 *   2. set HI3D_WEB_CONSTANTS_JSON to the JSON form of this object (runtime, or at
 *      `npm run release` time to bake it into the bundle).
 * With empty values the CLI still builds and runs; only `--mode web` is disabled (WEB_NOT_CONFIGURED).
 */
export const WEB_CONSTANTS = {
  /** value of the `appid` header the web app sends */
  appid: '',
  /** 16-byte AES-128-ECB key the web app uses for the password field */
  passwordKey: '',
  /** endpoint paths, relative to the site base URL */
  paths: {
    loginAccount: '',
    logout: '',
    renewalToken: '',
    userInfo: '',
    membershipInfo: '',
    pointAggregation: '',
    generateConfig: '',
    tosTempToken: '',
    submit: '',
    batchResult: '',
    pendingJobs: '',
    /** site page that asks the signed-in user to authorize the CLI (loopback redirect + PKCE S256) */
    authorizePage: '',
    /** endpoint that exchanges { code, codeVerifier, redirectUri, state } for the session cookie */
    authorizeToken: '',
  },
  /** object-storage target for image uploads (SigV4-style signed PUT) */
  store: {
    region: '',
    /** e.g. s3.example.com — the bucket is used as a subdomain */
    endpoint: '',
    bucket: '',
    /** public base URL where uploaded objects can be read back */
    assetHostBase: '',
    /** object key prefix, e.g. uploads/ */
    keyPrefix: '',
    /** signing scheme, e.g. { algorithm: 'AWS4-HMAC-SHA256', service: 's3', headerPrefix: 'x-amz-', secretPrefix: 'AWS4' } */
    signing: { algorithm: '', service: '', headerPrefix: '', secretPrefix: '' },
  },
};

export type WebConstants = typeof WEB_CONSTANTS;
