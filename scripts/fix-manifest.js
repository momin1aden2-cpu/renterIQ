/**
 * fix-manifest.js — Ensures all HTML pages link to /manifest.json (root manifest)
 * with NO query string. The root manifest has scope:"/" which covers all rewrite URLs.
 */
const fs = require('fs');

const files = [
  'public/app/index.html',
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
  'public/app/pages/tools.html',
  'public/app/pages/routine-inspection.html',
  'public/app/pages/tracked.html',
  'public/app/pages/webview.html',
];

const CORRECT_TAG = '<link rel="manifest" href="/manifest.json">';

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');

  if (c.includes('rel="manifest"')) {
    // Replace any existing manifest link (with any path/query string) with the correct one
    c = c.replace(/<link rel="manifest" href="[^"]*">/g, CORRECT_TAG);
  } else {
    // Add manifest link after viewport meta if missing entirely
    const viewportIdx = c.indexOf('<meta name="viewport"');
    if (viewportIdx !== -1) {
      const endOfLine = c.indexOf('\n', viewportIdx);
      c = c.slice(0, endOfLine + 1) + CORRECT_TAG + '\n' + c.slice(endOfLine + 1);
    }
  }

  fs.writeFileSync(f, c, 'utf8');
  
  // Verify
  const has = c.includes(CORRECT_TAG);
  console.log((has ? '✓' : '✗') + ' ' + f.split('/').pop());
});

console.log('\nAll done.');
