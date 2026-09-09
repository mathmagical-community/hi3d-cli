/**
 * Profile-based configuration, modelled on the Volcengine CLI (`ve configure`):
 *   ~/.hi3d/config.json = { current: "default", profiles: { <name>: Profile } }
 *
 * Two credential modes:
 *   ak   — Hi3D Open Platform Access Key / Secret Key (platform.hi3d.ai), exchanged for a bearer token
 *   web  — a hi3d.ai consumer account session (cookie + token) obtained by `hi3d login --mode web`
 *
 * Environment overrides (highest priority): HI3D_PROFILE selects a profile; HI3D_CLIENT_ID +
 * HI3D_CLIENT_SECRET (or HI3D_API_KEY=id:secret) inject an ak profile; HI3D_WEB_COOKIE injects a web one.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_BASE_URL = 'https://api.hitem3d.ai';
export const DEFAULT_WEB_BASE = 'https://www.hi3d.ai';
export const CONSOLE_URL = 'https://platform.hi3d.ai/console/apiKey';

export type ProfileMode = 'ak' | 'web';

export interface Profile {
  name: string;
  mode: ProfileMode;
  /** ak mode */
  accessKey?: string;
  secretKey?: string;
  endpoint?: string;
  accessToken?: string;
  accessTokenIssuedAt?: number;
  /** web mode */
  webBase?: string;
  cookie?: string;
  token?: string;
  webId?: string;
  account?: string;
  userId?: string;
  nickName?: string;
  loginAt?: number;
  /** how the web session was obtained: password | cookie | authorize */
  webLogin?: string;
}

export interface Config {
  current: string;
  profiles: Record<string, Profile>;
}

/** Legacy shape kept for the Open API client. */
export interface Credentials {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  accessToken?: string;
  accessTokenIssuedAt?: number;
}

export function configDir(): string {
  return process.env.HI3D_CONFIG_DIR || path.join(os.homedir(), '.hi3d');
}
export function configPath(): string {
  return path.join(configDir(), 'config.json');
}
/** @deprecated legacy single-credential file; migrated into config.json on first read */
export function credentialsPath(): string {
  return path.join(configDir(), 'credentials.json');
}

