/* tools/serve.mjs — servidor local que imita o cleanUrls da Vercel.
 *
 * Sem isto, /produtos daria 404 na sua máquina e 200 em produção — o pior
 * tipo de divergência, porque só aparece depois do deploy.
 * Zero dependências: usa só o http e o fs do Node.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

async function exists(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

/* Mesma ordem de resolução da Vercel: arquivo exato, depois .html,
   depois index.html da pasta. */
async function resolve(pathname) {
  const clean = decodeURIComponent(pathname).replace(/\.\./g, '').replace(/^\/+/, '');
  const candidates = clean
    ? [clean, `${clean}.html`, join(clean, 'index.html')]
    : ['index.html'];

  for (const c of candidates) {
    const full = join(ROOT, c);
    if (full.startsWith(ROOT) && await exists(full)) return full;
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const file = await resolve(pathname);

  if (!file) {
    const notFound = join(ROOT, '404.html');
    const body = await exists(notFound) ? await readFile(notFound) : 'Não encontrado';
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(body);
  }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(await readFile(file));
}).listen(PORT, () => {
  console.log(`Site em http://localhost:${PORT} — URLs limpas, como na Vercel.`);
});
