// One-shot: add SRI integrity + crossorigin attributes to every Firebase SDK
// and html2pdf <script> tag in /public. Idempotent — re-running is a no-op.
// After this lands, future SDK upgrades must regenerate the hashes below.
const fs = require('fs');
const path = require('path');

const HASHES = {
  'firebase-app-compat.js':       'sha384-ViccRjS0k/lvYsrtaKXk+ES61/4PAZlFI/mPHmLC1YWzK0AIbXbI5ZXDzcm3F8gH',
  'firebase-auth-compat.js':      'sha384-+/4lqMnmLqwbdHXshvGDmBTeWlNoPRdjXi4ZsiBj10EhQXaTBe3RF5JZktdSjug6',
  'firebase-firestore-compat.js': 'sha384-7TetnPNdXXu6qURzIEXWCwpXedGGBJSXIR5Cv0gOWTB34UD5TxPHx33PhjA6wFQ3',
  'firebase-messaging-compat.js': 'sha384-G+YlsltNcQL59QCo5N1zoQkhGqujKRb2RBu6JuFYNU/ZjoPfdw1Ckm7M6wgDW3eR',
  'firebase-storage-compat.js':   'sha384-oFrOL1TiREYNET0lsYF3LjQuyi2gL7vhjH1X8vFr+umcmzAdPELopeSgbcrv4uRm',
  'firebase-app-check-compat.js': 'sha384-iF93NE9DFYjJ/GJcb4h18LKfvMn3Ppl4GSSFZ8RFvwc7OtGGQSHQXbHEdO8Rknhj',
  'html2pdf.bundle.min.js':       'sha384-aBc0BOllaGWrQx51DYt978St/L7B+21jzNGc4N/jnGD0NxGwj8S/ftRgW0AkXIak'
};

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (ext.some(x => p.endsWith(x))) out.push(p);
  }
  return out;
}

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  ...walk(path.join(ROOT, 'public'), ['.html']),
  path.join(ROOT, 'public', 'app', 'js', 'storage.js'),
  path.join(ROOT, 'public', 'app', 'js', 'push-notifications.js'),
  path.join(ROOT, 'public', 'app', 'js', 'pdf-export.js')
];

let touched = 0;
let edits = 0;

for (const file of TARGETS) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, 'utf8');
  const before = src;

  for (const [name, hash] of Object.entries(HASHES)) {
    // Match: <script src="...firebasejs/9.22.0/<name>" defer></script>
    //   OR : <script src="...html2pdf.js/0.10.2/<name>"></script>
    // Skip if integrity already present.
    const tagRe = new RegExp(
      '<script\\s+src="(https://[^"]+/' +
        name.replace(/[.+]/g, '\\$&') +
      ')"((?:\\s+defer)?)\\s*></script>',
      'g'
    );
    src = src.replace(tagRe, (m, srcUrl, deferAttr) => {
      if (m.includes('integrity=')) return m;
      edits++;
      return '<script src="' + srcUrl + '"' + deferAttr +
        ' integrity="' + hash + '" crossorigin="anonymous"></script>';
    });

    // Match the JS-side string constant forms:
    //   var X_SDK_URL = 'https://.../<name>';
    // We don't rewrite these — the runtime loader in storage.js / push-notifications.js
    // handles SRI separately at injection time. We only ensure the script tags in
    // HTML get integrity. (See loaders below for runtime injection.)
  }

  if (src !== before) {
    fs.writeFileSync(file, src);
    touched++;
    console.log('updated:', path.relative(ROOT, file));
  }
}

console.log('\nTouched ' + touched + ' files, ' + edits + ' tag(s) edited.');
