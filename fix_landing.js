const fs = require('fs');

const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Add app.css reference
content = content.replace(
  '<link rel="manifest" href="/app/manifest.json">',
  '<link rel="manifest" href="/app/manifest.json">\n<link rel="stylesheet" href="/app/css/app.css">'
);

// 2. Remove the hardcoded root block from style
content = content.replace(/:root\s*\{[^}]+\}/, '/* Root variables now inherited from app.css */');

// 3. Perform string replacements mapping Landing Page vars to App vars
const map = {
  'var(--bg-dark)': 'var(--blue-xl)',
  'var(--bg-darker)': 'var(--glass-surface-3)',
  'var(--cyan)': 'var(--blue)',
  'var(--cyan-glow)': 'rgba(0,184,217,0.5)',
  'var(--cyan-dim)': 'var(--blue-lt)',
  'var(--indigo)': 'var(--teal)',
  'var(--indigo-dark)': 'var(--teal-dk)',
  'var(--indigo-glow)': 'rgba(0,200,150,0.3)',
  'var(--border-light)': 'var(--border)',
};

for (const [find, replace] of Object.entries(map)) {
  content = content.split(find).join(replace);
}

// 4. Handle `#fff` text which might break in light mode
content = content.replace(/color:\s*#fff/g, 'color: var(--text)');
content = content.replace(/color:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.3\s*\)/g, 'color: var(--muted)');

// But .nav-cta (the button) needs to be inverted of text
content = content.replace(/\.nav-cta\s*\{[^}]*background:\s*var\(--text\);[^}]*\}/, 
  (match) => match.replace('color: var(--bg-dark) !important', 'color: var(--text-on-primary) !important').replace('background: var(--text)', 'background: var(--blue)')
);

// Also buttons hover states and text-on-primary
content = content.replace(/\.btn-teal[^}]*color:\s*var\(--text\)[^}]*/g, 
  (match) => match.replace('color: var(--text)', 'color: var(--text-on-primary)')
);
content = content.replace(/\.btn-teal\s*\{[^}]*color:\s*var\(--text\)[^}]*\}/g,
  (match) => match.replace('color: var(--text)', 'color: var(--text-on-primary)')
);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed public/index.html');
