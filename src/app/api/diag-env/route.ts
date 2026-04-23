import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Temporary diagnostic — reports which payment/admin env vars are present in
// the runtime. Never returns secret material. For FIREBASE_ADMIN_PRIVATE_KEY
// we expose only the PEM frame markers and newline encoding so the shape of
// the key can be verified without leaking the RSA body.
export async function GET() {
  function describe(name: string): { name: string; set: boolean; length: number } {
    const v = process.env[name];
    return { name, set: Boolean(v), length: v ? v.length : 0 };
  }

  const pk = process.env.FIREBASE_ADMIN_PRIVATE_KEY || '';
  const b64 = process.env.FIREBASE_ADMIN_SA_B64 || '';

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
    ],
    privateKeyShape: pk
      ? {
          length: pk.length,
          firstChar: pk.charCodeAt(0),
          lastChar: pk.charCodeAt(pk.length - 1),
          startsWithBeginMarker: pk.startsWith('-----BEGIN '),
          endsWithEndMarker: pk.trimEnd().endsWith('-----END PRIVATE KEY-----'),
          containsLiteralEscapeN: pk.indexOf('\\n') !== -1,
          containsRealNewline: pk.indexOf('\n') !== -1,
          startsWithDoubleQuote: pk.startsWith('"'),
          endsWithDoubleQuote: pk.trimEnd().endsWith('"'),
          containsCrLf: pk.indexOf('\r\n') !== -1,
          leadingWhitespaceChars: pk.length - pk.trimStart().length,
          trailingWhitespaceChars: pk.length - pk.trimEnd().length
        }
      : null,
    b64Shape: b64
      ? {
          length: b64.length,
          looksLikeBase64: /^[A-Za-z0-9+/=\s]+$/.test(b64),
          decodedLooksJson: (() => {
            try {
              const decoded = Buffer.from(b64.trim(), 'base64').toString('utf-8');
              return decoded.trimStart().startsWith('{');
            } catch {
              return false;
            }
          })()
        }
      : null
  });
}
