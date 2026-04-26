export async function GET() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    // VAPID key for Web Push (FCM). Generate at:
    // Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || null,
    // reCAPTCHA Enterprise site key for App Check. When present, the client
    // initialises App Check and attaches the token to Firestore/Storage/Auth
    // SDK calls and to our own /api/ requests. Without it, App Check stays
    // dormant — set NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY in App Hosting
    // env, then enforce in Firebase Console.
    appCheckSiteKey: process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY || null
  };

  return new Response(
    `window.__FIREBASE_CONFIG__ = ${JSON.stringify(firebaseConfig)};`,
    {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    }
  );
}
