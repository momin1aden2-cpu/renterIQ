import Stripe from 'stripe';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  cached = new Stripe(key, { typescript: true });
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export type FeatureKey = 'lease_review' | 'entry_condition' | 'exit_bond_shield';

// Pricing is the single source of truth for server-issued Checkout sessions.
// The client catalogue in public/app/js/payments.js must mirror this.
export const FEATURE_CATALOG: Record<
  FeatureKey,
  { name: string; description: string; priceCents: number }
> = {
  lease_review: {
    name: 'Lease Review',
    description: 'Plain-English breakdown of every clause in your lease.',
    priceCents: 499
  },
  entry_condition: {
    name: 'Bond-Shield Move-In',
    description: 'Timestamped move-in evidence bundle — protects your bond from day one.',
    priceCents: 2499
  },
  exit_bond_shield: {
    name: 'Exit-Guard Bond Shield',
    description: 'Exit comparison, discrepancy flagging and bond recovery brief.',
    priceCents: 2999
  }
};

export function isFeatureKey(v: unknown): v is FeatureKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FEATURE_CATALOG, v);
}
