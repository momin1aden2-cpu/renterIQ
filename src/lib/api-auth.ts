import { NextResponse } from 'next/server';
import { adminAppCheck, adminAuth, isAdminConfigured } from './firebase-admin';
import { checkRateLimit } from './rate-limit';

export type AuthResult =
  | { ok: true; uid: string; anonymous: boolean }
  | { ok: false; response: NextResponse };

/**
 * Emergency kill switch for every AI-backed route. Set DISABLE_GEMINI_CALLS=true
 * in the hosting environment to halt model usage without a redeploy. Call this
 * at the top of an AI route before requireAuth so the short-circuit is instant
 * and doesn't consume any rate-limit budget.
 */
export function aiKillSwitch(): NextResponse | null {
  if (process.env.DISABLE_GEMINI_CALLS === 'true') {
    return NextResponse.json(
      { error: 'AI service is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }
  return null;
}

type Options = {
  /** Requests allowed per window. Defaults to 30. */
  limit?: number;
  /** Window size in milliseconds. Defaults to 1 hour. */
  windowMs?: number;
  /** If true, an unauthenticated caller falls back to IP-bucketed rate limiting
   *  instead of returning 401. Use for endpoints that must work before sign-in. */
  allowAnonymous?: boolean;
  /** If true, skip App Check verification for this route. Use only for
   *  endpoints that must work without a configured client (e.g. public
   *  marketing-page metadata). Defaults to false. */
  skipAppCheck?: boolean;
};

/**
 * Verify the X-Firebase-AppCheck header on an incoming request. Returns:
 *   - 'pass'   — header verified by Firebase
 *   - 'absent' — header missing (caller decides whether to enforce)
 *   - 'fail'   — header present but invalid (always reject)
 *
 * Enforcement is gated on REQUIRE_APP_CHECK=true so we can ship the wiring
 * before the reCAPTCHA Enterprise site key is provisioned. Once the key is
 * live in production, set REQUIRE_APP_CHECK=true to make missing/invalid
 * tokens a hard 401.
 */
async function verifyAppCheck(req: Request): Promise<'pass' | 'absent' | 'fail'> {
  const token = req.headers.get('x-firebase-appcheck') || '';
  if (!token) return 'absent';
  const checker = adminAppCheck();
  if (!checker) return 'absent';
  try {
    await checker.verifyToken(token);
    return 'pass';
  } catch {
    return 'fail';
  }
}

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

  // App Check — verify the request came from our genuine client, not a
  // scripted attacker hitting the API directly with a stolen ID token.
  // Always reject a present-but-invalid token. Enforce missing tokens only
  // when REQUIRE_APP_CHECK=true (so we can ship the wiring before the
  // site key is provisioned).
  if (!opts.skipAppCheck) {
    const ac = await verifyAppCheck(req);
    if (ac === 'fail') {
      return { ok: false, response: NextResponse.json({ error: 'App Check verification failed' }, { status: 401 }) };
    }
    if (ac === 'absent' && process.env.REQUIRE_APP_CHECK === 'true') {
      return { ok: false, response: NextResponse.json({ error: 'App Check token required' }, { status: 401 }) };
    }
  }

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
        const rl = await checkRateLimit('uid:' + decoded.uid, limit, windowMs);
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
  const rl = await checkRateLimit('ip:' + ip, Math.min(limit, 15), windowMs);
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
