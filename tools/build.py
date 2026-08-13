#!/usr/bin/env python3
"""
Gera as páginas estáticas do site da Hack Tech Farm.

Por que um gerador: a versão anterior repetia navbar e rodapé em nove arquivos
à mão, o que já tinha produzido divergências (o dashboard aparecia no menu
público, o item ativo estava marcado errado em algumas páginas). Aqui o layout
existe uma vez só.

Uso:  python3 tools/build.py
Saída: HTML na raiz do projeto. O deploy continua sendo 100% estático.
"""

import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE_URL = "https://hacktechfarm.com"

NAV = [
    ("index.html", "Início", None),
    ("produtos.html", "Produtos", [
        ("neuroart.html", "NeuroArt DApp"),
        ("posthink.html", "Posthink"),
        ("asphalt.html", "Asphalt Hoops"),
        ("galeria.html", "ArtHack"),
    ]),
    ("roadmap.html", "Roadmap", None),
    ("sobre.html", "Sobre", None),
    ("parceiros.html", "Parceiros", None),
    ("contato.html", "Contato", None),
]

FOOTER_COLUMNS = [
    ("Produtos", [
        ("neuroart.html", "NeuroArt DApp"),
        ("posthink.html", "Posthink"),
        ("asphalt.html", "Asphalt Hoops"),
        ("galeria.html", "ArtHack"),
    ]),
    ("Empresa", [
        ("sobre.html", "Sobre nós"),
        ("roadmap.html", "Roadmap"),
        ("parceiros.html", "Parceiros"),
        ("contato.html", "Contato"),
    ]),
    ("Contato", [
        ("mailto:contato@hacktechfarm.com", "contato@hacktechfarm.com"),
        ("contato.html", "Fale conosco"),
    ]),
]


def nav_html(active, page_group):
    items = []
    for href, label, children in NAV:
        if children:
            expanded_current = ' aria-current="page"' if page_group == href else ""
            subs = "".join(
                '<a href="{h}"{c}>{l}</a>'.format(
                    h=h, l=l, c=' aria-current="page"' if active == h else ""
                )
                for h, l in children
            )
            items.append(
                '<div class="dropdown">'
                '<button type="button" class="dropdown-toggle" aria-expanded="false" '
                'aria-controls="menu-produtos">{label}<span class="chev" aria-hidden="true">▾</span></button>'
                '<div class="dropdown-menu" id="menu-produtos">'
                '<a href="{href}"{cur}>Todos os produtos</a>{subs}</div></div>'.format(
                    label=label, href=href, cur=expanded_current, subs=subs
                )
            )
        else:
            cur = ' aria-current="page"' if active == href else ""
            items.append('<a href="{h}"{c}>{l}</a>'.format(h=href, c=cur, l=label))
    return "".join(items)


def footer_html():
    cols = []
    for title, links in FOOTER_COLUMNS:
        lis = "".join(
            '<li><a href="{h}">{l}</a></li>'.format(h=h, l=l) for h, l in links
        )
        cols.append("<div><h2>{t}</h2><ul>{lis}</ul></div>".format(t=title, lis=lis))
    return """  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="index.html" class="logo"><span class="logo-mark" aria-hidden="true">HTF</span> Hack Tech Farm</a>
          <p>Software house familiar em Porto Alegre. Apps e SaaS com propósito, arte e tecnologia.</p>
        </div>
        {cols}
      </div>
      <div class="footer-bottom">
        <span>&copy; <span data-year>2026</span> Hack Tech Farm. Todos os direitos reservados.</span>
        <span>Porto Alegre, RS &mdash; Brasil</span>
      </div>
    </div>
  </footer>
""".format(cols="\n        ".join(cols))


def breadcrumb_html(trail):
    """trail: lista de (href|None, label). O último item é a página atual."""
    if not trail:
        return ""
    items = []
    for href, label in trail:
        if href:
            items.append('<li><a href="{h}">{l}</a></li>'.format(h=href, l=label))
        else:
            items.append('<li aria-current="page">{l}</li>'.format(l=label))
    return (
        '<nav class="breadcrumb" aria-label="Você está aqui"><ol>{}</ol></nav>'.format(
            "".join(items)
        )
    )


