#!/usr/bin/env node
/**
 * Static server for the built site.
 *
 *   node site/serve.mjs                 # serve site/dist (built first if missing)
 *   node site/serve.mjs --build         # rebuild, then serve
 *   node site/serve.mjs --build --dev   # unminified build with inline sourcemaps
 *   PORT=8080 node site/serve.mjs
 *
 * Inside the piso worker the listener binds 0.0.0.0 so the gateway can publish
 * the port; otherwise it stays on loopback. The CSP the production host gets
 * via .htaccess is applied here as a header so local and deployed behave alike.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = join(root, 'dist');
const port = Number(process.env.PORT ?? 5174);
const pisoSlug = process.env.PISO_WORKER_SLUG;
const host = process.env.HOST ?? (pisoSlug === undefined ? '127.0.0.1' : '0.0.0.0');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runBuild() {
  const args = ['build.mjs'];
  if (process.argv.includes('--dev')) args.push('--dev');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`build failed (exit ${code})`)),
    );
  });
}

if (process.argv.includes('--build') || !(await exists(join(dist, 'index.html')))) {
  await runBuild();
}

const server = createServer(async (request, response) => {
  let url;
  try {
    // A protocol-relative path such as `//` throws ERR_INVALID_URL; answer it, don't crash.
    url = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`);
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain' }).end('bad request');
    return;
  }

  if (url.pathname === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain' }).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const target = normalize(join(dist, pathname));
  if (!target.startsWith(dist.endsWith(sep) ? dist : dist + sep)) {
    response.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
    return;
  }

  try {
    const body = await readFile(target);
    const immutable = pathname.includes('/assets/');
    response.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'content-security-policy': CSP,
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'cross-origin-opener-policy': 'same-origin',
      'permissions-policy': 'geolocation=(), microphone=(), camera=()',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
    });
    response.end(body);
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'ENOENT' || code === 'EISDIR') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(error));
  }
});

server.listen(port, host, () => {
  const display = host === '0.0.0.0' ? 'localhost' : host;
  console.log(`\n  meltify site → http://${display}:${port}/`);
  if (pisoSlug !== undefined && host === '0.0.0.0') {
    console.log(`  via piso     → http://${pisoSlug}-${port}.piso.local/`);
    console.log(`                 http://piso.local/?route=${pisoSlug}-${port}`);
  }
  console.log('\n  Ctrl-C to stop.\n');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
