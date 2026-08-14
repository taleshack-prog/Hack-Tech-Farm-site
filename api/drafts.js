/* api/drafts.js — aprovação de artigos pelo dashboard.
 *
 * GET  → lista todos os artigos com status e um trecho do conteúdo
 * PATCH → alterna status entre draft e published
 *
 * Usa a sessão OAuth de quem está logado, não o PUBLISH_TOKEN. Assim o
 * commit de aprovação fica no nome da pessoa que aprovou — que é justamente
 * a supervisão humana que a política de conteúdo em escala exige demonstrar.
 */

import { config, requireSession, sendJson, fail } from './_lib.js';

const DIR = 'blog-src';
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function gh(path, token, options = {}) {
  const res = await fetch('https://api.github.com' + path, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hacktechfarm-site',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${detail.slice(0, 160)}`);
  }
  return res.status === 404 ? null : res.json();
}

const field = (text, name) => ((new RegExp(`^${name}:\\s*'?(.*?)'?\\s*$`, 'm').exec(text) || [])[1] || '');

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg.ok) return fail(res, 500, `Configuração incompleta: ${cfg.missing.join(', ')}.`);

  const session = requireSession(req, res, cfg);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');
  const { token } = session;
  const { repo, branch } = cfg;

  if (req.method === 'GET') {
    try {
      const listing = await gh(`/repos/${repo}/contents/${DIR}?ref=${encodeURIComponent(branch)}`, token);
      const files = (listing || []).filter((f) => f.name.endsWith('.md'));

      const articles = await Promise.all(files.map(async (f) => {
        const file = await gh(`/repos/${repo}/contents/${DIR}/${f.name}?ref=${encodeURIComponent(branch)}`, token);
        const text = Buffer.from(file.content, 'base64').toString('utf8');
        const body = text.split(/^---\s*$/m)[2] || '';
        return {
          slug: f.name.replace(/\.md$/, ''),
          title: field(text, 'title') || f.name,
          description: field(text, 'description'),
          author: field(text, 'author'),
          publishedAt: field(text, 'publishedAt'),
          source: field(text, 'source'),
          status: /^status:\s*published/m.test(text) ? 'published' : 'draft',
          words: body.split(/\s+/).filter(Boolean).length,
          excerpt: body.trim().replace(/[#>*`|-]/g, ' ').replace(/\s+/g, ' ').slice(0, 400),
        };
      }));

      articles.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
      return sendJson(res, 200, { articles });
    } catch (err) {
      return fail(res, 502, 'Não foi possível ler os artigos.', err);
    }
  }

  if (req.method === 'PATCH') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const slug = String(body.slug || '').trim();
    const status = body.status === 'published' ? 'published' : 'draft';

    if (!SLUG_RE.test(slug)) return fail(res, 400, 'Identificador inválido.');

    try {
      const path = `${DIR}/${slug}.md`;
      const file = await gh(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, token);
      if (!file) return fail(res, 404, 'Artigo não encontrado.');

      const text = Buffer.from(file.content, 'base64').toString('utf8');
      const updated = /^status:\s*\w+\s*$/m.test(text)
        ? text.replace(/^status:\s*\w+\s*$/m, `status: ${status}`)
        : text.replace(/^---\s*$/m, `---\nstatus: ${status}`);

      await gh(`/repos/${repo}/contents/${path}`, token, {
        method: 'PUT',
        body: {
          message: status === 'published'
            ? `Blog: publica "${field(text, 'title') || slug}"`
            : `Blog: despublica "${field(text, 'title') || slug}"`,
          content: Buffer.from(updated, 'utf8').toString('base64'),
          sha: file.sha,
          branch,
        },
      });

      return sendJson(res, 200, { ok: true, slug, status });
    } catch (err) {
      return fail(res, 502, 'Não foi possível alterar o status.', err);
    }
  }

  res.setHeader('Allow', 'GET, PATCH');
  return fail(res, 405, 'Método não permitido.');
}
