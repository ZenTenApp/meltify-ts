#!/usr/bin/env node
/**
 * Builds the site into `site/dist/` as a static artifact.
 *
 *   node site/build.mjs            # minified, hashed asset names
 *   node site/build.mjs --dev      # unminified + inline sourcemaps
 *
 * Output is what you upload to a static host: index.html, assets/*, and
 * whatever is in site/public (the .htaccess that carries the CSP).
 */

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, '..');
const outDir = join(root, 'dist');
const assetsDir = join(outDir, 'assets');
const scratch = join(root, '.build');
const publicDir = join(root, 'public');
const dev = process.argv.includes('--dev');

const common = {
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  logLevel: 'warning',
  alias: { 'meltify-ts': join(repo, 'src', 'index.ts') },
  loader: { '.css': 'css' },
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
};

const hash = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 8);

async function emit(sourceFile, name, extension) {
  const scratchDir = join(scratch, name);
  await build({ ...common, entryPoints: [join(root, 'src', sourceFile)], outdir: scratchDir });

  const produced = await readdir(scratchDir);
  const entry = produced.find((file) => extname(file) === extension);
  if (entry === undefined) throw new Error(`esbuild produced no ${extension} for ${sourceFile}`);

  const buffer = await readFile(join(scratchDir, entry));
  const filename = `${name}.${hash(buffer)}${extension}`;
  await writeFile(join(assetsDir, filename), buffer);
  const kb = (buffer.byteLength / 1024).toFixed(1);
  console.log(`  assets/${filename}  ${kb} KiB`);
  return `assets/${filename}`;
}

async function main() {
  const started = performance.now();
  await rm(outDir, { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });

  // The worker ships first: the page needs its hashed URL at build time.
  const workerUrl = await emit('worker/entry.ts', 'worker', '.js');

  const appScratch = join(scratch, 'app');
  await build({
    ...common,
    entryPoints: [join(root, 'src', 'main.ts')],
    outdir: appScratch,
    define: { __WORKER_URL__: JSON.stringify(workerUrl) },
  });

  const produced = await readdir(appScratch);
  let jsUrl = '';
  let cssUrl = '';
  for (const file of produced) {
    const buffer = await readFile(join(appScratch, file));
    const extension = extname(file);
    const name = `app.${hash(buffer)}${extension}`;
    await writeFile(join(assetsDir, name), buffer);
    console.log(`  assets/${name}  ${(buffer.byteLength / 1024).toFixed(1)} KiB`);
    if (extension === '.js') jsUrl = `assets/${name}`;
    if (extension === '.css') cssUrl = `assets/${name}`;
  }
  if (jsUrl === '' || cssUrl === '') throw new Error('esbuild produced no app js/css');

  const shell = await readFile(join(root, 'index.html'), 'utf8');
  const html = shell.replaceAll('%CSS%', cssUrl).replaceAll('%JS%', jsUrl);
  await writeFile(join(outDir, 'index.html'), html);
  console.log(`  index.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB`);

  await cp(publicDir, outDir, { recursive: true, force: true });
  const published = await readdir(publicDir, { withFileTypes: true });
  for (const entry of published) console.log(`  ${entry.name} (from public/)`);

  await rm(scratch, { recursive: true, force: true });

  const { size } = await stat(join(outDir, 'index.html'));
  console.log(
    `\nbuilt ${outDir} in ${(performance.now() - started).toFixed(0)} ms` +
      ` · index.html ${(size / 1024).toFixed(1)} KiB${dev ? ' · dev' : ''}`,
  );
}

await main();