def breadcrumb_jsonld(trail):
    if len(trail) < 2:
        return ""
    elements = []
    for i, (href, label) in enumerate(trail, start=1):
        elements.append({
            "@type": "ListItem",
            "position": i,
            "name": label,
            "item": "{}/{}".format(SITE_URL, href or ""),
        })
    return json.dumps(
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": elements},
        ensure_ascii=False,
    )


def layout(filename, title, description, body, *, active=None, page_group=None,
           trail=None, scripts=(), jsonld=(), noindex=False, keywords=None):
    trail = trail or []
    extra_ld = [j for j in jsonld if j]
    bc = breadcrumb_jsonld(trail)
    if bc:
        extra_ld.append(bc)

    ld_tags = "\n  ".join(
        '<script type="application/ld+json">{}</script>'.format(j) for j in extra_ld
    )
    script_tags = "\n  ".join(
        '<script src="{}" defer></script>'.format(s) for s in scripts
    )
    canonical = "{}/{}".format(SITE_URL, "" if filename == "index.html" else filename)

    html = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{description}">
  {keywords}<link rel="canonical" href="{canonical}">
  {robots}<meta name="theme-color" content="#0B0F1A">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Hack Tech Farm">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="{site}/img/og-cover.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{description}">
  <meta name="twitter:image" content="{site}/img/og-cover.png">

  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="css/styles.css">
  {ld}
</head>
<body>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

  <nav class="nav" aria-label="Navegação principal">
    <div class="container nav-inner">
      <a href="index.html" class="logo"><span class="logo-mark" aria-hidden="true">HTF</span> Hack Tech Farm</a>
      <button type="button" class="menu-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Abrir menu">☰</button>
      <div class="nav-links" id="nav-links" data-open="false">
        {nav}
      </div>
    </div>
  </nav>

  <main id="conteudo">
{body}  </main>

{footer}
  <script src="js/config.js"></script>
  <script src="js/site.js" defer></script>
  {scripts}
