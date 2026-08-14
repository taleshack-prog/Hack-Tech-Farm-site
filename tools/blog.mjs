/* tools/blog.mjs — motor de blog estático, sem nenhuma dependência.
 *
 * PORTÁVEL DE PROPÓSITO. Para usar em outro site, copie este arquivo, crie a
 * pasta de artigos e chame buildBlog() com a função de layout do site. Nada
 * aqui conhece a Hack Tech Farm.
 *
 * Segurança: o Markdown é escapado ANTES de qualquer conversão. Um <script>
 * dentro do artigo vira texto visível, não código. Não existe caminho pelo
 * qual HTML bruto do arquivo chegue executável à página — a lista de tags
 * permitidas é o próprio conjunto que este conversor sabe emitir.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/* ========================= Utilidades ================================== */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Só http(s) e caminhos internos. Bloqueia javascript: e data:. */
function safeHref(raw) {
  const value = String(raw || '').trim();
  if (/^(https?:\/\/|\/|#)/i.test(value) && !/^javascript:/i.test(value)) return value;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return value;
  return '';
}

const slugify = (text) => String(text || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/* ====================== Frontmatter (subconjunto YAML) ================== */

function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { meta: {}, body: raw };

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    let value = kv[2].trim().replace(/^["']|["']$/g, '');
    if (/^\[.*\]$/.test(value)) {
      value = value.slice(1, -1).split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    meta[kv[1]] = value;
  }
  return { meta, body: match[2] };
}

/* ======================== Markdown → HTML ============================== */

function inline(text) {
  let out = esc(text);

  /* Código primeiro: o que estiver dentro de crase não recebe outras marcações. */
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(code) - 1}\u0000`);

  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => {
      const href = safeHref(src);
      return href ? `<img src="${href}" alt="${alt}" loading="lazy">` : '';
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const href = safeHref(url);
      if (!href) return label;
      const ext = /^https?:\/\//i.test(href);
      return `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  const headings = [];
  let i = 0;

  const flushList = (ordered, items) => {
    const tag = ordered ? 'ol' : 'ul';
    html.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    /* Bloco de código */
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim().replace(/[^a-z0-9+#-]/gi, '');
      const buffer = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { buffer.push(lines[i]); i += 1; }
      i += 1;
      html.push(`<pre><code${lang ? ` class="lang-${lang}"` : ''}>${esc(buffer.join('\n'))}</code></pre>`);
      continue;
    }

    /* Título */
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(Math.max(h[1].length, 2), 6);  /* h1 fica com o título do artigo */
      const text = h[2].trim();
      const id = slugify(text);
      headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    /* Régua */
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { html.push('<hr>'); i += 1; continue; }

    /* Citação */
    if (/^>\s?/.test(line)) {
      const buffer = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buffer.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      html.push(`<blockquote><p>${inline(buffer.join(' '))}</p></blockquote>`);
      continue;
    }

    /* Tabela */
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) { body.push(cells(lines[i])); i += 1; }
      html.push('<div class="table-wrap"><table><thead><tr>'
        + head.map((c) => `<th>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
        + '</tbody></table></div>');
      continue;
    }

    /* Listas */
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items = [];
      while (i < lines.length) {
        const m = ordered ? /^\d+[.)]\s+(.*)$/.exec(lines[i]) : /^[-*+]\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      flushList(ordered, items);
      continue;
    }

    /* Parágrafo */
    const buffer = [];
    while (i < lines.length && lines[i].trim()
           && !/^(#{1,6}\s|```|>|\s*[-*+]\s|\d+[.)]\s)/.test(lines[i])
           && !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())) {
      buffer.push(lines[i]);
      i += 1;
    }
    if (buffer.length) html.push(`<p>${inline(buffer.join(' '))}</p>`);
  }

  return { html: html.join('\n'), headings };
}

/* ======================= Extração de FAQ =============================== */

/* Detecta a seção de perguntas frequentes e transforma cada H3 em par
   pergunta/resposta. O redator escreve a seção normalmente; o schema sai daqui.
   Isso evita pedir YAML ao LLM — YAML gerado por modelo quebra em qualquer
   título com dois-pontos, e o schema é a parte que não pode falhar.
   FAQPage é o formato que o Google usa em resultados enriquecidos e que
   motores de resposta extraem com mais frequência. */

const FAQ_HEADING = /^#{2,3}\s*(perguntas frequentes|faq|dúvidas frequentes|perguntas comuns)\s*$/i;

function extractFaq(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const items = [];

  let i = lines.findIndex((l) => FAQ_HEADING.test(l.trim()));
  if (i === -1) return items;

  const sectionLevel = (/^(#{2,3})/.exec(lines[i].trim()) || [])[1].length;
  i += 1;

  let question = null;
  let answer = [];

  const push = () => {
    const text = answer.join(' ').replace(/\s+/g, ' ').trim();
    /* Resposta longa demais não é citável e o Google ignora. Curta demais
       não responde nada. */
    if (question && text.length >= 40 && text.length <= 800) {
      items.push({ question, answer: text });
    }
    question = null;
    answer = [];
  };

  for (; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());

    if (heading) {
      const level = heading[1].length;
      if (level <= sectionLevel) { push(); break; }   /* acabou a seção */
      push();
      question = heading[2].trim();
      continue;
    }
    if (question && line.trim()) answer.push(line.trim());
  }
  push();

  return items.slice(0, 12);
}

/* =========================== Artigos =================================== */

function readArticles(srcDir) {
  if (!existsSync(srcDir)) return [];

  return readdirSync(srcDir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const { meta, body } = parseFrontmatter(readFileSync(join(srcDir, file), 'utf8'));
      const slug = meta.slug || file.replace(/\.md$/, '');
      const { html, headings } = markdownToHtml(body);
      const faq = extractFaq(body);
      const words = body.split(/\s+/).filter(Boolean).length;

      return {
        slug,
        file,
        title: meta.title || slug,
        description: meta.description || '',
        summary: meta.summary || '',
        author: meta.author || '',
        tags: Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : []),
        status: meta.status === 'published' ? 'published' : 'draft',
        publishedAt: meta.publishedAt || meta.date || '',
        updatedAt: meta.updatedAt || '',
        cover: safeHref(meta.cover || ''),
        html,
        headings,
        faq,
        words,
        readingMinutes: Math.max(1, Math.round(words / 200)),
      };
    })
    .filter((a) => a.status === 'published')
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
}

