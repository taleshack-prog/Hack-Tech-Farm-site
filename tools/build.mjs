/* tools/build.mjs — gera as páginas estáticas a partir de data/products.json.
 *
 * Roda no build da Vercel. É por isso que está em Node e não em Python: quando
 * o dashboard grava um produto, o commit dispara um novo build, e este script
 * reescreve o HTML com o catálogo atualizado. Sem ele, o JSON mudaria e as
 * páginas continuariam mostrando o conteúdo antigo.
 *
 * Uso: npm run build
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://hacktechfarm.com.br';

/* E-mail público de contato. Provisoriamente no Proton, porque o plano gratuito
   deles não aceita domínio próprio. Quando o Mail Plus for assinado, troque
   por contato@hacktechfarm.com.br AQUI e rode `npm run build` — é o único
   lugar que precisa mudar. */
const CONTACT_EMAIL = 'hacktechfarm@proton.me';

const PRODUCTS = JSON.parse(readFileSync(join(ROOT, 'data/products.json'), 'utf8')).products;

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ========================= Navegação e rodapé ============================ */

const NAV = [
  ['index.html', 'Início', null],
  ['produtos.html', 'Produtos', [
    ['neuroart.html', 'NeuroArt DApp'],
    ['posthink.html', 'Posthink'],
    ['asphalt.html', 'Asphalt Hoops'],
    ['galeria.html', 'ArtHack'],
  ]],
  ['roadmap.html', 'Roadmap', null],
  ['sobre.html', 'Sobre', null],
  ['parceiros.html', 'Parceiros', null],
  ['contato.html', 'Contato', null],
];

const FOOTER = [
  ['Produtos', [['neuroart.html', 'NeuroArt DApp'], ['posthink.html', 'Posthink'],
                ['asphalt.html', 'Asphalt Hoops'], ['galeria.html', 'ArtHack']]],
  ['Empresa', [['sobre.html', 'Sobre nós'], ['roadmap.html', 'Roadmap'],
               ['parceiros.html', 'Parceiros'], ['contato.html', 'Contato']]],
  ['Contato', [[`mailto:${CONTACT_EMAIL}`, CONTACT_EMAIL],
               ['contato.html', 'Fale conosco']]],
];

function navHtml(active) {
  return NAV.map(([href, label, children]) => {
    if (!children) {
      return `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`;
    }
    const subs = children.map(([h, l]) =>
      `<a href="${h}"${active === h ? ' aria-current="page"' : ''}>${l}</a>`).join('');
    return `<div class="dropdown">`
      + `<button type="button" class="dropdown-toggle" aria-expanded="false" aria-controls="menu-produtos">`
      + `${label}<span class="chev" aria-hidden="true">▾</span></button>`
      + `<div class="dropdown-menu" id="menu-produtos">`
      + `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>Todos os produtos</a>${subs}</div></div>`;
  }).join('');
}

function footerHtml() {
  const cols = FOOTER.map(([title, links]) =>
    `<div><h2>${title}</h2><ul>${links.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></div>`
  ).join('\n        ');

  return `  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="index.html" class="logo"><span class="logo-mark" aria-hidden="true">HTF</span> Hack Tech Farm</a>
          <p>Software house familiar em Porto Alegre. Apps e SaaS com propósito, arte e tecnologia.</p>
        </div>
        ${cols}
      </div>
      <div class="footer-bottom">
        <span>&copy; <span data-year>2026</span> Hack Tech Farm. Todos os direitos reservados.</span>
        <span>Porto Alegre, RS &mdash; Brasil</span>
      </div>
    </div>
  </footer>
`;
}

function breadcrumbHtml(trail) {
  if (!trail.length) return '';
  const items = trail.map(([href, label]) =>
    href ? `<li><a href="${href}">${label}</a></li>` : `<li aria-current="page">${label}</li>`).join('');
  return `<nav class="breadcrumb" aria-label="Você está aqui"><ol>${items}</ol></nav>`;
}

function breadcrumbLd(trail) {
  if (trail.length < 2) return '';
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([href, name], i) => ({
      '@type': 'ListItem', position: i + 1, name, item: `${SITE_URL}/${href || ''}`,
    })),
  });
}

/* ============================== Layout =================================== */

