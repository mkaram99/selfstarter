/*
 * Static server for the dev tools. The instrument itself needs no server --
 * it is a folder of files -- but a camera and a service worker both require
 * a secure context, and 127.0.0.1 counts as one where a LAN address does not.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8'
};

function start(port) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      // The worker must be allowed to update, or a stale shell sticks around.
      'Cache-Control': 'no-cache'
    });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

module.exports = { start, ROOT };
