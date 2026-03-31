const fs = require('fs');
const path = require('path');

const dirs = ['public/app', 'public/app/pages'];

function processFile(filePath) {
  if (!filePath.endsWith('.html')) return;
  let content = fs.readFileSync(filePath, 'utf8');

  let modified = false;

  // We want to find style="..." blocks that have `color:var(--text)` AND also have `background:linear-gradient` or `background:var(--blue)`
  // A simple way is to replace color:var(--text) with color:var(--text-on-primary) inside elements that have these backgrounds.
  content = content.replace(/style="([^"]*?background:(?:linear-gradient[^;]+|var\(--blue\)|var\(--teal\))[^"]*?)"/g, (match, p1) => {
    if (p1.includes('color:var(--text)')) {
      modified = true;
      return `style="${p1.replace('color:var(--text)', 'color:var(--text-on-primary)')}"`;
    }
    return match;
  });

  // Let's also check for specific CSS classes that we might have missed in `app.css` or `search.html` inline styles
  content = content.replace(/\.filter-apply.*?(color:var\(--text\))/g, (match) => {
    modified = true;
    return match.replace('color:var(--text)', 'color:var(--text-on-primary)');
  });
  
  content = content.replace(/\.btn-[^"{]+.*?(color:var\(--text\))/g, (match) => {
    modified = true;
    return match.replace('color:var(--text)', 'color:var(--text-on-primary)');
  });
  
  // also check vault.html specific `.btn-blue-c`
  content = content.replace(/\.btn-blue-c.*?(color:var\(--text\))/g, (match) => {
    modified = true;
    return match.replace('color:var(--text)', 'color:var(--text-on-primary)');
  });

  if (modified) {
    console.log(`Fixed colors in ${filePath}`);
    fs.writeFileSync(filePath, content, 'utf8');
  }
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
console.log('Fix complete!');