function layout(filename, title, description, body, opts = {}) {
  const { active = null, trail = [], scripts = [], jsonld = [], noindex = false, keywords = null } = opts;
  const ld = [...jsonld, breadcrumbLd(trail)].filter(Boolean)
    .map((j) => `<script type="application/ld+json">${j}</script>`).join('\n  ');
  const scriptTags = scripts.map((s) => `<script src="${s}" defer></script>`).join('\n  ');
  const canonical = `${SITE_URL}/${filename === 'index.html' ? '' : filename}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${keywords ? `<meta name="keywords" content="${keywords}">\n  ` : ''}<link rel="canonical" href="${canonical}">
  ${noindex ? '<meta name="robots" content="noindex, nofollow">\n  ' : ''}<meta name="theme-color" content="#0B0F1A">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Hack Tech Farm">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE_URL}/img/og-cover.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${SITE_URL}/img/og-cover.png">

  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="css/styles.css">
  ${ld}
</head>
<body>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

  <nav class="nav" aria-label="Navegação principal">
    <div class="container nav-inner">
      <a href="index.html" class="logo"><span class="logo-mark" aria-hidden="true">HTF</span> Hack Tech Farm</a>
      <button type="button" class="menu-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Abrir menu">☰</button>
      <div class="nav-links" id="nav-links" data-open="false">
        ${navHtml(active)}
      </div>
    </div>
  </nav>

  <main id="conteudo">
${body}  </main>

${footerHtml()}
  <script src="js/site.js" defer></script>
  ${scriptTags}
</body>
</html>
`;
  writeFileSync(join(ROOT, filename), html, 'utf8');
}

/* ======================= Pré-renderização do catálogo ==================== */

const CATEGORY_CLASS = { Web3: 'tag-web3', IA: 'tag-ai', PWA: 'tag-pwa', Arte: 'tag-art' };
const STAGE_LABEL = { alpha: 'Alpha', beta: 'Beta', planning: 'Planejamento' };
const STAGE_CLASS = { alpha: 'status-alpha', beta: 'status-beta', planning: 'status-planning' };

const bySort = (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR');
const live = () => PRODUCTS.filter((p) => p.status === 'live').sort(bySort);
const dev = () => PRODUCTS.filter((p) => p.status === 'dev').sort(bySort);

function productCard(p) {
  let link = '';
  if (p.page_url) {
    link = `<a class="card-link card-stretch" href="${esc(p.page_url)}">Ver detalhes <span aria-hidden="true">→</span></a>`;
  } else if (p.url) {
    link = `<a class="card-link card-stretch" href="${esc(p.url)}" target="_blank" rel="noopener">`
      + `Abrir ${esc(p.name)} <span aria-hidden="true">↗</span>`
      + `<span class="visually-hidden"> (abre em nova aba)</span></a>`;
  }
  const tag = p.category
    ? `<span class="card-tag ${CATEGORY_CLASS[p.category] || 'tag-pwa'}">${esc(p.category)}</span>` : '';
  return `<article class="card"><div class="card-icon" aria-hidden="true">${esc(p.icon || '📦')}</div>${tag}`
    + `<h3>${esc(p.name)}</h3><p>${esc(p.tagline || p.description)}</p>${link}</article>`;
}

const renderProducts = (limit) => (limit ? live().slice(0, limit) : live()).map(productCard).join('');

const renderRoadmap = () => dev().map((p, i) =>
  `<li class="tl-item">`
  + `<span class="tl-dot${p.stage === 'beta' ? ' art' : ''}" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>`
  + `<span class="tl-status ${STAGE_CLASS[p.stage] || 'status-planning'}">${STAGE_LABEL[p.stage] || 'Planejamento'}</span>`
  + `<h3>${esc(p.name)}</h3><p>${esc(p.description || p.tagline)}</p></li>`).join('');

const renderFurrows = () => live().slice(0, 4).map((p, i) =>
  `<li class="furrow"><span class="idx">${String(i + 1).padStart(2, '0')}</span>`
  + `<span class="nm">${esc(p.name)}</span><span class="st">${esc(p.category || 'no ar')}</span></li>`).join('');

/* ============================= Blocos ==================================== */

const newsletter = (heading, text) => `      <div class="newsletter">
        <h2>${heading}</h2>
        <p>${text}</p>
        <form class="newsletter-form" data-form="newsletter" novalidate>
          <label class="visually-hidden" for="nl-email">Seu e-mail</label>
          <input type="email" id="nl-email" name="email" autocomplete="email" placeholder="voce@exemplo.com.br" required>
          <div class="hp-field" aria-hidden="true">
            <label for="nl-website">Não preencha este campo</label>
            <input type="text" id="nl-website" name="website" tabindex="-1" autocomplete="off">
          </div>
          <button type="submit" class="btn btn-primary">Assinar</button>
        </form>
        <p class="form-msg" role="status" aria-live="polite"></p>
        <p class="dim" style="font-size:.82rem;margin-top:12px">Um e-mail por lançamento. Cancele quando quiser.</p>
      </div>
`;

const ORG_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Hack Tech Farm',
  alternateName: 'HTF',
  url: SITE_URL,
  email: CONTACT_EMAIL,
  description: 'Software house familiar de Porto Alegre. Desenvolvimento de software, tokenização de arte e IA para LinkedIn.',
  address: { '@type': 'PostalAddress', addressLocality: 'Porto Alegre', addressRegion: 'RS', addressCountry: 'BR' },
  founder: [{ '@type': 'Person', name: 'Tales Hack' },
            { '@type': 'Person', name: 'Heitor Hack' },
            { '@type': 'Person', name: 'Francisco Hack' }],
});