</body>
</html>
""".format(
        title=title,
        description=description,
        keywords='<meta name="keywords" content="{}">\n  '.format(keywords) if keywords else "",
        canonical=canonical,
        site=SITE_URL,
        robots='<meta name="robots" content="noindex, nofollow">\n  ' if noindex else "",
        ld=ld_tags,
        nav=nav_html(active, page_group),
        body=body,
        footer=footer_html(),
        scripts=script_tags,
    )
    (ROOT / filename).write_text(html, encoding="utf-8")
    return html


# ---------------------------------------------------------------------------
# Blocos reutilizáveis
# ---------------------------------------------------------------------------

# --- Pré-renderização do catálogo -------------------------------------------
# O HTML sai do build já com produtos e roadmap dentro. O JS (catalog.js) só
# substitui quando os dados do banco diferem do seed. Sem isso, o buscador vê
# uma grade vazia e o PRD §8 (SEO) fica descumprido.

SEED = json.loads((ROOT / "data" / "seed.json").read_text(encoding="utf-8"))["products"]
CATEGORY_CLASS = {"Web3": "tag-web3", "IA": "tag-ai", "PWA": "tag-pwa", "Arte": "tag-art"}
STAGE_LABEL = {"alpha": "Alpha", "beta": "Beta", "planning": "Planejamento"}
STAGE_CLASS = {"alpha": "status-alpha", "beta": "status-beta", "planning": "status-planning"}


def esc(text):
    return (str(text or "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def _card(p):
    if p.get("page_url"):
        link = ('<a class="card-link card-stretch" href="{}">Ver detalhes '
                '<span aria-hidden="true">→</span></a>'.format(esc(p["page_url"])))
    elif p.get("url"):
        link = ('<a class="card-link card-stretch" href="{u}" target="_blank" rel="noopener">'
                'Abrir {n} <span aria-hidden="true">↗</span>'
                '<span class="visually-hidden"> (abre em nova aba)</span></a>'.format(
                    u=esc(p["url"]), n=esc(p["name"])))
    else:
        link = ""

    tag = ('<span class="card-tag {c}">{l}</span>'.format(
        c=CATEGORY_CLASS.get(p.get("category"), "tag-pwa"), l=esc(p["category"]))
        if p.get("category") else "")

    return ('<article class="card">'
            '<div class="card-icon" aria-hidden="true">{i}</div>{tag}'
            '<h3>{n}</h3><p>{t}</p>{link}</article>'.format(
                i=esc(p.get("icon", "📦")), tag=tag, n=esc(p["name"]),
                t=esc(p.get("tagline") or p.get("description")), link=link))


def prerender_products(limit=None):
    live = [p for p in SEED if p["status"] == "live"]
    live.sort(key=lambda p: p["sort_order"])
    return "".join(_card(p) for p in (live[:limit] if limit else live))


def prerender_roadmap():
    dev = [p for p in SEED if p["status"] == "dev"]
    dev.sort(key=lambda p: p["sort_order"])
    return "".join(
        '<li class="tl-item">'
        '<span class="tl-dot{art}" aria-hidden="true">{i:02d}</span>'
        '<span class="tl-status {sc}">{sl}</span>'
        '<h3>{n}</h3><p>{d}</p></li>'.format(
            art=" art" if p.get("stage") == "beta" else "",
            i=i, sc=STAGE_CLASS.get(p.get("stage"), "status-planning"),
            sl=STAGE_LABEL.get(p.get("stage"), "Planejamento"),
            n=esc(p["name"]), d=esc(p.get("description") or p.get("tagline")))
        for i, p in enumerate(dev, start=1)
    )


def prerender_furrows():
    live = sorted([p for p in SEED if p["status"] == "live"], key=lambda p: p["sort_order"])[:4]
    return "".join(
        '<li class="furrow"><span class="idx">{i:02d}</span>'
        '<span class="nm">{n}</span><span class="st">{c}</span></li>'.format(
            i=i, n=esc(p["name"]), c=esc(p.get("category") or "no ar"))
        for i, p in enumerate(live, start=1)
    )


def newsletter_block(heading, text):
    return """      <div class="newsletter">
        <h2>{h}</h2>
        <p>{t}</p>
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
""".format(h=heading, t=text)


def product_page(filename, name, tagline, intro_paragraphs, specs, cta_label, cta_url,
                 features, icon, active_child, description, keywords, app_category):
    cta = (
        '<a href="{u}" class="btn btn-primary" target="_blank" rel="noopener">{l} '
        '<span aria-hidden="true">↗</span><span class="visually-hidden"> (abre em nova aba)</span></a>'.format(
            u=cta_url, l=cta_label
        )
        if cta_url
        else '<p class="dim"><strong>Acesso em breve.</strong> Assine a newsletter para saber quando abrir.</p>'
    )
    spec_rows = "".join(
        "<div><dt>{k}</dt><dd>{v}</dd></div>".format(k=k, v=v) for k, v in specs
    )
    feature_cards = "".join(
        '<article class="card"><h3>{t}</h3><p>{d}</p></article>'.format(t=t, d=d)
        for t, d in features
    )
    paragraphs = "".join("<p>{}</p>".format(p) for p in intro_paragraphs)

    ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": name,
        "applicationCategory": app_category,
        "operatingSystem": "Web",
        "description": description,
        "url": cta_url or "{}/{}".format(SITE_URL, filename),
        "publisher": {"@type": "Organization", "name": "Hack Tech Farm", "url": SITE_URL},
    }, ensure_ascii=False)

    body = """    <header class="page-hero">
      <div class="container">
        {bc}
        <p class="eyebrow">Produto no ar</p>
        <h1>{name}</h1>
        <p>{tagline}</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        <div class="split">
          <div>
            <h2>{tagline}</h2>
            {paragraphs}
            <div class="hero-actions" style="margin-top:26px">{cta}</div>
          </div>
          <dl class="spec">{specs}</dl>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-head">
          <p class="eyebrow">O que ele faz</p>
          <h2>Recursos</h2>
        </div>
        <div class="grid grid-3">{features}</div>
      </div>
    </section>
