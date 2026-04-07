/**
 * fix-manifest.js — Adds <link rel="manifest" href="/app/manifest.json">
 * to every /public/app HTML page that is missing it.
 * Also ensures the manifest link has no query-string cache-buster.
 */
const fs = require('fs');

const files = [
  'public/app/pages/vault.html',
  'public/app/pages/inspection.html',
  'public/app/pages/entry-audit.html',
  'public/app/pages/lease.html',
  'public/app/pages/exit.html',
  'public/app/pages/rights.html',
  'public/app/pages/renewal.html',
  'public/app/pages/profile.html',
  'public/app/pages/notifications.html',
  'public/app/pages/application.html',
  'public/app/pages/routine-inspection.html',
  'public/app/pages/tracked.html',
  'public/app/pages/webview.html',
];

const MANIFEST_TAG = '<link rel="manifest" href="/app/manifest.json">';

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');

  // If already has a manifest link, normalise it (remove any ?v=... and fix path)
  if (c.includes('rel="manifest"')) {
    c = c.replace(/<link rel="manifest" href="[^"]*">/g, MANIFEST_TAG);
    fs.writeFileSync(f, c, 'utf8');
    console.log('✓ normalised:', f.split('/').pop());
    return;
  }

  // Insert manifest link after the viewport meta tag
  const viewportMeta = '<meta name="viewport"';
  const insertAfter = c.indexOf(viewportMeta);
  if (insertAfter === -1) {
    console.log('⚠ no viewport meta found:', f.split('/').pop());
    return;
  }
  const endOfLine = c.indexOf('\n', insertAfter);
  c = c.slice(0, endOfLine + 1) + MANIFEST_TAG + '\n' + c.slice(endOfLine + 1);
  fs.writeFileSync(f, c, 'utf8');
  console.log('✓ added:', f.split('/').pop());
});

console.log('\nAll done.');
