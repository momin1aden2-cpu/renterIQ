import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Temporary diagnostic — reports which payment/admin env vars are present in
// the runtime, and their lengths. Never returns values. Safe to ship briefly
// during launch debugging, then delete once Stripe + admin auth are healthy.
export async function GET() {
  function describe(name: string): { name: string; set: boolean; length: number } {
    const v = process.env[name];
    return { name, set: Boolean(v), length: v ? v.length : 0 };
  }

  return NextResponse.json({
    node: process.version,
    vars: [
      describe('FIREBASE_ADMIN_SA_B64'),
      describe('FIREBASE_ADMIN_PROJECT_ID'),
      describe('FIREBASE_ADMIN_CLIENT_EMAIL'),
      describe('FIREBASE_ADMIN_PRIVATE_KEY'),
      describe('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
      describe('STRIPE_SECRET_KEY'),
      describe('STRIPE_WEBHOOK_SECRET'),
      describe('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
      describe('NEXT_PUBLIC_APP_URL')
    ]
  });
}
