const fs = require('fs');

const appCssPath = 'public/app/css/app.css';
let content = fs.readFileSync(appCssPath, 'utf8');

// We want to replace hardcoded whites inside the stylesheet block, BUT avoid breaking the `:root` block opacities
// Let's split the file so we only modify everything after the `:root` and `@media` blocks.
// Actually, variables are before line 70, let's just do targeted replacements!

// Screen Header
content = content.replace(/\.screen-header\s*\.hdr-app\s*\{[^}]*color:\s*rgba\(255,255,255,[^)]+\)[^}]*\}/, 
  '.screen-header .hdr-app {\n  font-family: \'Sora\', sans-serif;\n  font-size: 11px;\n  font-weight: 700;\n  letter-spacing: 1.5px;\n  color: var(--muted);\n  text-transform: uppercase;\n}');

content = content.replace(/\.screen-header\s*\.hdr-title\s*\{[^}]*color:\s*#[fF]{3,6}[^}]*\}/, 
  '.screen-header .hdr-title {\n  font-family: \'Sora\', sans-serif;\n  font-size: 22px;\n  font-weight: 800;\n  color: var(--text);\n  line-height: 1.2;\n}');

content = content.replace(/\.screen-header\s*\.hdr-sub\s*\{[^}]*color:\s*rgba\(255,255,255,[^)]+\)[^}]*\}/, 
  '.screen-header .hdr-sub {\n  font-size: 13px;\n  color: var(--muted);\n  margin-top: 2px;\n}');

// Other random hardcoded colors
content = content.replace(/color:\s*#[fF]{3,6}\s*;/g, 'color: var(--text-on-primary); /* was #fff */');
content = content.replace(/color:\s*rgba\(255,\s*255,\s*255,\s*(0\.\d+|\.\d+)\)\s*;/g, 'color: var(--glass-surface-2); /* was rgba(white) */');

// Shadow for .screen-header
content = content.replace(/box-shadow:\s*0\s+10px\s+30px\s+rgba\(0,0,0,0\.5\)\s*;/g, 'box-shadow: var(--shadow-float);');
content = content.replace(/box-shadow:\s*0\s+2px\s+8px\s+rgba\(0,0,0,\.3\),\s*0\s+8px\s+32px\s+rgba\(0,0,0,\.6\)\s*;/g, 'box-shadow: var(--shadow-elevated);');
content = content.replace(/background:\s*linear-gradient\([^;]+var\(--blue\)[^;]+\)\s*;/g, (match) => match + '\n  color: var(--text-on-primary);');

fs.writeFileSync(appCssPath, content, 'utf8');
console.log('Fixed app.css');
