import { copyFileSync, mkdirSync, rmSync, existsSync } from 'fs';
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

// Remove src directory from dist
const srcDistDir = resolve(distDir, 'src');
if (existsSync(srcDistDir)) {
  console.log('[Post-Build] Removing dist/src directory');
  rmSync(srcDistDir, { recursive: true, force: true });
}

console.log('[Post-Build] Done!');