/* ============================== Páginas ================================== */

function buildHome() {
  const body = `    <header class="hero">
      <div class="container hero-grid">
        <div>
          <p class="eyebrow">Software house familiar · Porto Alegre</p>
          <h1>Cultivando tecnologia,<br><span class="grad">colhendo arte.</span></h1>
          <p class="lede">A Hack Tech Farm junta o rigor da engenharia de software à sensibilidade das artes plásticas. Quatro produtos no ar, do Web3 à Inteligência Artificial.</p>
          <div class="hero-actions">
            <a href="https://posthink.com.br" class="btn btn-primary" target="_blank" rel="noopener">Conhecer o Posthink <span aria-hidden="true">↗</span><span class="visually-hidden"> (abre em nova aba)</span></a>
            <a href="produtos.html" class="btn btn-ghost">Ver todos os produtos</a>
          </div>
        </div>
        <div>
          <p class="eyebrow">No ar agora</p>
          <ul class="furrows">${renderFurrows()}</ul>
        </div>
      </div>
    </header>

    <section class="section">
      <div class="container">
        <div class="section-head">
          <p class="eyebrow">Portfólio</p>
          <h2>Nossos produtos</h2>
          <p>Cada projeto nasce de uma inquietação real e cresce até virar ferramenta de trabalho de alguém.</p>
        </div>
        <div class="grid grid-3">${renderProducts(3)}</div>
        <p class="center" style="margin-top:36px"><a href="produtos.html" class="btn btn-ghost">Ver os quatro produtos</a></p>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-head">
          <p class="eyebrow">A origem</p>
          <h2>Por que "Farm"?</h2>
        </div>
        <div class="measure center">
          <p class="dim">A HTF nasceu da união entre o olhar artístico de Tales Hack e a expertise técnica dos filhos, Heitor e Francisco. O nome carrega as iniciais dos três: <strong>H</strong>eitor, <strong>T</strong>ales, <strong>F</strong>rancisco.</p>
          <p class="dim" style="margin-top:14px">"Farm" porque é aqui que ideia vira semente: planta, rega, poda e colhe. Algumas viram produto. Outras viram aprendizado.</p>
          <p style="margin-top:26px"><a href="sobre.html" class="card-link">Conhecer a família <span aria-hidden="true">→</span></a></p>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
${newsletter('Fique por dentro do que plantamos', 'Lançamentos, bastidores e os produtos que ainda estão no roadmap.')}      </div>
    </section>
`;
  layout('index.html', 'Hack Tech Farm — Software que cultiva arte',
    'Software house familiar de Porto Alegre. Desenvolvimento de software, tokenização de arte e IA para LinkedIn: NeuroArt, Posthink, Asphalt Hoops e ArtHack.',
    body, { active: 'index.html', jsonld: [ORG_LD],
      keywords: 'desenvolvimento de software, tokenização de arte, IA para LinkedIn, software house Porto Alegre' });
}

