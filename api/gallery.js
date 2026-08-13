/* api/gallery.js — leitura e escrita da galeria.
 *
 * GET  → obras cadastradas
 * PUT  → grava metadados, imagens novas e remoções
 *
 * Por que a Git Data API em vez da Contents API (usada em products.js):
 * a Contents API grava um arquivo por chamada, ou seja, um commit por arquivo.
 * Subir três obras geraria nove commits (três grandes, três thumbs, mais o
 * JSON) e — pior — três builds na Vercel, com estados intermediários em que o
 * gallery.json cita uma imagem que ainda não subiu. Aqui montamos blobs, uma
 * árvore e UM commit: ou entra tudo, ou não entra nada.
 */

import { config, requireSession, sendJson, fail } from './_lib.js';

const GALLERY_PATH = 'data/gallery.json';
const IMG_DIR = 'img/obras';
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_OBRAS = 60;
const MAX_IMAGE_BYTES = 1_500_000;   /* ~1,5 MB por arquivo já redimensionado */

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
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status} em ${path}: ${detail.slice(0, 160)}`);
  }
  return res.json();
}

function base64Bytes(data) {
  /* Tamanho real do binário a partir do comprimento em base64. */
  const clean = String(data || '').replace(/^data:[^,]*,/, '');
  const padding = (clean.match(/=*$/) || [''])[0].length;
  return Math.floor((clean.length * 3) / 4) - padding;
}

function cleanBase64(data) {
  return String(data || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
}

function sanitize(raw, index) {
  const where = `Obra ${index + 1}`;
  const slug = String(raw.slug || '').trim().toLowerCase();
  const title = String(raw.title || '').trim();

  if (!SLUG_RE.test(slug)) return { error: `${where}: identificador inválido.` };
  if (title.length < 1 || title.length > 120) return { error: `${where}: o título precisa ter entre 1 e 120 caracteres.` };

  return {
    obra: {
      slug,
      title,
      meta: String(raw.meta || '').trim().slice(0, 160),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : (index + 1) * 10,
    },
  };
}

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg.ok) return fail(res, 500, `Configuração incompleta no servidor: ${cfg.missing.join(', ')}.`);

  const session = requireSession(req, res, cfg);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');
  const { token } = session;
  const { repo, branch } = cfg;

  if (req.method === 'GET') {
    try {
      const file = await gh(`/repos/${repo}/contents/${GALLERY_PATH}?ref=${encodeURIComponent(branch)}`, token);
      const data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
      return sendJson(res, 200, { obras: data.obras || [] });
    } catch (err) {
      return fail(res, 502, 'Não foi possível ler a galeria do GitHub.', err);
    }
  }

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return fail(res, 405, 'Método não permitido.');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!Array.isArray(body.obras)) return fail(res, 400, 'Envie a lista completa de obras.');
  if (body.obras.length > MAX_OBRAS) return fail(res, 400, `Limite de ${MAX_OBRAS} obras.`);

  /* --- Validação dos metadados --- */
  const obras = [];
  const slugs = new Set();
  for (let i = 0; i < body.obras.length; i += 1) {
    const result = sanitize(body.obras[i], i);
    if (result.error) return fail(res, 400, result.error);
    if (slugs.has(result.obra.slug)) {
      return fail(res, 400, `Existe mais de uma obra com o identificador "${result.obra.slug}".`);
    }
    slugs.add(result.obra.slug);
    obras.push(result.obra);
  }
  obras.sort((a, b) => a.order - b.order);

  /* --- Validação das imagens novas --- */
  const uploads = Array.isArray(body.uploads) ? body.uploads : [];
  for (const up of uploads) {
    if (!SLUG_RE.test(String(up.slug || ''))) return fail(res, 400, 'Upload com identificador inválido.');
    if (!slugs.has(up.slug)) return fail(res, 400, `A imagem "${up.slug}" não corresponde a nenhuma obra da lista.`);
    if (!up.full || !up.thumb) return fail(res, 400, `Faltou a imagem grande ou a miniatura de "${up.slug}".`);
    if (base64Bytes(up.full) > MAX_IMAGE_BYTES || base64Bytes(up.thumb) > MAX_IMAGE_BYTES) {
      return fail(res, 413, `A imagem de "${up.slug}" ficou grande demais. Tente uma foto menor.`);
    }
  }

  /* Toda obra listada precisa ter imagem: ou já existe, ou vem neste envio.
     Sem isso, a galeria publicaria um card com imagem quebrada. */
  const removals = (Array.isArray(body.removals) ? body.removals : [])
    .filter((s) => SLUG_RE.test(String(s || '')));

  try {
    /* 1. Estado atual do branch */
    const ref = await gh(`/repos/${repo}/git/ref/heads/${branch}`, token);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await gh(`/repos/${repo}/git/commits/${baseCommitSha}`, token);

    /* 2. Blobs das imagens novas */
    const treeEntries = [];
    for (const up of uploads) {
      for (const [suffix, data] of [['', up.full], ['-thumb', up.thumb]]) {
        const blob = await gh(`/repos/${repo}/git/blobs`, token, {
          method: 'POST',
          body: { content: cleanBase64(data), encoding: 'base64' },
        });
        treeEntries.push({
          path: `${IMG_DIR}/${up.slug}${suffix}.jpg`,
          mode: '100644',
          type: 'blob',
          sha: blob.sha,
        });
      }
    }

    /* 3. Remoções: sha null apaga o arquivo na árvore nova */
    for (const slug of removals) {
      treeEntries.push({ path: `${IMG_DIR}/${slug}.jpg`, mode: '100644', type: 'blob', sha: null });
      treeEntries.push({ path: `${IMG_DIR}/${slug}-thumb.jpg`, mode: '100644', type: 'blob', sha: null });
    }

    /* 4. O próprio gallery.json */
    const payload = {
      _comment: 'Galeria do ArtHack. Editada pelo dashboard. Imagens em img/obras/<slug>.jpg e <slug>-thumb.jpg.',
      obras,
    };
    const jsonBlob = await gh(`/repos/${repo}/git/blobs`, token, {
      method: 'POST',
      body: {
        content: Buffer.from(JSON.stringify(payload, null, 2) + '\n', 'utf8').toString('base64'),
        encoding: 'base64',
      },
    });
    treeEntries.push({ path: GALLERY_PATH, mode: '100644', type: 'blob', sha: jsonBlob.sha });

    /* 5. Árvore, commit e avanço do branch — tudo de uma vez */
    const tree = await gh(`/repos/${repo}/git/trees`, token, {
      method: 'POST',
      body: { base_tree: baseCommit.tree.sha, tree: treeEntries },
    });

    const summary = [
      uploads.length ? `${uploads.length} obra(s) nova(s)` : '',
      removals.length ? `${removals.length} removida(s)` : '',
    ].filter(Boolean).join(', ') || 'metadados';

    const commit = await gh(`/repos/${repo}/git/commits`, token, {
      method: 'POST',
      body: {
        message: `Galeria: ${summary}`,
        tree: tree.sha,
        parents: [baseCommitSha],
      },
    });

    /* force: false — se alguém commitou nesse meio-tempo, o GitHub recusa
       em vez de sobrescrever o trabalho da outra pessoa. */
    await gh(`/repos/${repo}/git/refs/heads/${branch}`, token, {
      method: 'PATCH',
      body: { sha: commit.sha, force: false },
    });

    return sendJson(res, 200, { ok: true, obras, commit: commit.sha.slice(0, 7) });
  } catch (err) {
    const conflict = /not a fast forward|422/i.test(err.message);
    return fail(res, conflict ? 409 : 502,
      conflict
        ? 'Alguém publicou enquanto você editava. Recarregue a página e tente de novo.'
        : 'Não foi possível salvar a galeria. Tente de novo em instantes.',
      err);
  }
}