/* Problemas que devem derrubar o build em vez de ir ao ar quebrados. */
export function validateArticles(srcDir) {
  const problems = [];
  const seen = new Set();

  for (const a of readArticles(srcDir)) {
    const where = `blog/${a.file}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) problems.push(`${where}: slug inválido "${a.slug}"`);
    if (seen.has(a.slug)) problems.push(`${where}: slug duplicado "${a.slug}"`);
    seen.add(a.slug);
    if (a.title.length < 5) problems.push(`${where}: título curto demais`);
    if (a.description.length < 50 || a.description.length > 300) {
      problems.push(`${where}: description precisa ter entre 50 e 300 caracteres (tem ${a.description.length})`);
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(a.publishedAt)) problems.push(`${where}: publishedAt ausente ou fora do formato AAAA-MM-DD`);
    if (!a.author) problems.push(`${where}: sem autor — o Google usa isso como sinal de E-E-A-T`);
    if (a.words < 300) problems.push(`${where}: ${a.words} palavras. Conteúdo raso é o alvo da política de scaled content abuse`);
    if (/<script|onerror=|onload=|javascript:/i.test(a.html)) problems.push(`${where}: sobrou marcação suspeita após a conversão`);
  }
  return problems;
}

/* ========================= Geração de páginas ========================== */

const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

function articleBody(a, cfg) {
  const toc = a.headings.filter((h) => h.level === 2);

  return `    <article class="post">
      <header class="post-head">
        <nav class="breadcrumb" aria-label="Você está aqui"><ol>
          <li><a href="../index.html">Início</a></li>
          <li><a href="index.html">Blog</a></li>
          <li aria-current="page">${esc(a.title)}</li>
        </ol></nav>
        <h1>${esc(a.title)}</h1>
        <p class="post-meta">
          <span>${esc(a.author)}</span>
          <time datetime="${esc(a.publishedAt)}">${fmtDate(a.publishedAt)}</time>
          <span>${a.readingMinutes} min de leitura</span>
        </p>
      </header>
${a.summary ? `      <div class="post-summary"><p><strong>Em resumo:</strong> ${esc(a.summary)}</p></div>\n` : ''}${toc.length > 2 ? `      <nav class="post-toc" aria-label="Neste artigo"><p>Neste artigo</p><ul>${
    toc.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul></nav>\n` : ''}      <div class="post-body">
${a.html}
      </div>
${a.tags.length ? `      <p class="post-tags">${a.tags.map((t) => `<span class="card-tag tag-pwa">${esc(t)}</span>`).join(' ')}</p>\n` : ''}      <footer class="post-foot">
        <p><a class="card-link" href="index.html"><span aria-hidden="true">←</span> Todos os artigos</a></p>
      </footer>
    </article>
`;
}

function faqLd(a) {
  if (a.faq.length < 2) return '';   /* o Google exige ao menos duas perguntas */
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: a.faq.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  });
}

function articleLd(a, cfg) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt || a.publishedAt,
    author: { '@type': 'Person', name: a.author },
    publisher: { '@type': 'Organization', name: cfg.orgName, url: cfg.siteUrl },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${cfg.siteUrl}/blog/${a.slug}.html` },
    ...(a.cover ? { image: a.cover } : {}),
    keywords: a.tags.join(', '),
    inLanguage: 'pt-BR',
  });
}

