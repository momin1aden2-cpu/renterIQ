import { NextResponse } from 'next/server';
import { adminAuth, isAdminConfigured } from './firebase-admin';
import { checkRateLimit } from './rate-limit';

export type AuthResult =
  | { ok: true; uid: string; anonymous: boolean }
  | { ok: false; response: NextResponse };

type Options = {
  /** Requests allowed per window. Defaults to 30. */
  limit?: number;
  /** Window size in milliseconds. Defaults to 1 hour. */
  windowMs?: number;
  /** If true, an unauthenticated caller falls back to IP-bucketed rate limiting
   *  instead of returning 401. Use for endpoints that must work before sign-in. */
  allowAnonymous?: boolean;
};

/**
 * Gate an API route on a Firebase ID token + per-UID rate limit.
 *
 * Until FIREBASE_ADMIN_* env vars are set, token verification is skipped and
 * the route falls back to IP-bucketed rate limiting. This keeps local dev
 * working while still providing a defence layer in production.
 */
export async function requireAuth(
  req: Request,
  opts: Options = {}
): Promise<AuthResult> {
  const limit = opts.limit ?? 30;
  const windowMs = opts.windowMs ?? 60 * 60 * 1000;

  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : '';

  if (isAdminConfigured()) {
    if (!token) {
      if (!opts.allowAnonymous) {
        return { ok: false, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
      }
    } else {
      try {
        const decoded = await adminAuth()!.verifyIdToken(token);
        const rl = checkRateLimit('uid:' + decoded.uid, limit, windowMs);
        if (!rl.ok) {
          return { ok: false, response: NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 }) };
        }
        return { ok: true, uid: decoded.uid, anonymous: false };
      } catch {
        return { ok: false, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
      }
    }
  }

  const ip = getClientIp(req);
  const rl = checkRateLimit('ip:' + ip, Math.min(limit, 15), windowMs);
  if (!rl.ok) {
    return { ok: false, response: NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 }) };
  }
  return { ok: true, uid: '', anonymous: true };
}

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}
