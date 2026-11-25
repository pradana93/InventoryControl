// Copies the pdfjs-dist worker into /public so it can be served statically.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const destDir = path.join(__dirname, '..', 'public');
const dest = path.join(destDir, 'pdf.worker.min.mjs');

try {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('Copied pdf.worker.min.mjs to public/');
  } else {
    console.warn('pdfjs-dist worker not found; skipping copy');
  }
} catch (e) {
  console.warn('Failed to copy pdf worker:', e.message);
}
