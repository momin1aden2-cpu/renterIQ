// Insert the App Check compat SDK <script> tag immediately after the
// firebase-firestore-compat tag in every HTML page that uses Firebase.
// Idempotent — re-running is a no-op.
const fs = require('fs');
const path = require('path');

const APPCHECK_TAG =
  '<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-check-compat.js"' +
  ' defer integrity="sha384-iF93NE9DFYjJ/GJcb4h18LKfvMn3Ppl4GSSFZ8RFvwc7OtGGQSHQXbHEdO8Rknhj"' +
  ' crossorigin="anonymous"></script>';

const FIRESTORE_TAG_RE = /<script src="https:\/\/www\.gstatic\.com\/firebasejs\/9\.22\.0\/firebase-firestore-compat\.js"[^>]*><\/script>/;

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (ext.some(x => p.endsWith(x))) out.push(p);
  }
  return out;
}

const ROOT = path.resolve(__dirname, '..');
const FILES = walk(path.join(ROOT, 'public'), ['.html']);

let touched = 0;
for (const file of FILES) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('firebase-app-check-compat.js')) continue;
  if (!FIRESTORE_TAG_RE.test(src)) continue;
  src = src.replace(FIRESTORE_TAG_RE, m => m + '\n' + APPCHECK_TAG);
  fs.writeFileSync(file, src);
  touched++;
  console.log('updated:', path.relative(ROOT, file));
}
console.log('\nTouched ' + touched + ' files.');
