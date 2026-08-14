/* api/blog.js — recebe artigos do Content Engine e lista o que existe.
 *
 * POST → grava um artigo em blog-src/<slug>.md
 * GET  → lista os artigos com status, para o app acompanhar
 *
 * Autenticação: Bearer token próprio (PUBLISH_TOKEN). O fluxo OAuth do
 * dashboard não serve aqui — não existe navegador nem sessão quando uma
 * máquina chama. Por isso esta função também usa uma credencial própria do
 * GitHub (GITHUB_PUBLISH_TOKEN), em vez do token de quem está logado.
 *
 * REGRA QUE NÃO SE NEGOCIA: o que chega aqui entra como RASCUNHO. Não existe
 * caminho pelo qual o app publique direto. Quem publica é uma pessoa, pelo
 * dashboard. É o que separa "IA acelera a redação" de scaled content abuse.
 */

import crypto from 'node:crypto';
import { config, sendJson, fail } from './_lib.js';

const DIR = 'blog-src';
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_BYTES = 200_000;

/* Comparação em tempo constante: comparar com === vaza o tamanho do prefixo
   correto pelo tempo de resposta, o que permite descobrir o token byte a byte. */
function tokenOk(header, expected) {
  const provided = String(header || '').replace(/^Bearer\s+/i, '').trim();
  if (!provided || !expected) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function gh(path, token, options = {}) {
  const res = await fetch('https://api.github.com' + path, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hacktechfarm-blog',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status} em ${path}: ${detail.slice(0, 160)}`);
  }
  return res.status === 404 ? null : res.json();
}

/* Frontmatter é YAML: um valor com : ou # quebraria o parser do build.
   Aspas simples resolvem, e o apóstrofo interno é duplicado. */
const yamlValue = (v) => `'${String(v).replace(/'/g, "''").replace(/[\r\n]+/g, ' ')}'`;

function buildMarkdown(a) {
  return [
    '---',
    `title: ${yamlValue(a.title)}`,
    `description: ${yamlValue(a.description)}`,
    a.summary ? `summary: ${yamlValue(a.summary)}` : '',
    `author: ${yamlValue(a.author)}`,
    `publishedAt: ${a.publishedAt}`,
    a.tags.length ? `tags: [${a.tags.join(', ')}]` : '',
    'status: draft',
    a.source ? `source: ${yamlValue(a.source)}` : '',
    '---',
    '',
    a.content.trim(),
    '',
  ].filter(Boolean).join('\n');
}

function validate(body) {
  const slug = String(body.slug || '').trim().toLowerCase();
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const author = String(body.author || '').trim();
  const content = String(body.content || '');

  if (!SLUG_RE.test(slug)) return { error: 'slug inválido: use apenas minúsculas, números e hífen.' };
  if (title.length < 5 || title.length > 160) return { error: 'title precisa ter entre 5 e 160 caracteres.' };
  if (description.length < 50 || description.length > 300) {
    return { error: 'description precisa ter entre 50 e 300 caracteres.' };
  }
  if (!author) return { error: 'author é obrigatório — o Google usa autoria como sinal de E-E-A-T.' };

  const words = content.split(/\s+/).filter(Boolean).length;
  if (words < 300) return { error: `conteúdo com ${words} palavras. O mínimo é 300 — abaixo disso é conteúdo raso.` };
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) return { error: 'conteúdo grande demais.' };

  /* Sinais de número inventado. Não bloqueia: devolve aviso para o app decidir. */
  const warnings = [];
  const stats = content.match(/\b\d{1,3}(?:[.,]\d+)?\s*%/g) || [];
  const unsourced = stats.filter(() => !/\]\(https?:\/\//.test(content));
  if (unsourced.length) {
    warnings.push(`${stats.length} percentual(is) no texto e nenhum link de fonte. Verifique antes de publicar.`);
  }
  if (/\b(quando (nós|nos)|na nossa experiência|percebemos que|descobrimos que)\b/i.test(content)) {
    warnings.push('O texto afirma experiência em primeira pessoa. Confirme que é verdadeira antes de publicar.');
  }

  const tags = (Array.isArray(body.tags) ? body.tags : [])
    .map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean).slice(0, 6);

  const publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(body.publishedAt)
    ? body.publishedAt
    : new Date().toISOString().slice(0, 10);

  return {
    article: { slug, title, description, author, content, tags, publishedAt,
               summary: String(body.summary || '').trim().slice(0, 300),
               source: String(body.source || '').trim().slice(0, 120) },
    warnings,
    words,
  };
}

export default async function handler(req, res) {
  const cfg = config();
  const publishToken = process.env.PUBLISH_TOKEN;
  const ghToken = process.env.GITHUB_PUBLISH_TOKEN;

  res.setHeader('Cache-Control', 'no-store');

  if (!publishToken || !ghToken) {
    return fail(res, 503, 'Endpoint de publicação não configurado no servidor.');
  }
  if (!tokenOk(req.headers.authorization, publishToken)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return fail(res, 401, 'Token inválido.');
  }

  const { repo, branch } = cfg;

  if (req.method === 'GET') {
    try {
      const listing = await gh(`/repos/${repo}/contents/${DIR}?ref=${encodeURIComponent(branch)}`, ghToken);
      const files = (listing || []).filter((f) => f.name.endsWith('.md'));
      const articles = await Promise.all(files.map(async (f) => {
        const file = await gh(`/repos/${repo}/contents/${DIR}/${f.name}?ref=${encodeURIComponent(branch)}`, ghToken);
        const text = Buffer.from(file.content, 'base64').toString('utf8');
        const status = /^status:\s*published/m.test(text) ? 'published' : 'draft';
        const title = (/^title:\s*'?(.*?)'?\s*$/m.exec(text) || [])[1] || f.name;
        return { slug: f.name.replace(/\.md$/, ''), title, status };
      }));
      return sendJson(res, 200, { articles });
    } catch (err) {
      return fail(res, 502, 'Não foi possível listar os artigos.', err);
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'Método não permitido.');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const result = validate(body);
  if (result.error) return fail(res, 400, result.error);

  const { article, warnings, words } = result;
  const path = `${DIR}/${article.slug}.md`;

  try {
    /* Se o artigo já existe, precisamos do sha para substituir. E se ele já
       foi PUBLICADO por uma pessoa, o app não pode sobrescrever em silêncio —
       é o caso da reescrita do laço de otimização. */
    const existing = await gh(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, ghToken);

    if (existing) {
      const current = Buffer.from(existing.content, 'base64').toString('utf8');
      if (/^status:\s*published/m.test(current) && body.overwritePublished !== true) {
        return fail(res, 409,
          'Este artigo já está publicado. Envie overwritePublished: true para substituí-lo — ele volta a rascunho e precisa de nova aprovação.');
      }
    }

    await gh(`/repos/${repo}/contents/${path}`, ghToken, {
      method: 'PUT',
      body: {
        message: `Blog: rascunho "${article.title}"`,
        content: Buffer.from(buildMarkdown(article), 'utf8').toString('base64'),
        branch,
        ...(existing ? { sha: existing.sha } : {}),
      },
    });

    return sendJson(res, 201, {
      ok: true,
      slug: article.slug,
      status: 'draft',
      words,
      warnings,
      message: 'Rascunho gravado. Ele não aparece no site até ser aprovado no dashboard.',
    });
  } catch (err) {
    return fail(res, 502, 'Não foi possível gravar o artigo.', err);
  }
}
