/* api/products.js — leitura e escrita do catálogo.
 *
 * GET  → devolve os produtos e o sha atual do arquivo
 * PUT  → grava a lista inteira, gera um commit e dispara o rebuild na Vercel
 *
 * A validação acontece aqui, no servidor. Validar só no navegador seria
 * decorativo: qualquer pessoa autenticada poderia mandar um PUT direto.
 */

import {
  config, requireSession, readRepoFile, writeRepoFile, sendJson, fail,
} from './_lib.js';

const PATH = 'data/products.json';

const STATUS = ['live', 'dev'];
const STAGE = ['alpha', 'beta', 'planning'];
const CATEGORY = ['SaaS', 'IA', 'Web3', 'PWA', 'Arte'];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PAGE_RE = /^[a-z0-9-]+\.html$/;

function httpsOrNull(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : undefined;
  } catch {
    return undefined;   // undefined sinaliza "inválido", null sinaliza "vazio"
  }
}

/* Devolve { product } ou { error } — nunca confia no que veio do cliente. */
function sanitize(raw, index) {
  const where = `Produto ${index + 1}`;
  const slug = String(raw.slug || '').trim().toLowerCase();
  const name = String(raw.name || '').trim();

  if (!SLUG_RE.test(slug)) return { error: `${where}: identificador inválido. Use só letras minúsculas, números e hífen.` };
  if (name.length < 2 || name.length > 120) return { error: `${where}: o nome precisa ter entre 2 e 120 caracteres.` };

  const status = STATUS.includes(raw.status) ? raw.status : null;
  if (!status) return { error: `${where}: situação inválida.` };

  let stage = null;
  if (status === 'dev') {
    stage = STAGE.includes(raw.stage) ? raw.stage : null;
    if (!stage) return { error: `${where} ("${name}"): produto em desenvolvimento precisa de estágio — alpha, beta ou planejamento.` };
  }

  const url = httpsOrNull(raw.url);
  if (url === undefined) return { error: `${where} ("${name}"): o link de acesso precisa começar com https://.` };

  const pageUrl = String(raw.page_url || '').trim();
  if (pageUrl && !PAGE_RE.test(pageUrl)) return { error: `${where} ("${name}"): a página interna deve ser algo como "posthink.html".` };

  return {
    product: {
      id: Number(raw.id) || Date.now(),
      slug,
      name,
      tagline: String(raw.tagline || '').trim().slice(0, 200) || null,
      description: String(raw.description || '').trim().slice(0, 2000) || null,
      url,
      page_url: pageUrl || null,
      icon: String(raw.icon || '📦').trim().slice(0, 8),
      category: CATEGORY.includes(raw.category) ? raw.category : 'SaaS',
      status,
      stage,
      sort_order: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : 100,
      is_public: raw.is_public !== false,
    },
  };
}

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg.ok) return fail(res, 500, `Configuração incompleta no servidor: ${cfg.missing.join(', ')}.`);

  const session = requireSession(req, res, cfg);
  if (!session) return;   // requireSession já respondeu 401

  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const file = await readRepoFile(session.token, cfg.repo, cfg.branch, PATH);
      const data = JSON.parse(file.content);
      return sendJson(res, 200, { products: data.products || [], sha: file.sha });
    } catch (err) {
      return fail(res, 502, 'Não foi possível ler o catálogo do GitHub.', err);
    }
  }

  if (req.method === 'PUT') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (!Array.isArray(body.products)) return fail(res, 400, 'Envie a lista completa de produtos.');
    if (!body.sha) return fail(res, 400, 'Faltou o sha do arquivo. Recarregue a página.');
    if (body.products.length > 200) return fail(res, 400, 'Limite de 200 produtos por arquivo.');

    const clean = [];
    const slugs = new Set();
    for (let i = 0; i < body.products.length; i += 1) {
      const result = sanitize(body.products[i], i);
      if (result.error) return fail(res, 400, result.error);
      if (slugs.has(result.product.slug)) {
        return fail(res, 400, `Existe mais de um produto com o identificador "${result.product.slug}".`);
      }
      slugs.add(result.product.slug);
      clean.push(result.product);
    }

    clean.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR'));

    const payload = {
      _comment: 'Fonte unica de verdade do catalogo. Editado pelo dashboard; cada alteracao gera um commit e dispara um novo build na Vercel.',
      products: clean,
    };

    try {
      const commit = await writeRepoFile(
        session.token, cfg.repo, cfg.branch, PATH,
        JSON.stringify(payload, null, 2) + '\n',
        body.sha,
        `Catálogo: ${body.message || 'atualização pelo dashboard'}`,
      );
      return sendJson(res, 200, {
        ok: true,
        sha: commit.content.sha,
        products: clean,
        commitUrl: commit.commit?.html_url || null,
      });
    } catch (err) {
      return fail(res, 409, err.message, err);
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return fail(res, 405, 'Método não permitido.');
}
