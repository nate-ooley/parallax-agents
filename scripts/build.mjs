import { copyFile, lstat, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DIST_DIR = resolve(PROJECT_ROOT, 'dist');

// Only these public files may be published. Tests, documentation, credentials,
// source configuration, and the server-side API are never copied into dist.
export const PUBLIC_FILES = Object.freeze([
  'index.html',
  'styles.css',
  'main.js',
  'city-demo/index.html',
  'city-demo/styles.css',
  'city-demo/app.js',
  'city-demo/engine.js',
  'city-demo/connections.js',
  'city-demo/city.js',
]);

export async function build() {
  // Validate the complete input before clearing the previous build.
  await Promise.all(PUBLIC_FILES.map(async (file) => {
    const info = await lstat(resolve(PROJECT_ROOT, file));
    if (!info.isFile()) throw new Error(`Public asset must be a regular file: ${file}`);
  }));
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(resolve(DIST_DIR, 'city-demo'), { recursive: true });
  await Promise.all(PUBLIC_FILES.map(file => copyFile(
    resolve(PROJECT_ROOT, file), resolve(DIST_DIR, file),
  )));
  return DIST_DIR;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
  console.log(`Built ${PUBLIC_FILES.length} public assets in dist/`);
}