function buildProdutos() {
  const body = `    <header class="page-hero">
      <div class="container">
        ${breadcrumbHtml([['index.html', 'Início'], [null, 'Produtos']])}
        <p class="eyebrow">Portfólio</p>
        <h1>Nosso portfólio</h1>
        <p>Quatro produtos no ar, cada um com uma história e um propósito próprios.</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        <div class="grid grid-2">${renderProducts()}</div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-head">
          <p class="eyebrow">Ainda no solo</p>
          <h2>Seis produtos em desenvolvimento</h2>
          <p>Do alpha ao planejamento — o que está crescendo na fazenda.</p>
        </div>
        <p class="center"><a href="roadmap.html" class="btn btn-ghost">Ver o roadmap</a></p>
      </div>
    </section>
`;
  layout('produtos.html', 'Produtos — Hack Tech Farm',
    'NeuroArt DApp, Posthink, Asphalt Hoops e ArtHack: os produtos digitais da Hack Tech Farm.',
    body, { active: 'produtos.html', trail: [['index.html', 'Início'], ['produtos.html', 'Produtos']] });
}

function buildRoadmap() {
  const body = `    <header class="page-hero">
      <div class="container">
        ${breadcrumbHtml([['index.html', 'Início'], [null, 'Roadmap']])}
        <p class="eyebrow">Em desenvolvimento</p>
        <h1>O que estamos plantando</h1>
        <p>Seis produtos entre alpha, beta e planejamento. As datas nós não prometemos; o progresso a gente conta na newsletter.</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        <ol class="timeline">${renderRoadmap()}</ol>
      </div>
    </section>

    <section class="section">
      <div class="container">
${newsletter('Quer saber quando algum destes abrir?', 'Avisamos por e-mail no dia em que o beta virar público.')}      </div>
    </section>
`;
  layout('roadmap.html', 'Roadmap — Hack Tech Farm',
    'Verdant, HackFinance Pro, FinanMap Cripto, Second Soul, TPC e RadarPrevi: os produtos em desenvolvimento na Hack Tech Farm.',
    body, { active: 'roadmap.html', trail: [['index.html', 'Início'], ['roadmap.html', 'Roadmap']] });
}

function productPage(cfg) {
  const cta = cfg.ctaUrl
    ? `<a href="${cfg.ctaUrl}" class="btn btn-primary" target="_blank" rel="noopener">${cfg.ctaLabel} <span aria-hidden="true">↗</span><span class="visually-hidden"> (abre em nova aba)</span></a>`
    : `<p class="dim"><strong>Acesso em breve.</strong> Assine a newsletter para saber quando abrir.</p>`;

  const body = `    <header class="page-hero">
      <div class="container">
        ${breadcrumbHtml([['index.html', 'Início'], ['produtos.html', 'Produtos'], [null, cfg.name]])}
        <p class="eyebrow">Produto no ar</p>
        <h1>${cfg.name}</h1>
        <p>${cfg.tagline}</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        <div class="split">
          <div>
            <h2>${cfg.tagline}</h2>
            ${cfg.paragraphs.map((p) => `<p>${p}</p>`).join('')}
            <div class="hero-actions" style="margin-top:26px">${cta}</div>
          </div>
          <dl class="spec">${cfg.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-head">
          <p class="eyebrow">O que ele faz</p>
          <h2>Recursos</h2>
        </div>
        <div class="grid grid-3">${cfg.features.map(([t, d]) => `<article class="card"><h3>${t}</h3><p>${d}</p></article>`).join('')}</div>
      </div>
    </section>
`;

  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'SoftwareApplication',
    name: cfg.name, applicationCategory: cfg.appCategory, operatingSystem: 'Web',
    description: cfg.description, url: cfg.ctaUrl || `${SITE_URL}/${cfg.file}`,
    publisher: { '@type': 'Organization', name: 'Hack Tech Farm', url: SITE_URL },
  });

  layout(cfg.file, `${cfg.name} — Hack Tech Farm`, cfg.description, body, {
    active: cfg.file, jsonld: [ld], keywords: cfg.keywords,
    trail: [['index.html', 'Início'], ['produtos.html', 'Produtos'], [cfg.file, cfg.name]],
  });
}

