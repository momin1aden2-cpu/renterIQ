# Pre-Launch Security Checklist

Run through this before posting RenterIQ anywhere public (Reddit, Facebook,
Product Hunt, press). Code-side hardening is already shipped — what's left
are console settings that can't be configured from this repo.

## 1. Set a hard billing ceiling (blocks bill-bombing)

> The single most likely attack on an indie launch is a hostile user looping
> a paid endpoint to run up your bill. Cap it before launch, not after.

1. **GCP Billing → Budgets & alerts → Create budget**
   - Scope: Project `renteriq-e1096`
   - Amount: `$100 AUD/month` (start small, raise later)
   - Alert thresholds: 50%, 90%, 100%, 120%
   - Email + SMS to `momin1aden2@gmail.com`
2. **App Hosting backend → Edit → Scaling**
   - Max instances: `5` (raise once you see steady traffic)
   - Concurrency per instance: leave default (80)

The `DISABLE_GEMINI_CALLS=true` kill switch (already wired) is the manual
brake. The budget alert is the automatic brake.

## 2. Provision Firebase App Check

The wiring is already in the code — it activates the moment the env var lands.

1. **Google Cloud Console → Security → reCAPTCHA Enterprise → Create key**
   - Type: Website key
   - Domains: `renteriq.com.au`, `auth.renteriq.com.au`, `localhost` (dev)
   - Allow all integration types
   - Copy the **Site key** (the public one, not the API key)
2. **Firebase Console → App Check → Web app → Register**
   - Provider: reCAPTCHA Enterprise
   - Paste the site key
3. **Firebase Console → App Check → APIs**
   - Cloud Firestore: **Enforce**
   - Cloud Storage for Firebase: **Enforce**
   - Authentication: **Enforce** (after testing — start unenforced)
4. **App Hosting env vars** (Console → App Hosting → Backends → Edit env)
   - `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` = `<site key from step 1>`
   - `REQUIRE_APP_CHECK` = `true` (only after step 3 is done and you've
     verified the app still works end-to-end)
5. Bump the service worker cache (`public/app/sw.js` → `CACHE_NAME`) so
   installed PWAs pull the new firebase-init.js with the App Check loader.

When `REQUIRE_APP_CHECK=true` lands, every `/api/` call without a valid
App Check token returns 401. The extract-metadata endpoint is exempt
(it's the public marketing extractor) and uses `skipAppCheck: true`.

## 3. Lock down Firebase Auth abuse vectors

1. **Firebase Console → Authentication → Settings**
   - **User actions → Email enumeration protection**: `On` (this stops
     attackers from confirming whether an email is registered).
   - **SMS region policy**: Limit to AU (`+61`) only. Stops international
     SMS pumping fraud.
2. **Authentication → Sign-in methods**
   - Disable any provider you don't actually use (Anonymous, Phone, Apple,
     etc. — only keep Email + Google).
3. **Authentication → Quotas** (or Identity Platform)
   - Sign-up rate limit: `100 per IP per hour` (default is unlimited).

## 4. Verify the deploy

Once steps 1–3 are done, redeploy and run through this list:

- [ ] Visit `renteriq.com.au` in a fresh browser. Check DevTools → Network →
      a Firestore request includes `X-Firebase-AppCheck` header.
- [ ] Hit `/api/analyze-lease` with curl (no token). Expect `401`.
- [ ] Try registering with an email that already exists. Expect generic
      "couldn't sign in" — not "user already exists".
- [ ] Sign in, navigate to `/app/pages/lease.html`, run a free review. Then
      delete `riq_payment_state` from localStorage and try again. Expect
      paywall — not another free review.
- [ ] Lighthouse → Best Practices → expect 100. Specifically:
      - HTTPS used
      - CSP present (Content-Security-Policy header)
      - SRI on cross-origin scripts
- [ ] securityheaders.com against `https://renteriq.com.au` → expect A or A+.

## 5. Already shipped (no console action needed)

- Firestore + Storage rules: user-scoped, no IDOR, server-only entitlement
  writes (`firestore.rules`, `storage.rules`).
- Stripe webhook: signature-verified, idempotent, server-only entitlement
  path (`src/app/api/stripe-webhook/route.ts`).
- Server-side feature gate on every AI endpoint (`src/lib/feature-gate.ts`).
- Per-UID rate limiting via Upstash Redis (`src/lib/rate-limit.ts`).
- Emergency Gemini kill switch (`DISABLE_GEMINI_CALLS=true`).
- Security headers — HSTS preload, X-Frame DENY, nosniff, Referrer-Policy,
  Permissions-Policy, **CSP** (`next.config.mjs`).
- Subresource Integrity (SRI) on every CDN script tag — Firebase SDK,
  html2pdf, App Check (run `node scripts/add-sri.cjs` after any SDK upgrade
  to refresh hashes).
- Server-only freebie tracker — lease-review free count moved to
  `free-grants/{uid}`, write-deny in `firestore.rules`.
- SSRF defence on the public extract-metadata endpoint (allowlist + private-IP
  resolver block).
- Open-redirect guard on pay-success and create-checkout-session.

## 6. Post-launch follow-ups (nice to have, not blockers)

- Inactive-account auto-delete Cloud Function (privacy policy commits to
  18-month deletion — see `memory/project_inactive_account_cron.md`).
- Per-property entitlement scoping (currently each Stripe purchase = unlimited
  regenerations; intent is to scope to one property per purchase).
- Move inline `<script>` blocks out of HTML so we can drop `'unsafe-inline'`
  from the script-src CSP directive.
