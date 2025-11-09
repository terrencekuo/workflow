import { copyFileSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');

console.log('[Post-Build] Fixing dist directory structure...');

// Ensure popup and viewer directories exist
mkdirSync(resolve(distDir, 'popup'), { recursive: true });
mkdirSync(resolve(distDir, 'viewer'), { recursive: true });

// Move HTML files to correct locations
const filesToMove = [
  {
    src: resolve(distDir, 'src/popup/popup.html'),
    dest: resolve(distDir, 'popup/popup.html'),
  },
  {
    src: resolve(distDir, 'src/viewer/viewer.html'),
    dest: resolve(distDir, 'viewer/viewer.html'),
  },
];

filesToMove.forEach(({ src, dest }) => {
  if (existsSync(src)) {
    console.log(`[Post-Build] Moving ${src} to ${dest}`);
    copyFileSync(src, dest);
  }
});

// Fix HTML file paths to use relative paths for Chrome extension
console.log('[Post-Build] Fixing HTML file paths...');

const htmlFiles = [
  { file: resolve(distDir, 'popup/popup.html'), dir: 'popup' },
  { file: resolve(distDir, 'viewer/viewer.html'), dir: 'viewer' },
];

htmlFiles.forEach(({ file, dir }) => {
  if (existsSync(file)) {
    let content = readFileSync(file, 'utf-8');

    // Replace absolute paths with relative paths
    // Change /popup/popup.js to ./popup.js
    content = content.replace(new RegExp(`/${dir}/${dir}\\.js`, 'g'), `./${dir}.js`);
    // Change /popup/popup.css to ./popup.css
    content = content.replace(new RegExp(`/${dir}/${dir}\\.css`, 'g'), `./${dir}.css`);
    // Change /assets/ to ../assets/
    content = content.replace(/\/assets\//g, '../assets/');

    writeFileSync(file, content, 'utf-8');
    console.log(`[Post-Build] Fixed paths in ${dir}/${dir}.html`);
  }
});

// Remove src directory from dist
const srcDistDir = resolve(distDir, 'src');
if (existsSync(srcDistDir)) {
  console.log('[Post-Build] Removing dist/src directory');
  rmSync(srcDistDir, { recursive: true, force: true });
}

console.log('[Post-Build] Done!');
