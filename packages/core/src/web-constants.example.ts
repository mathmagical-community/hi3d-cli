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
  },
  /** object-storage target for image uploads */
  tos: { region: '', endpoint: '', bucket: '', assetHostBase: '' },
};

export type WebConstants = typeof WEB_CONSTANTS;