function buildProductPages() {
  productPage({
    file: 'posthink.html', name: 'Posthink',
    tagline: 'A IA escreve, você continua sendo o autor.',
    paragraphs: [
      'Você dá o tema. O Posthink pesquisa, escreve no seu tom e deixa o post pronto para revisão. Nada vai ao ar sem a sua aprovação.',
      'A publicação sai pela API oficial do LinkedIn, no horário que você marcar — sem automação cinzenta e sem risco para a sua conta.',
      'Feito para profissionais liberais que querem autoridade sem virar produtor de conteúdo em tempo integral, e para ghostwriters que precisam de volume sem abrir mão da qualidade.',
    ],
    specs: [['Categoria', 'SaaS de conteúdo com IA'], ['Publicação', 'API oficial do LinkedIn'],
            ['Controle', 'Aprovação humana obrigatória'], ['Público', 'Profissionais liberais e ghostwriters']],
    ctaLabel: 'Acessar o Posthink', ctaUrl: 'https://posthink.com.br',
    features: [
      ['Pesquisa do tema', 'A IA levanta o contexto antes de escrever, em vez de improvisar.'],
      ['Seu tom, não o dela', 'O texto aprende a sua voz e a sua área de atuação.'],
      ['Agendamento', 'Você marca o horário; a publicação sai pela API oficial.'],
      ['Aprovação humana', 'Todo post passa por você antes de ir ao ar.'],
      ['Fila editorial', 'Pautas soltas viram uma agenda de publicação consistente.'],
      ['Sem risco de conta', 'Nada de automação por navegador ou login de terceiros.'],
    ],
    description: 'Posthink: a IA pesquisa, escreve no seu tom e publica no LinkedIn pela API oficial — com sua aprovação antes de cada post.',
    keywords: 'IA para LinkedIn, agendamento de posts, ghostwriter com IA, criação de conteúdo LinkedIn',
    appCategory: 'BusinessApplication',
  });

  productPage({
    file: 'neuroart.html', name: 'NeuroArt DApp',
    tagline: 'Arte que financia ciência.',
    paragraphs: [
      'O NeuroArt fraciona obras de artistas neurodivergentes em tokens ERC-20 na rede Base. Comprar uma fração é comprar uma parte real da obra — e financiar pesquisa no mesmo gesto.',
      'Quem reúne 100% das frações de uma peça pode resgatá-la: o contrato queima os tokens e a obra física é entregue. É o <em>Threshold Redemption</em>, e é o que separa o NeuroArt de um NFT que só aponta para uma imagem.',
      'Cada transação no marketplace destina recursos ao Fundo de Pesquisa NeuroArt, que financia protocolos não medicamentosos — de Jiu-Jitsu a interfaces cérebro-computador. É DeSci aplicada, não promessa de impacto.',
      'O projeto é cofundado por Tales Hack e pelo Prof. Alexandre de Souza Fortis, em Porto Alegre.',
    ],
    specs: [['Rede', 'Base L2'], ['Padrão', 'ERC-20 fracionado'],
            ['Resgate', 'Threshold Redemption'], ['Split', '80/20 artista/DApp'],
            ['Destino social', 'Fundo de Pesquisa NeuroArt'],
            ['Cofundação', 'Tales Hack e Prof. Alexandre de Souza Fortis']],
    ctaLabel: 'Acessar o DApp', ctaUrl: 'https://neuro-art-d-app.vercel.app',
    features: [
      ['Tokenização fracionada', 'A obra vira frações ERC-20. Dá para participar sem comprar a peça inteira.'],
      ['Resgate da obra física', 'Consolidou 100% das frações? O contrato queima os tokens e entrega a obra.'],
      ['BCI e neuroplasticidade', 'Interfaces cérebro-computador capturam estados de hiperfoco e viram metadado da obra.'],
      ['Fundo de pesquisa', 'Cada transação no marketplace alimenta o financiamento de ciência não medicamentosa.'],
      ['Split transparente', '80% para o artista, 20% para o DApp. A regra está no contrato, não numa promessa.'],
      ['Liberdade cognitiva', 'O whitepaper é um manifesto: neurodivergência como diferença, não como déficit.'],
    ],
    description: 'NeuroArt DApp: tokenização fracionada de arte neurodivergente na rede Base L2, financiando pesquisa não medicamentosa.',
    keywords: 'tokenização de arte, arte neurodivergente, DeSci Brasil, Base L2, tokenização fracionada',
    appCategory: 'WebApplication',
  });

  productPage({
    file: 'asphalt.html', name: 'Asphalt Hoops',
    tagline: 'Marque um rachão de basquete nas praças de Porto Alegre.',
    paragraphs: [
      'Encontrar jogo na quadra pública é uma questão de sorte: ou tem gente demais, ou não tem ninguém. O Asphalt Hoops resolve isso combinando local, horário e quem confirmou presença antes de alguém sair de casa.',
      'É um PWA: abre direto do navegador, carrega rápido e pode ser fixado na tela inicial sem passar por loja de aplicativo.',
    ],
    specs: [['Categoria', 'PWA / comunidade'], ['Cobertura', 'Quadras públicas de Porto Alegre'],
            ['Instalação', 'Nenhuma — roda no navegador'], ['Público', 'Jogadores de basquete de rua']],
    ctaLabel: 'Jogar agora', ctaUrl: 'https://asphalt-hoops-pwa.vercel.app',
    features: [
      ['Rachões perto de você', 'Veja os jogos marcados nas praças da sua região.'],
      ['Crie o seu', 'Defina quadra, horário e chame a galera.'],
      ['Lista de presença', 'Saiba quantos confirmaram antes de sair de casa.'],
      ['PWA leve', 'Abre no navegador e pode ir para a tela inicial.'],
      ['Sem cadastro pesado', 'Entrar e marcar leva menos de um minuto.'],
      ['Feito para a rua', 'Pensado para quadra pública, não para clube.'],
    ],
    description: 'Asphalt Hoops: PWA para marcar rachões de basquete nas quadras públicas de Porto Alegre.',
    keywords: 'basquete Porto Alegre, rachão de basquete, quadra pública, basquete de rua',
    appCategory: 'WebApplication',
  });
}