function readJson<T>(p: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

export function loadConfig(): Config {
  const cfg = readJson<Config>(configPath());
  if (cfg && cfg.profiles) return { current: cfg.current || 'default', profiles: cfg.profiles };
  // migrate legacy credentials.json
  const legacy = readJson<Credentials>(credentialsPath());
  if (legacy?.clientId && legacy.clientSecret) {
    const migrated: Config = {
      current: 'default',
      profiles: { default: { name: 'default', mode: 'ak', accessKey: legacy.clientId, secretKey: legacy.clientSecret, endpoint: legacy.baseUrl } },
    };
    try {
      saveConfig(migrated);
    } catch {
      /* read-only */
    }
    return migrated;
  }
  return { current: 'default', profiles: {} };
}

export function saveConfig(cfg: Config): string {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  return p;
}

export function upsertProfile(profile: Profile, makeCurrent = true): string {
  const cfg = loadConfig();
  cfg.profiles[profile.name] = profile;
  if (makeCurrent || !cfg.profiles[cfg.current]) cfg.current = profile.name;
  return saveConfig(cfg);
}

export function deleteProfile(name: string): boolean {
  const cfg = loadConfig();
  if (!cfg.profiles[name]) return false;
  delete cfg.profiles[name];
  if (cfg.current === name) cfg.current = Object.keys(cfg.profiles)[0] ?? 'default';
  saveConfig(cfg);
  return true;
}

export function setCurrentProfile(name: string): boolean {
  const cfg = loadConfig();
  if (!cfg.profiles[name]) return false;
  cfg.current = name;
  saveConfig(cfg);
  return true;
}

/** Profile from env overrides, then HI3D_PROFILE / current profile. */
export function loadProfile(name?: string): Profile | undefined {
  const envId = process.env.HI3D_CLIENT_ID;
  const envSecret = process.env.HI3D_CLIENT_SECRET;
  const envKey = process.env.HI3D_API_KEY;
  if (envId && envSecret) return { name: 'env', mode: 'ak', accessKey: envId, secretKey: envSecret, endpoint: process.env.HI3D_BASE_URL };
  if (envKey && envKey.includes(':')) {
    const i = envKey.indexOf(':');
    return { name: 'env', mode: 'ak', accessKey: envKey.slice(0, i), secretKey: envKey.slice(i + 1), endpoint: process.env.HI3D_BASE_URL };
  }
  if (process.env.HI3D_WEB_COOKIE) {
    return { name: 'env', mode: 'web', cookie: process.env.HI3D_WEB_COOKIE, token: process.env.HI3D_WEB_TOKEN, webBase: process.env.HI3D_WEB_BASE, webId: process.env.HI3D_WEB_ID };
  }
  const cfg = loadConfig();
  const p = cfg.profiles[name ?? process.env.HI3D_PROFILE ?? cfg.current];
  return p ? { ...p } : undefined;
}

/** Legacy accessor used by the Open API client: ak credentials of the active profile. */
export function loadCredentials(): Credentials | undefined {
  const p = loadProfile();
  if (!p || p.mode !== 'ak' || !p.accessKey || !p.secretKey) return undefined;
  return { clientId: p.accessKey, clientSecret: p.secretKey, baseUrl: process.env.HI3D_BASE_URL || p.endpoint, accessToken: p.accessToken, accessTokenIssuedAt: p.accessTokenIssuedAt };
}

/** Persist a refreshed Open API token back into the profile it came from (no-op for env profiles). */
export function saveCredentials(creds: Credentials): string | undefined {
  const cfg = loadConfig();
  const name = process.env.HI3D_PROFILE ?? cfg.current;
  const p = cfg.profiles[name];
  if (!p || p.mode !== 'ak' || p.accessKey !== creds.clientId) return undefined;
  p.accessToken = creds.accessToken;
  p.accessTokenIssuedAt = creds.accessTokenIssuedAt;
  return saveConfig(cfg);
}

/** Persist web-session fields (cookie/token/user) into a named profile. */
export function saveWebSession(name: string, patch: Partial<Profile>): string | undefined {
  const cfg = loadConfig();
  const p = cfg.profiles[name];
  if (!p || p.mode !== 'web') return undefined;
  Object.assign(p, patch);
  return saveConfig(cfg);
}

export function clearCredentials(name?: string): boolean {
  const cfg = loadConfig();
  const target = name ?? cfg.current;
  const ok = deleteProfile(target);
  try {
    fs.unlinkSync(credentialsPath());
  } catch {
    /* none */
  }
  return ok;
}

/** Redacted view for `configure list/get` and `status`. */
export function describeProfile(p: Profile) {
  const mask = (s?: string) => (s ? s.slice(0, 4) + '…' + s.slice(-3) : undefined);
  return p.mode === 'ak'
    ? { name: p.name, mode: p.mode, accessKey: mask(p.accessKey), endpoint: p.endpoint ?? DEFAULT_BASE_URL, hasToken: !!p.accessToken }
    : { name: p.name, mode: p.mode, webBase: p.webBase ?? DEFAULT_WEB_BASE, account: p.account, userId: p.userId, nickName: p.nickName, login: p.webLogin, loginAt: p.loginAt ? new Date(p.loginAt).toISOString() : undefined, hasCookie: !!p.cookie };
}

/** Extra headers required when traffic goes through the sandbox egress proxy. */
export function proxyHeaders(): Record<string, string> {
  const t = process.env.HI3D_SANDBOX_TOKEN;
  return t ? { 'x-sandbox-token': t } : {};
}

/** Rewrite an arbitrary download URL through the proxy's /fetch route when sandboxed. */
export function fetchViaProxy(url: string): string {
  const p = process.env.HI3D_FETCH_PROXY;
  if (!p) return url;
  try {
    if (url.startsWith(new URL(p).origin)) return url; // already a proxy URL
  } catch {
    return url;
  }
  return `${p}?url=${encodeURIComponent(url)}`;
}
