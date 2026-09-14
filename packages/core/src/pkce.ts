/** PKCE (RFC 7636, S256) + state for the browser authorization login. Pure crypto, no I/O. */
import crypto from 'node:crypto';

export interface Pkce {
  /** 43-char base64url of 32 random bytes */
  codeVerifier: string;
  /** base64url(SHA-256(codeVerifier)) */
  codeChallenge: string;
  /** 43-char base64url random state, echoed back by the site */
  state: string;
}

export function newPkce(): Pkce {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  return { codeVerifier, codeChallenge: crypto.createHash('sha256').update(codeVerifier).digest('base64url'), state: crypto.randomBytes(32).toString('base64url') };
}

/** Parse what a user pastes after a manual redirect: a full callback URL or a bare code. */
export function parseAuthorizationInput(input: string, expectedState?: string): { code: string; state?: string } | undefined {
  const s = input.trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s) || s.includes('code=')) {
    try {
      const u = new URL(s.startsWith('http') ? s : `http://127.0.0.1/callback?${s.replace(/^\?/, '')}`);
      const code = u.searchParams.get('code') ?? undefined;
      const state = u.searchParams.get('state') ?? undefined;
      if (!code) return undefined;
      if (expectedState && state && state !== expectedState) return undefined;
      return { code, state };
    } catch {
      return undefined;
    }
  }
  return /^[A-Za-z0-9_-]{16,256}$/.test(s) ? { code: s } : undefined;
}
