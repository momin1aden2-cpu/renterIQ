import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

let cached: { app: App | null; auth: Auth | null } | null = null;

function init(): { app: App | null; auth: Auth | null } {
  if (cached) return cached;

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    cached = { app: null, auth: null };
    return cached;
  }

  privateKey = privateKey.replace(/\\n/g, '\n');

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

  cached = { app, auth: getAuth(app) };
  return cached;
}

export function adminAuth(): Auth | null {
  return init().auth;
}

export function isAdminConfigured(): boolean {
  return init().auth !== null;
}
