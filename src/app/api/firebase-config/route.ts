export async function GET() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBzDc8M982iv-ndo2EU3T-5zPvXcRwdvKs",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "renteriq-e1096.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "renteriq-e1096",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "renteriq-e1096.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1062935273922",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1062935273922:web:3d0d86e03baa4ec09f765b"
  };

  return new Response(
    `window.__FIREBASE_CONFIG__ = ${JSON.stringify(firebaseConfig)};`,
    {
      headers: {
        'Content-Type': 'application/javascript',
      },
    }
  );
}
