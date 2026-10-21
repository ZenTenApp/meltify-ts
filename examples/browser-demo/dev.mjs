#!/usr/bin/env node
/**
 * Builds the browser demo with esbuild and serves it locally.
 *
 *   npm run demo
 *   PORT=8080 npm run demo
 *
 * No extra dependencies: esbuild is already a devDependency and the static
 * server is node:http.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));
const outfile = join(root, 'app.js');
const port = Number(process.env.PORT ?? 5173);
// In a piso worker the gateway publishes ports from the container network, so
// the listener must not be loopback-only. Outside piso, stay on loopback.
const pisoSlug = process.env.PISO_WORKER_SLUG;
const host = process.env.HOST ?? (pisoSlug === undefined ? '127.0.0.1' : '0.0.0.0');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const result = await build({
  entryPoints: [join(root, 'app.ts')],
  outfile,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  sourcemap: true,
  logLevel: 'warning',
});

for (const warning of result.warnings) console.warn(warning.text);
const { size } = await stat(outfile);
console.log(`built app.js  ${(size / 1024).toFixed(1)} KiB`);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    const target = normalize(join(root, pathname));
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      // The demo is fully self-contained; this documents that clearly.
      'content-security-policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'",
    });
    res.end(body);
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'ENOENT' || code === 'EISDIR') {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(error));
  }
});

server.listen(port, host, () => {
  const display = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`\n  meltify-ts browser demo → http://${display}:${port}/`);
  if (pisoSlug !== undefined && host === '0.0.0.0') {
    console.log(`  via piso gateway        → http://piso.local/?route=${pisoSlug}-${port}`);
    console.log(`                            http://${pisoSlug}-${port}.piso.local/`);
  }
  console.log('\n  Ctrl-C to stop. Nothing is uploaded; the derive path makes no network calls.\n');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
