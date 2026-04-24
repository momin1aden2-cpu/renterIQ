import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminAuth, isAdminConfigured } from './firebase-admin';

export type FeatureKey = 'lease_review' | 'entry_condition' | 'exit_bond_shield';

type GateResult =
  | { ok: true; reason: 'first_free' | 'paid' | 'admin_not_configured' }
  | { ok: false; response: NextResponse };

/** How long after purchase the server will honour it. */
const PURCHASE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Server-side feature gate. Mirrors the client-side RIQPayments.gate() rules
 * so a user who bypasses the front-end paywall (DevTools, direct POST, etc.)
 * still can't call the AI.
 *
 * Rules:
 *   - lease_review: first use free (leaseReviewCount === 0), then require a
 *     lease_review purchase within the grace window.
 *   - entry_condition / exit_bond_shield: require a matching purchase within
 *     the grace window.
 *
 * Falls open when Firebase Admin isn't configured (local dev without
 * credentials). In production, admin is always configured so the check runs.
 */
export async function requireFeature(uid: string, feature: FeatureKey): Promise<GateResult> {
  if (!isAdminConfigured() || !adminAuth()) {
    return { ok: true, reason: 'admin_not_configured' };
  }

  let leaseReviewCount = 0;
  const db = getFirestore();

  // Freebie counter lives under the user's own state doc. Users can write
  // this, so an attacker could only get *one additional* free review per
  // tampered reset — capped hard by the rate limiter on the AI route.
  try {
    const snap = await db.collection('users').doc(uid).collection('state').doc('payments').get();
    if (snap.exists) {
      const data = snap.data() as { leaseReviewCount?: number } | undefined;
      leaseReviewCount = (data && data.leaseReviewCount) || 0;
    }
  } catch (err) {
    console.warn('[feature-gate] freebie read failed:', err);
  }

  if (feature === 'lease_review' && leaseReviewCount === 0) {
    return { ok: true, reason: 'first_free' };
  }

  // Paid access lives at stripe-entitlements/{uid}/items/{sessionId}. This
  // path is server-only-write in firestore.rules so it cannot be forged
  // from the browser. Each document is created by the Stripe webhook after
  // a verified checkout.session.completed event.
  try {
    const entSnap = await db
      .collection('stripe-entitlements')
      .doc(uid)
      .collection('items')
      .get();
    const now = Date.now();
    const hasRecent = entSnap.docs.some((doc) => {
      const d = doc.data() as { feature?: string; source?: string; createdAt?: number };
      return (
        d.feature === feature &&
        d.source === 'stripe' &&
        typeof d.createdAt === 'number' &&
        now - d.createdAt <= PURCHASE_GRACE_MS
      );
    });
    if (hasRecent) return { ok: true, reason: 'paid' };
  } catch (err) {
    console.warn('[feature-gate] entitlement read failed, denying to be safe:', err);
    return {
      ok: false,
      response: NextResponse.json({ error: 'Could not verify purchase', feature }, { status: 500 })
    };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: 'Payment required for this feature', feature, code: 'FEATURE_NOT_PURCHASED' },
      { status: 402 }
    )
  };
}
