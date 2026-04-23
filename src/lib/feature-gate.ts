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

  let state: { leaseReviewCount?: number; purchases?: Array<{ feature?: string; createdAt?: number; source?: string }> } = {};
  try {
    const db = getFirestore();
    const snap = await db.collection('users').doc(uid).collection('state').doc('payments').get();
    if (snap.exists) state = snap.data() as typeof state;
  } catch (err) {
    console.warn('[feature-gate] Firestore read failed, denying to be safe:', err);
    return {
      ok: false,
      response: NextResponse.json({ error: 'Could not verify purchase', feature }, { status: 500 })
    };
  }

  // Lease review — first use is free.
  if (feature === 'lease_review' && (state.leaseReviewCount || 0) === 0) {
    return { ok: true, reason: 'first_free' };
  }

  // Any feature — accept only Stripe-confirmed purchases within the grace
  // window. Historical records written by the pre-Stripe client paywall have
  // no source field and must not unlock paid routes.
  const now = Date.now();
  const purchases = Array.isArray(state.purchases) ? state.purchases : [];
  const hasRecent = purchases.some(
    (p) =>
      p &&
      p.feature === feature &&
      p.source === 'stripe' &&
      typeof p.createdAt === 'number' &&
      now - p.createdAt <= PURCHASE_GRACE_MS
  );
  if (hasRecent) return { ok: true, reason: 'paid' };

  return {
    ok: false,
    response: NextResponse.json(
      { error: 'Payment required for this feature', feature, code: 'FEATURE_NOT_PURCHASED' },
      { status: 402 }
    )
  };
}