""".format(
        bc=breadcrumb_html([("index.html", "Início"), ("produtos.html", "Produtos"), (None, name)]),
        name=name, tagline=tagline, paragraphs=paragraphs, cta=cta,
        specs=spec_rows, features=feature_cards,
    )

    layout(filename, "{} — Hack Tech Farm".format(name), description, body,
           active=active_child, page_group="produtos.html",
           trail=[("index.html", "Início"), ("produtos.html", "Produtos"), (filename, name)],
           jsonld=[ld], keywords=keywords)


# ---------------------------------------------------------------------------
# Páginas
# ---------------------------------------------------------------------------

ORG_LD = json.dumps({
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Hack Tech Farm",
    "alternateName": "HTF",
    "url": SITE_URL,
    "email": "contato@hacktechfarm.com",
    "description": "Software house familiar de Porto Alegre. Desenvolvimento de software, "
                   "tokenização de arte e IA para LinkedIn.",
    "address": {"@type": "PostalAddress", "addressLocality": "Porto Alegre",
                "addressRegion": "RS", "addressCountry": "BR"},
    "founder": [
        {"@type": "Person", "name": "Tales Hack"},
        {"@type": "Person", "name": "Heitor Hack"},
        {"@type": "Person", "name": "Francisco Hack"},
    ],
}, ensure_ascii=False)


def build_home():
    body = """    <header class="hero">
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
          <ul class="furrows" id="hero-furrows">{furrows}</ul>
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
        <div class="grid grid-3" id="featured-grid">{featured}</div>
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
{nl}      </div>
    </section>
""".format(furrows=prerender_furrows(), featured=prerender_products(3),
           nl=newsletter_block(
        "Fique por dentro do que plantamos",
        "Lançamentos, bastidores e os produtos que ainda estão no roadmap."))

    layout("index.html",
           "Hack Tech Farm — Software que cultiva arte",
           "Software house familiar de Porto Alegre. Desenvolvimento de software, tokenização de arte e IA para LinkedIn: NeuroArt, Posthink, Asphalt Hoops e ArtHack.",
           body, active="index.html",
           scripts=("js/data.js", "js/catalog.js"),
           jsonld=[ORG_LD],
           keywords="desenvolvimento de software, tokenização de arte, IA para LinkedIn, software house Porto Alegre")


def build_produtos():
    body = """    <header class="page-hero">
      <div class="container">
        {bc}
        <p class="eyebrow">Portfólio</p>
        <h1>Nosso portfólio</h1>
        <p>Quatro produtos no ar, cada um com uma história e um propósito próprios. A lista é lida direto do catálogo — quando um produto entra, ele aparece aqui.</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        <div class="grid grid-2" id="products-grid">{cards}</div>
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
""".format(bc=breadcrumb_html([("index.html", "Início"), (None, "Produtos")]),
           cards=prerender_products())

    layout("produtos.html", "Produtos — Hack Tech Farm",
           "NeuroArt DApp, Posthink, Asphalt Hoops e ArtHack: os produtos digitais da Hack Tech Farm.",
           body, active="produtos.html", page_group="produtos.html",
           trail=[("index.html", "Início"), ("produtos.html", "Produtos")],
           scripts=("js/data.js", "js/catalog.js"))


def build_roadmap():
    body = """    <header class="page-hero">
      <div class="container">
        {bc}
        <p class="eyebrow">Em desenvolvimento</p>
        <h1>O que estamos plantando</h1>
        <p>Seis produtos entre alpha, beta e planejamento. As datas nós não prometemos; o progresso a gente conta na newsletter.</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        <ol class="timeline" id="roadmap-timeline">{items}</ol>
      </div>
    </section>

    <section class="section">
      <div class="container">
{nl}      </div>
    </section>