function buildSobre() {
  const members = [
    ['T', 'Tales Hack', 'Fundador · Visão e arte',
     'Artista plástico, escritor e ortodontista aposentado. Traz a curadoria visual e o propósito que orientam o que a empresa escolhe construir.'],
    ['H', 'Heitor Hack', 'Tech Lead · Engenharia',
     'Responde pela arquitetura e pela engenharia dos produtos. Transforma ideia em código legível, testável e seguro.'],
    ['F', 'Francisco Hack', 'Tech Lead · Produto',
     'Cuida da experiência e das novas frentes de produto. Junta técnica e visão de negócio em cada entrega.'],
  ].map(([i, n, r, d]) =>
    `<div class="member"><div class="member-avatar" aria-hidden="true">${i}</div><h3>${n}</h3><p class="role">${r}</p><p>${d}</p></div>`).join('');

  const values = [
    ['Propósito', 'Cada projeto carrega um impacto real — da arte à saúde, do lazer à produtividade.'],
    ['Família', 'Construímos juntos, com confiança e talentos que se completam.'],
    ['Transparência', 'Contamos o que está pronto, o que está em beta e o que ainda é só ideia.'],
  ].map(([t, d]) => `<article class="card"><h3>${t}</h3><p>${d}</p></article>`).join('');

  const body = `    <header class="page-hero">
      <div class="container">
        ${breadcrumbHtml([['index.html', 'Início'], [null, 'Sobre']])}
        <p class="eyebrow">Sobre nós</p>
        <h1>Uma fazenda de código,<br>uma família de criadores</h1>
        <p>Tecnologia e arte podem — e, na nossa leitura, devem — andar juntas.</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container measure">
        <p class="eyebrow">Nossa história</p>
        <h2 style="margin-bottom:20px">Da tela de pintura à tela do computador</h2>
        <div class="stack dim">
          <p>Começou quando Tales Hack, artista plástico e ortodontista aposentado, decidiu levar a própria prática criativa para o software — ao lado dos filhos Heitor e Francisco.</p>
          <p>O nome <strong>Hack Tech Farm</strong> carrega as iniciais dos três: <strong>H</strong>eitor, <strong>T</strong>ales e <strong>F</strong>rancisco. "Farm" porque é aqui que a ideia é plantada, cultivada e colhida.</p>
          <p>Hoje são quatro produtos no ar e seis em desenvolvimento, do Web3 à Inteligência Artificial — sempre com um toque humano e artístico.</p>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-head">
          <p class="eyebrow">A família</p>
          <h2>Quem cultiva</h2>
        </div>
        <div class="grid grid-3">${members}</div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head">
          <p class="eyebrow">Valores</p>
          <h2>O que nos guia</h2>
        </div>
        <div class="grid grid-3">${values}</div>
      </div>
    </section>
`;
  layout('sobre.html', 'Sobre — Hack Tech Farm',
    'Conheça a Hack Tech Farm: software house familiar criada por Tales Hack e os filhos Heitor e Francisco, em Porto Alegre.',
    body, { active: 'sobre.html', jsonld: [ORG_LD], trail: [['index.html', 'Início'], ['sobre.html', 'Sobre']] });
}

