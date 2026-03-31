const fs = require('fs');
const path = require('path');

const dirs = ['public/app', 'public/app/pages'];

function processFile(filePath) {
  if (!filePath.endsWith('.html')) return;
  console.log(`Processing ${filePath}`);
  let content = fs.readFileSync(filePath, 'utf8');

  // Background and Surface Conversions
  content = content.replace(/rgba\(255,\s*255,\s*255,\s*0?\.04\)/g, 'var(--glass-surface-1)');
  content = content.replace(/rgba\(255,\s*255,\s*255,\s*0?\.06\)/g, 'var(--glass-border)');
  content = content.replace(/rgba\(255,\s*255,\s*255,\s*0?\.08\)/g, 'var(--glass-surface-2)');
  content = content.replace(/rgba\(255,\s*255,\s*255,\s*0?\.12\)/g, 'var(--glass-surface-2)');
  content = content.replace(/rgba\(255,\s*255,\s*255,\s*0?\.15\)/g, 'var(--glass-surface-2)');
  content = content.replace(/rgba\(255,\s*255,\s*255,\s*0?\.2\)/g, 'var(--border)');
  content = content.replace(/rgba\(255,\s*255,\s*255,\s*0?\.22\)/g, 'var(--glass-surface-1)');
  content = content.replace(/rgba\(255,\s*255,\s*255,\s*0?\.45\)/g, 'var(--glass-surface-2)');
  content = content.replace(/rgba\(27,\s*80,\s*200,\s*0?\.04\)/g, 'var(--glass-surface-3)');

  // Shadows
  content = content.replace(/rgba\(0,\s*0,\s*0,\s*0?\.52?\)/g, 'var(--overlay-bg)');

  // Text Color Conversions 
  // For most text, #fff should switch based on light/dark mode
  content = content.replace(/color:\s*#fff(?:fff)?/g, 'color:var(--text)');
  
  // Muted colors (e.g. rgba(255,255,255,0.6) or 0.65)
  content = content.replace(/color:\s*rgba\(255,\s*255,\s*255,\s*\.\d+\)/g, 'color:var(--muted)');
  content = content.replace(/color:\s*rgba\(255,\s*255,\s*255,\s*0\.\d+\)/g, 'color:var(--muted)');

  // However, buttons and elements explicitly set to var(--blue) should use their own text pairing var.
  // We'll revert any occurrence of "background:var(--blue);color:var(--text);" to use "color:#fff" in light mode maybe?
  // Let's rely on standard var(--text) for now, and since we already updated globals, we'll see if we need text-inverse.

  // Also fix `<meta name="theme-color" content="#050A1A">`
  content = content.replace(/<meta name="theme-color" content="#050A1A">/g, '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F4F7FF">\n<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#050A1A">');

  // Filter input fix for search.html and others
  content = content.replace(/\.filter-input{flex:1;background:var\(--blue-xl\);/g, '.filter-input{flex:1;background:var(--glass-input);width:100%;box-sizing:border-box;min-width:0;');

  fs.writeFileSync(filePath, content, 'utf8');
}

dirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isFile()) {
        processFile(fullPath);
      }
    });
  }
});
console.log('Done migrating colors!');
