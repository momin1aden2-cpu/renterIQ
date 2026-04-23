import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { FEATURE_CATALOG, getStripe, isFeatureKey, isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';

const ALLOWED_RETURN_PREFIX = '/app/';
const FALLBACK_RETURN = '/app/pages/profile.html';

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Payments are not configured yet' }, { status: 503 });
  }

  const auth = await requireAuth(req, { limit: 20 });
  if (!auth.ok) return auth.response;
  if (auth.anonymous || !auth.uid) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  let body: { feature?: unknown; returnTo?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!isFeatureKey(body.feature)) {
    return NextResponse.json({ error: 'Unknown feature' }, { status: 400 });
  }
  const feature = body.feature;
  const catalogItem = FEATURE_CATALOG[feature];
  const returnTo = sanitiseReturn(body.returnTo);
  const customerEmail = sanitiseEmail(body.email);

  const base = resolveAppUrl(req);
  if (!base) {
    return NextResponse.json({ error: 'App URL not configured' }, { status: 500 });
  }

  const successUrl =
    base +
    '/app/pages/pay-success.html?session_id={CHECKOUT_SESSION_ID}&return=' +
    encodeURIComponent(returnTo);
  const cancelUrl = base + returnTo + (returnTo.indexOf('?') >= 0 ? '&' : '?') + 'paid=cancelled';

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: {
              name: 'RenterIQ — ' + catalogItem.name,
              description: catalogItem.description
            },
            unit_amount: catalogItem.priceCents
          },
          quantity: 1
        }
      ],
      client_reference_id: auth.uid,
      customer_email: customerEmail || undefined,
      metadata: { uid: auth.uid, feature, returnTo },
      payment_intent_data: {
        metadata: { uid: auth.uid, feature }
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: false
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL' }, { status: 502 });
    }

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('[create-checkout-session] Stripe error', err);
    return NextResponse.json({ error: 'Could not create checkout session' }, { status: 500 });
  }
}

function sanitiseReturn(v: unknown): string {
  if (typeof v !== 'string') return FALLBACK_RETURN;
  if (!v.startsWith(ALLOWED_RETURN_PREFIX)) return FALLBACK_RETURN;
  if (v.includes('..') || v.includes('//') || v.includes('\\')) return FALLBACK_RETURN;
  return v;
}

function sanitiseEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim().toLowerCase();
  if (!trimmed || trimmed.length > 200) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function resolveAppUrl(req: Request): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  if (env) return env;
  const origin = req.headers.get('origin') || '';
  if (origin) return origin.replace(/\/+$/, '');
  const host = req.headers.get('host') || '';
  if (host) {
    const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
    return proto + '://' + host;
  }
  return '';
}
