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

/**
 * The deployed bundle is minified, which strips license comments, so the notices
 * the site's code and its dependencies require ship as plain text beside it:
 * LICENSE.txt (this project) and THIRD-PARTY-NOTICES.txt (everything bundled in).
 */
async function writeLicenseFiles() {
  await cp(join(repo, 'LICENSE.md'), join(outDir, 'LICENSE.txt'));

  const sections = [
    'Third-party notices for the code served on this site.',
    (await readFile(join(repo, 'NOTICE'), 'utf8')).trim(),
    await vendoredNotice('src/core/crypto/bcrypt-pbkdf.ts', 'bcrypt_pbkdf + Blowfish'),
    await vendoredNotice('src/core/derive/monero-wordlist.ts', 'Monero English word list'),
  ];
  for (const name of await productionPackages()) {
    const dir = join(repo, 'node_modules', name);
    const meta = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    const file = (await readdir(dir)).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
    if (file === undefined) throw new Error(`no license file in node_modules/${name}`);
    const text = (await readFile(join(dir, file), 'utf8')).trim();
    sections.push(`${name} ${meta.version} (${meta.license})\n\n${text}`);
  }

  const rule = `\n\n${'='.repeat(78)}\n\n`;
  await writeFile(join(outDir, 'THIRD-PARTY-NOTICES.txt'), `${sections.join(rule)}\n`);
  console.log('  LICENSE.txt, THIRD-PARTY-NOTICES.txt');
}

/** The license comment at the top of a vendored source file, as plain text. */
async function vendoredNotice(path, title) {
  const source = await readFile(join(repo, path), 'utf8');
  const block = source.match(/^\s*\/\*\*?([\s\S]*?)\*\//);
  let lines;
  if (block) {
    lines = block[1].split('\n').map((line) => line.replace(/^\s*\* ?/, ''));
  } else {
    const all = source.split('\n');
    const end = all.findIndex((line) => !line.startsWith('//'));
    lines = all.slice(0, end).map((line) => line.replace(/^\/\/ ?/, ''));
  }
  return `${title} (${path})\n\n${lines.join('\n').trim()}`;
}

/** Every package the site's runtime dependencies pull in, by name. */
async function productionPackages() {
  const seen = new Set();
  const queue = Object.keys(JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')).dependencies ?? {});
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const meta = JSON.parse(await readFile(join(repo, 'node_modules', name, 'package.json'), 'utf8'));
    queue.push(...Object.keys(meta.dependencies ?? {}));
  }
  return [...seen].sort();
}

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
  await writeLicenseFiles();

  await rm(scratch, { recursive: true, force: true });

  const { size } = await stat(join(outDir, 'index.html'));
  console.log(
    `\nbuilt ${outDir} in ${(performance.now() - started).toFixed(0)} ms` +
      ` · index.html ${(size / 1024).toFixed(1)} KiB${dev ? ' · dev' : ''}`,
  );
}

await main();
