import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'dist');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let info;
    try {
      info = await stat(filePath);
    } catch {
      // SPA fallback: serve index.html for unknown paths
      const index = join(ROOT, 'index.html');
      const body = await readFile(index);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
      return;
    }

    if (!info.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }

    const body = await readFile(filePath);
    const headers = { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' };

    if (filePath.endsWith('firebase-messaging-sw.js')) {
      headers['Service-Worker-Allowed'] = '/';
      headers['Cache-Control'] = 'no-cache';
    }

    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Serving frontend/dist on http://localhost:${PORT}`);
  console.log(`For HTTPS (required for push notifications on non-localhost), expose via:`);
  console.log(`  ngrok http ${PORT}`);
});
