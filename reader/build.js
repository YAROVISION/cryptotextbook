const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const bookDir = path.resolve(projectRoot, 'book');
const publicSrcDir = path.resolve(__dirname, 'public');
const distDir = path.resolve(projectRoot, 'dist');

console.log('Building static textbook reader...');
console.log(`Source book dir: ${bookDir}`);
console.log(`Source public dir: ${publicSrcDir}`);
console.log(`Output dist dir: ${distDir}`);

// 1. Recreate dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 2. Copy public assets to dist
copyDirSync(publicSrcDir, distDir);
console.log('✓ Copied web assets.');

// 3. Copy book folder to dist/book
const distBookDir = path.join(distDir, 'book');
copyDirSync(bookDir, distBookDir);
console.log('✓ Copied textbook chapters.');

// 4. Generate chapters.json
try {
  const files = fs.readdirSync(bookDir).filter(file => file.endsWith('.md'));
  
  // Sort logic (same as server.js)
  const priorityOrder = ['index.md', 'schema.md', 'log.md'];
  files.sort((a, b) => {
    const idxA = priorityOrder.indexOf(a);
    const idxB = priorityOrder.indexOf(b);
    
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    
    const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
    const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
    
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });

  const chapters = files.map(file => {
    const stats = fs.statSync(path.join(bookDir, file));
    let title = file.replace('.md', '');
    return {
      filename: file,
      title: title,
      size: stats.size,
      mtime: stats.mtime
    };
  });

  fs.writeFileSync(
    path.join(distDir, 'chapters.json'),
    JSON.stringify(chapters, null, 2),
    'utf-8'
  );
  console.log('✓ Generated chapters.json.');
  console.log('==================================================');
  console.log('🎉 Static build complete! Output is in the "dist" folder.');
  console.log('You can deploy the "dist" folder directly to GitHub Pages.');
  console.log('==================================================');
} catch (error) {
  console.error('Error generating chapters.json:', error);
  process.exit(1);
}