function buildParceiros() {
  const body = `    <header class="page-hero">
      <div class="container">
        ${breadcrumbHtml([['index.html', 'Início'], [null, 'Parceiros']])}
        <p class="eyebrow">Ecossistema</p>
        <h1>Parceiros e clientes</h1>
        <p>Organizações que caminham junto com a HTF em pesquisa, tecnologia e distribuição.</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        <div class="empty-state">
          <p><strong>Ainda não há parcerias públicas para exibir.</strong></p>
          <p style="margin-top:8px">Quando a primeira for anunciada, ela aparece aqui com logo, escopo e o que foi construído junto.</p>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-head">
          <p class="eyebrow">Vamos construir junto</p>
          <h2>Aberto para parcerias</h2>
          <p>Integração de APIs, pesquisa em neurodivergência, distribuição de SaaS ou desenvolvimento sob demanda.</p>
        </div>
        <p class="center"><a href="contato.html" class="btn btn-primary">Propor uma parceria</a></p>
      </div>
    </section>
`;
  layout('parceiros.html', 'Parceiros — Hack Tech Farm',
    'Parcerias estratégicas, integração de APIs e colaborações da Hack Tech Farm.',
    body, { active: 'parceiros.html', trail: [['index.html', 'Início'], ['parceiros.html', 'Parceiros']] });
}

function buildContato() {
  const body = `    <header class="page-hero">
      <div class="container">
        ${breadcrumbHtml([['index.html', 'Início'], [null, 'Contato']])}
        <p class="eyebrow">Contato</p>
        <h1>Vamos conversar</h1>
        <p>Parcerias, contratação ou uma dúvida sobre um dos produtos. A porta da fazenda está aberta.</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        <div class="split" style="align-items:start">
          <div>
            <h2 style="margin-bottom:22px">Envie uma mensagem</h2>
            <form data-form="contact" novalidate>
              <div class="form-group">
                <label for="name">Nome</label>
                <input type="text" id="name" name="name" autocomplete="name" required aria-describedby="err-name">
                <span class="field-error" id="err-name" role="alert"></span>
              </div>
              <div class="form-group">
                <label for="email">E-mail</label>
                <input type="email" id="email" name="email" autocomplete="email" required aria-describedby="err-email">
                <span class="field-error" id="err-email" role="alert"></span>
              </div>
              <div class="form-group">
                <label for="subject">Assunto</label>
                <select id="subject" name="subject">
                  <option value="parceria">Quero propor uma parceria</option>
                  <option value="cliente">Quero contratar a HTF</option>
                  <option value="produto">Dúvida sobre um produto</option>
                  <option value="imprensa">Imprensa</option>
                  <option value="outro">Outro assunto</option>
                </select>
              </div>
              <div class="form-group">
                <label for="message">Mensagem</label>
                <textarea id="message" name="message" required aria-describedby="err-message"></textarea>
                <span class="field-error" id="err-message" role="alert"></span>
              </div>
              <div class="hp-field" aria-hidden="true">
                <label for="website">Não preencha este campo</label>
                <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
              </div>
              <button type="submit" class="btn btn-primary">Enviar mensagem</button>
              <p class="form-msg" role="status" aria-live="polite"></p>
              <p class="dim" style="font-size:.82rem;margin-top:14px">Usamos seus dados apenas para responder este contato. Nada de lista de disparo sem você pedir.</p>
            </form>
          </div>
          <div class="stack">
            <h2 style="margin-bottom:6px">Outros caminhos</h2>
            <div class="card"><h3>E-mail</h3><p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p></div>
            <div class="card"><h3>Onde estamos</h3><p>Porto Alegre, RS — Brasil. Trabalhamos remoto com clientes de qualquer lugar.</p></div>
            <div class="card"><h3>Suporte de produto</h3><p>Para dúvidas sobre o Posthink, o suporte fica dentro do próprio app — a resposta é mais rápida por lá.</p></div>
          </div>
        </div>
      </div>
    </section>
`;
  layout('contato.html', 'Contato — Hack Tech Farm',
    'Fale com a Hack Tech Farm: parcerias, contratação e suporte aos produtos.',
    body, { active: 'contato.html', trail: [['index.html', 'Início'], ['contato.html', 'Contato']] });
}

