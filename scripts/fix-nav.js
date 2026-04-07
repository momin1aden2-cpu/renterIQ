/**
 * fix-nav.js — Moves <nav class="bottom-nav"> to a direct child of <body>
 * in all HTML pages. Removes duplicates from multi-view pages.
 * Also cache-busts the app.css link to ?v=3.
 */
const fs = require('fs');

// Emoji constants (safe unicode escapes)
const HOME    = '\uD83C\uDFE0';        // 🏠
const INSPECT = '\uD83D\uDCCB';        // 📋
const VAULT   = '\uD83D\uDDC4\uFE0F'; // 🗄️
const TOOLS   = '\uD83D\uDEE0\uFE0F'; // 🛠️

function makeNav(fn, active) {
  function btn(tab, icon, label, path) {
    const isActive = (tab === active);
    const cls = isActive ? ' class="nav-tab active"' : ' class="nav-tab"';
    const click = isActive ? '' : (' onclick="' + fn + '(\'' + path + '\')"');
    return '  <button' + cls + click + '><div class="tab-icon">' + icon + '</div><span class="tab-label">' + label + '</span></button>';
  }
  return [
    '<nav class="bottom-nav">',
    btn('home',    HOME,    'Home',    '/app/index.html'),
    btn('inspect', INSPECT, 'Inspect', '/app/pages/inspection.html'),
    btn('vault',   VAULT,   'Vault',   '/app/pages/vault.html'),
    btn('tools',   TOOLS,   'Tools',   '/app/pages/tools.html'),
    '</nav>'
  ].join('\n');
}

const files = [
  { f: 'public/app/pages/profile.html',            active: 'none',    fn: 'navigate' },
  { f: 'public/app/pages/rights.html',             active: 'tools',   fn: 'navigate' },
  { f: 'public/app/pages/routine-inspection.html', active: 'tools',   fn: 'navigate' },
  { f: 'public/app/pages/inspection.html',         active: 'inspect', fn: 'navigate' },
  { f: 'public/app/pages/entry-audit.html',        active: 'tools',   fn: 'navigate' },
  { f: 'public/app/pages/vault.html',              active: 'vault',   fn: 'navigate' },
  { f: 'public/app/pages/application.html',        active: 'tools',   fn: 'navigate' },
  { f: 'public/app/pages/exit.html',               active: 'tools',   fn: 'navigate' },
  { f: 'public/app/pages/lease.html',              active: 'tools',   fn: 'navigate' },
  { f: 'public/app/pages/renewal.html',            active: 'tools',   fn: 'navigate' },
  { f: 'public/app/index.html',                    active: 'home',    fn: 'navigate' },
];

const navRegex = /<nav class="bottom-nav">[\s\S]*?<\/nav>/g;

files.forEach(({ f, active, fn }) => {
  let content = fs.readFileSync(f, 'utf8');

  // Step 1: Remove ALL existing nav blocks (handles multi-view pages)
  content = content.replace(navRegex, '');

  // Step 2: Insert single clean nav directly before </body>
  const nav = makeNav(fn, active);
  content = content.replace('</body>', nav + '\n</body>');

  // Step 3: Cache-bust stylesheet link
  content = content.replace('href="/app/css/app.css"', 'href="/app/css/app.css?v=3"');

  fs.writeFileSync(f, content, 'utf8');
  console.log('✓', f);
});

console.log('\nAll done.');