function indexBody(articles, cfg) {
  const cards = articles.map((a) => `<article class="card">
          <p class="post-meta"><time datetime="${esc(a.publishedAt)}">${fmtDate(a.publishedAt)}</time><span>${a.readingMinutes} min</span></p>
          <h3>${esc(a.title)}</h3>
          <p>${esc(a.description)}</p>
          <a class="card-link card-stretch" href="${esc(a.slug)}.html">Ler artigo <span aria-hidden="true">→</span></a>
        </article>`).join('\n        ');

  return `    <header class="page-hero">
      <div class="container">
        <nav class="breadcrumb" aria-label="Você está aqui"><ol>
          <li><a href="../index.html">Início</a></li>
          <li aria-current="page">Blog</li>
        </ol></nav>
        <p class="eyebrow">${esc(cfg.blogEyebrow)}</p>
        <h1>${esc(cfg.blogTitle)}</h1>
        <p>${esc(cfg.blogDescription)}</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        ${articles.length ? `<div class="grid grid-2">
        ${cards}
        </div>` : '<div class="empty-state">Nenhum artigo publicado ainda.</div>'}
      </div>
    </section>
`;
}

function rss(articles, cfg) {
  const items = articles.slice(0, 30).map((a) => `  <item>
    <title>${esc(a.title)}</title>
    <link>${cfg.siteUrl}/blog/${a.slug}.html</link>
    <guid isPermaLink="true">${cfg.siteUrl}/blog/${a.slug}.html</guid>
    <description>${esc(a.description)}</description>
    <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
  </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(cfg.blogTitle)}</title>
  <link>${cfg.siteUrl}/blog/</link>
  <description>${esc(cfg.blogDescription)}</description>
  <language>pt-BR</language>
${items}
</channel></rss>
`;
}

/* ============================== API ==================================== */

/**
 * buildBlog(cfg) — gera índice, páginas de artigo e feed.
 *
 * cfg.srcDir       pasta com os .md
 * cfg.outDir       pasta de saída (ex.: <raiz>/blog)
 * cfg.siteUrl      https://exemplo.com
 * cfg.orgName      nome da organização (schema)
 * cfg.renderPage   ({ filename, title, description, body, jsonld, canonicalPath }) => void
 *
 * Devolve a lista de artigos publicados, para o sitemap do site.
 */
export function buildBlog(cfg) {
  const articles = readArticles(cfg.srcDir);
  if (!existsSync(cfg.outDir)) mkdirSync(cfg.outDir, { recursive: true });

  cfg.renderPage({
    filename: join(cfg.outDir, 'index.html'),
    canonicalPath: 'blog/',
    title: `${cfg.blogTitle} — ${cfg.orgName}`,
    description: cfg.blogDescription,
    body: indexBody(articles, cfg),
    jsonld: [JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: cfg.blogTitle,
      description: cfg.blogDescription,
      url: `${cfg.siteUrl}/blog/`,
      publisher: { '@type': 'Organization', name: cfg.orgName, url: cfg.siteUrl },
    })],
  });

  for (const a of articles) {
    cfg.renderPage({
      filename: join(cfg.outDir, `${a.slug}.html`),
      canonicalPath: `blog/${a.slug}.html`,
      title: `${a.title} — ${cfg.orgName}`,
      description: a.description,
      body: articleBody(a, cfg),
      jsonld: [articleLd(a, cfg), faqLd(a)].filter(Boolean),
    });
  }

  writeFileSync(join(cfg.outDir, 'rss.xml'), rss(articles, cfg), 'utf8');
  return articles;
}

export { markdownToHtml, parseFrontmatter, slugify };
