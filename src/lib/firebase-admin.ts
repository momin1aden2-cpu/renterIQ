import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

let cached: { app: App | null; auth: Auth | null } | null = null;

function init(): { app: App | null; auth: Auth | null } {
  if (cached) return cached;

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    cached = { app: null, auth: null };
    return cached;
  }

  const privateKey = normalisePrivateKey(rawKey);

  try {
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    cached = { app, auth: getAuth(app) };
  } catch (err) {
    console.error('[firebase-admin] initializeApp threw', err);
    cached = { app: null, auth: null };
  }
  return cached;
}

// Hosting consoles differ in how they store multi-line secrets. This tolerates
// the common paste accidents:
//   - surrounding whitespace
//   - surrounding single or double quotes the console added literally
//   - literal "\n" escape sequences (two chars) that never got unescaped
//   - Windows CRLF line endings
// If the key is already a well-formed PEM with real newlines, this is a no-op.
function normalisePrivateKey(raw: string): string {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  if (key.indexOf('\\n') !== -1 && key.indexOf('\n') === -1) {
    key = key.replace(/\\n/g, '\n');
  }
  key = key.replace(/\r\n/g, '\n');
  return key;
}

export function adminAuth(): Auth | null {
  return init().auth;
}

export function isAdminConfigured(): boolean {
  return init().auth !== null;
}
