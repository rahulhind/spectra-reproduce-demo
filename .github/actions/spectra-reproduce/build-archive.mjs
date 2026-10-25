// A built site, carried from CI to a hosted worker (owner's decision, 25 Oct 2026: no preview deployment needed).
//
//   packBuild(dir)           a folder as a .tar.gz (ustar), for the CLI to upload
//   unpackBuild(buf, dest)   the archive written out under dest, refusing any entry that would land outside it
//   serveBuild(dir)          the folder served on loopback for the length of a check, the index page for any
//                            address that is not a file (client-side routing), nothing outside the folder
//
// No dependencies: the CLI ships alone in the GitHub Action, and the worker image carries no npm packages but Playwright.
import http from 'node:http';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep, extname, dirname } from 'node:path';

const BLOCK = 512;

function header(name, size) {
  const h = Buffer.alloc(BLOCK);
  // ustar: the name in two parts when it is long (prefix 155, name 100).
  let prefix = '';
  let base = name;
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', 155);
    if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error(`path too long for the archive: ${name}`);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  h.write(base, 0, 100);
  h.write('0000644\0', 100, 8);
  h.write('0000000\0', 108, 8);
  h.write('0000000\0', 116, 8);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124, 12);
  h.write('00000000000\0', 136, 12);
  h.write('        ', 148, 8);
  h.write('0', 156, 1);
  h.write('ustar\0', 257, 6);
  h.write('00', 263, 2);
  h.write(prefix, 345, 155);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

export function packBuild(dir) {
  const root = resolve(dir);
  const parts = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) {
        const body = readFileSync(full);
        parts.push(header(relative(root, full).split(sep).join('/'), body.length), body, Buffer.alloc((BLOCK - (body.length % BLOCK)) % BLOCK));
      }
    }
  };
  walk(root);
  parts.push(Buffer.alloc(BLOCK * 2));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

export function unpackBuild(archive, dest) {
  const root = resolve(dest);
  const tar = gunzipSync(archive);
  let files = 0;
  for (let at = 0; at + BLOCK <= tar.length; ) {
    const h = tar.subarray(at, at + BLOCK);
    if (h.every((b) => b === 0)) break;
    const str = (o, n) => h.subarray(o, o + n).toString('utf8').replace(/\0[\s\S]*$/, '');
    const name = [str(345, 155), str(0, 100)].filter(Boolean).join('/');
    const size = parseInt(str(124, 12).trim() || '0', 8);
    const type = str(156, 1) || '0';
    at += BLOCK;
    if (type === '0' && name) {
      const out = resolve(root, name);
      if (out !== root && !out.startsWith(root + sep)) throw new Error(`an entry would land outside the build: ${name}`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, tar.subarray(at, at + size));
      files++;
    }
    at += Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
}

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain', '.map': 'application/json', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };

export function serveBuild(dir) {
  const root = resolve(dir);
  const server = http.createServer(async (req, res) => {
    let file;
    try {
      file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(404);
      return res.end();
    }
    // A build made for a path (a site at https://host/app/, its assets at /app/assets/...) is served here from the
    // root: an address that is not a file is tried again without its leading segments, so /app/assets/x.js is
    // assets/x.js. Only then the index page, for client-side routes.
    const isFile = async (p) => (await stat(p).catch(() => null))?.isFile() ?? false;
    if (!(await isFile(file))) {
      const parts = relative(root, file).split(sep);
      let found = null;
      for (let k = 1; k < parts.length && !found; k++) {
        const candidate = join(root, ...parts.slice(k));
        if (await isFile(candidate)) found = candidate;
      }
      file = found ?? join(root, 'index.html');
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(() => done())) })),
  );
}