""".format(bc=breadcrumb_html([("index.html", "Início"), (None, "Roadmap")]),
           items=prerender_roadmap(),
           nl=newsletter_block("Quer saber quando algum destes abrir?",
                               "Avisamos por e-mail no dia em que o beta virar público."))

    layout("roadmap.html", "Roadmap — Hack Tech Farm",
           "Verdant, HackFinance Pro, FinanMap Cripto, Second Soul, TPC e RadarPrevi: os produtos em desenvolvimento na Hack Tech Farm.",
           body, active="roadmap.html",
           trail=[("index.html", "Início"), ("roadmap.html", "Roadmap")],
           scripts=("js/data.js", "js/catalog.js"))


def build_sobre():
    members = [
        ("T", "Tales Hack", "Fundador · Visão e arte",
         "Artista plástico, escritor e ortodontista aposentado. Traz a curadoria visual e o propósito que orientam o que a empresa escolhe construir."),
        ("H", "Heitor Hack", "Tech Lead · Engenharia",
         "Responde pela arquitetura e pela engenharia dos produtos. Transforma ideia em código legível, testável e seguro."),
        ("F", "Francisco Hack", "Tech Lead · Produto",
         "Cuida da experiência e das novas frentes de produto. Junta técnica e visão de negócio em cada entrega."),
    ]
    cards = "".join(
        '<div class="member"><div class="member-avatar" aria-hidden="true">{i}</div>'
        '<h3>{n}</h3><p class="role">{r}</p><p>{d}</p></div>'.format(i=i, n=n, r=r, d=d)
        for i, n, r, d in members
    )
    values = [
        ("Propósito", "Cada projeto carrega um impacto real — da arte à saúde, do lazer à produtividade."),
        ("Família", "Construímos juntos, com confiança e talentos que se completam."),
        ("Transparência", "Contamos o que está pronto, o que está em beta e o que ainda é só ideia."),
    ]
    value_cards = "".join(
        '<article class="card"><h3>{t}</h3><p>{d}</p></article>'.format(t=t, d=d)
        for t, d in values
    )

    body = """    <header class="page-hero">
      <div class="container">
        {bc}
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
        <div class="grid grid-3">{members}</div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head">
          <p class="eyebrow">Valores</p>
          <h2>O que nos guia</h2>
        </div>
        <div class="grid grid-3">{values}</div>
      </div>
    </section>
""".format(bc=breadcrumb_html([("index.html", "Início"), (None, "Sobre")]),
           members=cards, values=value_cards)

    layout("sobre.html", "Sobre — Hack Tech Farm",
           "Conheça a Hack Tech Farm: software house familiar criada por Tales Hack e os filhos Heitor e Francisco, em Porto Alegre.",
           body, active="sobre.html",
           trail=[("index.html", "Início"), ("sobre.html", "Sobre")],
           jsonld=[ORG_LD])


def build_parceiros():
    body = """    <header class="page-hero">
      <div class="container">
        {bc}
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
""".format(bc=breadcrumb_html([("index.html", "Início"), (None, "Parceiros")]))

    layout("parceiros.html", "Parceiros — Hack Tech Farm",
           "Parcerias estratégicas, integração de APIs e colaborações da Hack Tech Farm.",
           body, active="parceiros.html",
           trail=[("index.html", "Início"), ("parceiros.html", "Parceiros")])


def build_contato():
    body = """    <header class="page-hero">
      <div class="container">
        {bc}
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
            <div class="card">
              <h3>E-mail</h3>
              <p><a href="mailto:contato@hacktechfarm.com">contato@hacktechfarm.com</a></p>
            </div>
            <div class="card">
              <h3>Onde estamos</h3>
              <p>Porto Alegre, RS — Brasil. Trabalhamos remoto com clientes de qualquer lugar.</p>
            </div>
            <div class="card">
              <h3>Suporte de produto</h3>
              <p>Para dúvidas sobre o Posthink, o suporte fica dentro do próprio app — a resposta é mais rápida por lá.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