function buildGaleria() {
  const obras = [
    ['obra-01', 'Sulco', 'Acrílica sobre tela, 2023'],
    ['obra-02', 'Ruído branco', 'Técnica mista, 2022'],
    ['obra-03', 'Colheita', 'Acrílica sobre tela, 2024'],
    ['obra-04', 'Sinapse', 'Óleo sobre tela, 2021'],
    ['obra-05', 'Terra batida', 'Técnica mista, 2023'],
    ['obra-06', 'Segunda leitura', 'Acrílica sobre papel, 2024'],
  ].map(([s, t, m]) =>
    `<li class="gallery-item"><button type="button" class="gallery-btn" data-full="img/obras/${s}.jpg" data-title="${t}" data-meta="${m}">`
    + `<img src="img/obras/${s}-thumb.jpg" alt="${t}, de Tales Hack. ${m}." loading="lazy" width="600" height="600">`
    + `<span class="meta">${t}<span>${m}</span></span></button></li>`).join('');

  const body = `    <header class="page-hero">
      <div class="container">
        ${breadcrumbHtml([['index.html', 'Início'], ['produtos.html', 'Produtos'], [null, 'ArtHack']])}
        <p class="eyebrow">ArtHack</p>
        <h1>O ateliê de Tales Hack</h1>
        <p>As obras que dão a textura visual de tudo o que a fazenda constrói. Clique em qualquer uma para ver em tamanho grande.</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        <ul class="gallery">${obras}</ul>
        <p class="center" style="margin-top:44px">
          <a href="https://www.taleshack.com.br" class="btn btn-primary" target="_blank" rel="noopener">Ver o acervo completo <span aria-hidden="true">↗</span><span class="visually-hidden"> (abre em nova aba)</span></a>
        </p>
      </div>
    </section>

    <dialog class="lightbox" id="lightbox" aria-label="Obra ampliada">
      <button type="button" class="lb-close" aria-label="Fechar">✕</button>
      <figure class="lightbox-inner">
        <img src="" alt="">
        <figcaption></figcaption>
      </figure>
    </dialog>
`;
  layout('galeria.html', 'ArtHack — Galeria de Tales Hack | Hack Tech Farm',
    'Galeria de obras do artista plástico Tales Hack, fundador da Hack Tech Farm.',
    body, { active: 'galeria.html',
      trail: [['index.html', 'Início'], ['produtos.html', 'Produtos'], ['galeria.html', 'ArtHack']] });
}

function build404() {
  const body = `    <header class="page-hero" style="padding-top:120px">
      <div class="container center">
        <p class="eyebrow" style="justify-content:center">Erro 404</p>
        <h1>Este canteiro está vazio</h1>
        <p class="measure">A página que você procurou não existe ou mudou de endereço. Os quatro produtos no ar continuam a um clique.</p>
        <div class="hero-actions" style="justify-content:center;margin-top:30px">
          <a href="index.html" class="btn btn-primary">Voltar para o início</a>
          <a href="produtos.html" class="btn btn-ghost">Ver os produtos</a>
        </div>
      </div>
    </header>
`;
  layout('404.html', 'Página não encontrada — Hack Tech Farm', 'A página procurada não existe.', body, { noindex: true });
}

function buildSitemap() {
  const pages = ['', 'produtos.html', 'posthink.html', 'neuroart.html', 'asphalt.html',
                 'galeria.html', 'roadmap.html', 'sobre.html', 'parceiros.html', 'contato.html'];
  const urls = pages.map((p) => {
    const freq = ['', 'produtos.html', 'roadmap.html'].includes(p) ? 'weekly' : 'monthly';
    const prio = p === '' ? '1.0' : ['produtos.html', 'posthink.html'].includes(p) ? '0.8' : '0.6';
    return `  <url><loc>${SITE_URL}/${p}</loc><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`;
  }).join('\n');

  writeFileSync(join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'utf8');

  writeFileSync(join(ROOT, 'robots.txt'),
    `User-agent: *\nAllow: /\nDisallow: /dashboard.html\nDisallow: /login.html\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, 'utf8');
}

buildHome();
buildProdutos();
buildProductPages();
buildGaleria();
buildRoadmap();
buildSobre();
buildParceiros();
buildContato();
build404();
buildSitemap();

console.log(`Build concluído — ${live().length} produtos no ar, ${dev().length} em desenvolvimento.`);
console.log('Páginas: index, produtos, posthink, neuroart, asphalt, galeria, roadmap, sobre, parceiros, contato, 404');
