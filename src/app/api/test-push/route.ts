/**
 * POST /api/test-push
 *
 * Sends a test push notification to the current user's registered FCM tokens.
 * Uses the Firebase Admin SDK with Application Default Credentials.
 *
 * For this to work, you need either:
 *   1. GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON, OR
 *   2. Running on a Google Cloud environment (App Engine, Cloud Run, etc.) where
 *      default credentials are auto-provided
 *
 * In development, download a service account key from:
 *   Firebase Console → Project Settings → Service Accounts → Generate new private key
 * Then set: GOOGLE_APPLICATION_CREDENTIALS=./path-to-key.json
 *
 * This is a TEST endpoint — remove or protect it before production.
 */

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body.token;

    if (!token) {
      return NextResponse.json(
        { error: 'Missing "token" in request body. Pass the FCM token to send to.' },
        { status: 400 }
      );
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID not set' },
        { status: 500 }
      );
    }

    // Use the FCM V1 HTTP API with Google Auth
    // We need an access token — try to get one via the metadata server
    // (works on Google Cloud) or via service account key (local dev).
    let accessToken: string;

    try {
      // Method 1: Google Cloud metadata server (production)
      const metaResp = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        { headers: { 'Metadata-Flavor': 'Google' } }
      );
      if (metaResp.ok) {
        const tokenData = await metaResp.json();
        accessToken = tokenData.access_token;
      } else {
        throw new Error('Not on Google Cloud');
      }
    } catch {
      // Method 2: Service account key file (local development)
      // This requires the google-auth-library package
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { GoogleAuth } = require('google-auth-library');
        const auth = new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/firebase.messaging']
        });
        const client = await auth.getClient();
        const tokenResp = await client.getAccessToken();
        accessToken = tokenResp?.token || '';
      } catch (authErr) {
        return NextResponse.json({
          error: 'Cannot get auth token. For local testing, download a service account key from Firebase Console → Project Settings → Service Accounts → Generate new private key, then set GOOGLE_APPLICATION_CREDENTIALS=./path-to-key.json in your environment.',
          details: String(authErr)
        }, { status: 500 });
      }
    }

    // Send via FCM V1 API
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    const message = {
      message: {
        token: token,
        notification: {
          title: body.title || 'RenterIQ',
          body: body.body || 'Push notifications are working! 🎉'
        },
        webpush: {
          notification: {
            icon: '/assets/icons/icon-192.png',
            badge: '/assets/icons/icon-192.png',
            tag: 'riq-test-' + Date.now()
          },
          fcm_options: {
            link: body.url || '/app/index.html'
          }
        }
      }
    };

    const fcmResp = await fetch(fcmUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    const fcmData = await fcmResp.json();

    if (fcmResp.ok) {
      return NextResponse.json({ success: true, messageId: fcmData.name });
    } else {
      return NextResponse.json(
        { error: 'FCM send failed', details: fcmData },
        { status: fcmResp.status }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Test push failed', details: String(error) },
      { status: 500 }
    );
  }
}