""".format(bc=breadcrumb_html([("index.html", "Início"), (None, "Contato")]))

    layout("contato.html", "Contato — Hack Tech Farm",
           "Fale com a Hack Tech Farm: parcerias, contratação e suporte aos produtos.",
           body, active="contato.html",
           trail=[("index.html", "Início"), ("contato.html", "Contato")])


def build_galeria():
    obras = [
        ("obra-01", "Sulco", "Acrílica sobre tela, 2023"),
        ("obra-02", "Ruído branco", "Técnica mista, 2022"),
        ("obra-03", "Colheita", "Acrílica sobre tela, 2024"),
        ("obra-04", "Sinapse", "Óleo sobre tela, 2021"),
        ("obra-05", "Terra batida", "Técnica mista, 2023"),
        ("obra-06", "Segunda leitura", "Acrílica sobre papel, 2024"),
    ]
    items = "".join(
        '<li class="gallery-item">'
        '<button type="button" class="gallery-btn" data-full="img/obras/{s}.jpg" '
        'data-title="{t}" data-meta="{m}">'
        '<img src="img/obras/{s}-thumb.jpg" alt="{t}, de Tales Hack. {m}." loading="lazy" width="600" height="600">'
        '<span class="meta">{t}<span>{m}</span></span></button></li>'.format(s=s, t=t, m=m)
        for s, t, m in obras
    )

    body = """    <header class="page-hero">
      <div class="container">
        {bc}
        <p class="eyebrow">ArtHack</p>
        <h1>O ateliê de Tales Hack</h1>
        <p>As obras que dão a textura visual de tudo o que a fazenda constrói. Clique em qualquer uma para ver em tamanho grande.</p>
      </div>
    </header>

    <section class="section" style="padding-top:24px">
      <div class="container">
        <ul class="gallery">{items}</ul>
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
""".format(bc=breadcrumb_html([("index.html", "Início"), ("produtos.html", "Produtos"), (None, "ArtHack")]),
           items=items)

    layout("galeria.html", "ArtHack — Galeria de Tales Hack | Hack Tech Farm",
           "Galeria de obras do artista plástico Tales Hack, fundador da Hack Tech Farm.",
           body, active="galeria.html", page_group="produtos.html",
           trail=[("index.html", "Início"), ("produtos.html", "Produtos"), ("galeria.html", "ArtHack")])


def build_404():
    body = """    <header class="page-hero" style="padding-top:120px">
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
"""
    layout("404.html", "Página não encontrada — Hack Tech Farm",
           "A página procurada não existe.", body, noindex=True)


def build_products():
    product_page(
        "posthink.html", "Posthink",
        "A IA escreve, você continua sendo o autor.",
        ["Você dá o tema. O Posthink pesquisa, escreve no seu tom e deixa o post pronto para revisão. "
         "Nada vai ao ar sem a sua aprovação.",
         "A publicação sai pela API oficial do LinkedIn, no horário que você marcar — sem automação "
         "cinzenta e sem risco para a sua conta.",
         "Feito para profissionais liberais que querem autoridade sem virar produtor de conteúdo em "
         "tempo integral, e para ghostwriters que precisam de volume sem abrir mão da qualidade."],
        [("Categoria", "SaaS de conteúdo com IA"),
         ("Publicação", "API oficial do LinkedIn"),
         ("Controle", "Aprovação humana obrigatória"),
         ("Público", "Profissionais liberais e ghostwriters")],
        "Acessar o Posthink", "https://posthink.com.br",
        [("Pesquisa do tema", "A IA levanta o contexto antes de escrever, em vez de improvisar."),
         ("Seu tom, não o dela", "O texto aprende a sua voz e a sua área de atuação."),
         ("Agendamento", "Você marca o horário; a publicação sai pela API oficial."),
         ("Aprovação humana", "Todo post passa por você antes de ir ao ar."),
         ("Fila editorial", "Pautas soltas viram uma agenda de publicação consistente."),
         ("Sem risco de conta", "Nada de automação por navegador ou login de terceiros.")],
        "✍️", "posthink.html",
        "Posthink: a IA pesquisa, escreve no seu tom e publica no LinkedIn pela API oficial — com sua aprovação antes de cada post.",
        "IA para LinkedIn, agendamento de posts, ghostwriter com IA, criação de conteúdo LinkedIn",
        "BusinessApplication",
    )

    product_page(
        "neuroart.html", "NeuroArt DApp",
        "Arte neurodivergente, tokenizada e com procedência verificável.",
        ["O NeuroArt tokeniza e vende obras criadas por artistas neurodivergentes e simpatizantes. "
         "Cada obra vira um token, o que dá a compradores e artistas um histórico de procedência que "
         "não depende da palavra de ninguém.",
         "Parte de cada venda financia pesquisa não medicamentosa em neurodivergência — a linha que "
         "trata variação neurobiológica como diferença, não como déficit.",
         "Não é só um marketplace: é uma ponte entre expressão artística e financiamento de pesquisa."],
        [("Categoria", "DApp / Web3"),
         ("Função", "Tokenização e venda de obras"),
         ("Destino social", "Pesquisa não medicamentosa"),
         ("Público", "Artistas neurodivergentes e colecionadores")],
        "Acessar o DApp", "",
        [("Procedência", "O histórico de cada obra fica registrado on-chain."),
         ("Neurodiversidade", "Trata variação neurobiológica como força criativa."),
         ("Pesquisa", "Parte da venda financia ciência não medicamentosa."),
         ("Curadoria", "Seleção conduzida por quem entende de arte, não por algoritmo."),
         ("Artista no centro", "O criador acompanha para onde a obra vai."),
         ("Sem intermediário oculto", "As regras de repasse ficam visíveis no contrato.")],
        "🎨", "neuroart.html",
        "NeuroArt DApp: tokenização e venda de obras de artistas neurodivergentes, financiando pesquisa não medicamentosa.",
        "tokenização de arte, DApp arte, arte neurodivergente, NFT arte Brasil",
        "WebApplication",
    )

    product_page(
        "asphalt.html", "Asphalt Hoops",
        "Marque um rachão de basquete nas praças de Porto Alegre.",
        ["Encontrar jogo na quadra pública é uma questão de sorte: ou tem gente demais, ou não tem "
         "ninguém. O Asphalt Hoops resolve isso combinando local, horário e quem confirmou presença "
         "antes de alguém sair de casa.",
         "É um PWA: abre direto do navegador, carrega rápido e pode ser fixado na tela inicial sem "
         "passar por loja de aplicativo."],
        [("Categoria", "PWA / comunidade"),
         ("Cobertura", "Quadras públicas de Porto Alegre"),
         ("Instalação", "Nenhuma — roda no navegador"),
         ("Público", "Jogadores de basquete de rua")],
        "Jogar agora", "https://asphalt-hoops-pwa.vercel.app",
        [("Rachões perto de você", "Veja os jogos marcados nas praças da sua região."),
         ("Crie o seu", "Defina quadra, horário e chame a galera."),
         ("Lista de presença", "Saiba quantos confirmaram antes de sair de casa."),
         ("PWA leve", "Abre no navegador e pode ir para a tela inicial."),
         ("Sem cadastro pesado", "Entrar e marcar leva menos de um minuto."),
         ("Feito para a rua", "Pensado para quadra pública, não para clube.")],
        "🏀", "asphalt.html",
        "Asphalt Hoops: PWA para marcar rachões de basquete nas quadras públicas de Porto Alegre.",
        "basquete Porto Alegre, rachão de basquete, quadra pública, basquete de rua",
        "WebApplication",
    )


def build_sitemap():
    pages = ["", "produtos.html", "posthink.html", "neuroart.html", "asphalt.html",
             "galeria.html", "roadmap.html", "sobre.html", "parceiros.html", "contato.html"]
    urls = "\n".join(
        "  <url><loc>{}/{}</loc><changefreq>{}</changefreq><priority>{}</priority></url>".format(
            SITE_URL, p, "weekly" if p in ("", "produtos.html", "roadmap.html") else "monthly",
            "1.0" if p == "" else "0.8" if p in ("produtos.html", "posthink.html") else "0.6")
        for p in pages
    )
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + urls + "\n</urlset>\n", encoding="utf-8")

    (ROOT / "robots.txt").write_text(
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /dashboard.html\n"
        "Disallow: /login.html\n"
        "Disallow: /api/\n\n"
        "Sitemap: {}/sitemap.xml\n".format(SITE_URL), encoding="utf-8")


if __name__ == "__main__":
    build_home()
    build_produtos()
    build_products()
    build_galeria()
    build_roadmap()
    build_sobre()
    build_parceiros()
    build_contato()
    build_404()
    build_sitemap()
    generated = sorted(p.name for p in ROOT.glob("*.html"))
    print("Páginas geradas ({}): {}".format(len(generated), ", ".join(generated)))
    print("Também: sitemap.xml, robots.txt")
