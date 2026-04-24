import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { FEATURE_CATALOG, getStripe, isFeatureKey, isStripeConfigured } from '@/lib/stripe';
import { isAdminConfigured } from '@/lib/firebase-admin';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

// Stripe requires the raw request body for signature verification. In the
// Next.js App Router route handlers get an un-parsed Request, so req.text()
// returns the exact bytes Stripe signed.
export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    console.error('[stripe-webhook] STRIPE_SECRET_KEY not set');
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
  }

  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not set' }, { status: 503 });
  }

  if (!isAdminConfigured()) {
    console.error('[stripe-webhook] Firebase admin not configured — cannot record entitlement');
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature') || '';
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, whSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ received: true, skipped: 'payment not yet complete' });
  }

  const uid = (session.metadata?.uid as string | undefined) || session.client_reference_id || '';
  const featureRaw = session.metadata?.feature;

  if (!uid || !isFeatureKey(featureRaw)) {
    console.warn('[stripe-webhook] Missing uid or feature on session', session.id);
    return NextResponse.json({ received: true, skipped: 'missing metadata' });
  }

  const feature = featureRaw;
  const catalog = FEATURE_CATALOG[feature];
  const amountCents = typeof session.amount_total === 'number' ? session.amount_total : catalog.priceCents;
  const currency = (session.currency || 'aud').toUpperCase();
  const createdAt = Date.now();

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  const txRef = userRef.collection('transactions').doc(session.id);
  const payRef = userRef.collection('state').doc('payments');
  // The authoritative entitlement record lives under a server-only path so
  // Firestore rules can block client writes — a user cannot fabricate a paid
  // purchase to bypass the server feature gate.
  const entitlementRef = db
    .collection('stripe-entitlements')
    .doc(uid)
    .collection('items')
    .doc(session.id);

  let stage: 'tx_read' | 'batch_commit' = 'tx_read';
  try {
    // Idempotency — Stripe retries webhooks. If we've already written the
    // transaction for this session, skip.
    const existing = await txRef.get();
    if (existing.exists) {
      return NextResponse.json({ received: true, idempotent: true });
    }

    const purchase = {
      id: session.id,
      feature,
      name: catalog.name,
      priceCents: amountCents,
      createdAt,
      source: 'stripe'
    };

    const batch = db.batch();
    batch.set(txRef, {
      sessionId: session.id,
      paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      uid,
      feature,
      featureName: catalog.name,
      amountCents,
      currency,
      status: 'paid',
      createdAt,
      customerEmail: session.customer_details?.email || null,
      liveMode: event.livemode === true
    });
    batch.set(entitlementRef, {
      sessionId: session.id,
      feature,
      featureName: catalog.name,
      priceCents: amountCents,
      createdAt,
      source: 'stripe',
      liveMode: event.livemode === true
    });
    // Mirrored into the user's own state doc purely so the client can show
    // the purchase in its UI without a subcollection query. The server
    // feature gate ignores this copy — it only trusts the server-only
    // stripe-entitlements path above.
    batch.set(
      payRef,
      {
        purchases: FieldValue.arrayUnion(purchase),
        lastPurchaseAt: createdAt
      },
      { merge: true }
    );

    stage = 'batch_commit';
    await batch.commit();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : null;
    console.error('[stripe-webhook] Firestore write failed', { stage, code, message, uid, feature, sessionId: session.id });
    return NextResponse.json(
      { error: 'Database write failed', stage, code, detail: message },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true, uid, feature });
}
