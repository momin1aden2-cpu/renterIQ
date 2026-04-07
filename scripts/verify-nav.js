const fs = require('fs');
const files = [
  'public/app/index.html',
  'public/app/pages/vault.html',
  'public/app/pages/inspection.html',
  'public/app/pages/entry-audit.html',
  'public/app/pages/routine-inspection.html',
  'public/app/pages/profile.html',
  'public/app/pages/rights.html',
  'public/app/pages/application.html',
  'public/app/pages/exit.html',
  'public/app/pages/lease.html',
  'public/app/pages/renewal.html',
  'public/app/pages/tools.html',
  'public/app/pages/tracked.html',
  'public/app/pages/webview.html',
  'public/app/pages/notifications.html',
];

let allOk = true;
files.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  const cnt = (c.match(/<nav class="bottom-nav">/g) || []).length;
  const normalized = c.replace(/\r\n/g, '\n');
  const beforeBody = normalized.includes('</nav>\n</body>');
  const v3 = c.includes('app.css?v=3');
  const ok = cnt === 1 && beforeBody && v3;
  if (!ok) allOk = false;
  const icon = ok ? '✓' : '✗';
  console.log(icon + ' ' + f.split('/').pop() + ' | navs=' + cnt + ' | beforeBody=' + beforeBody + ' | v3=' + v3);
});
console.log(allOk ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
