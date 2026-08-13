# Hack Tech Farm — site institucional e hub de produtos

Site multi-página + área restrita de gestão de conteúdo, conforme o PRD de
13/08/2026.

**Stack:** HTML/CSS/JS estático · Vercel (hospedagem + funções serverless) ·
GitHub (armazenamento do conteúdo) · Brevo (e-mails).

**Sem banco de dados.**

---

## Como funciona

O catálogo de produtos vive em `data/products.json`, versionado neste
repositório. Quando alguém publica pelo dashboard, uma função serverless grava
o arquivo pela API do GitHub. O commit dispara um build na Vercel, que roda
`tools/build.mjs` e reescreve o HTML com o catálogo novo.

```
  dashboard ──► /api/products ──► commit no GitHub ──► build na Vercel ──► site
   (browser)     (serverless)    (data/products.json)     (build.mjs)      ~40s
```

Três consequências que valem entender:

- **O HTML sai pronto do build.** Buscador e leitor de tela recebem os produtos
  no HTML, não montados por JavaScript depois. É o que atende o PRD §8 (SEO).
- **Cada alteração é um commit** com autor e data. Errou? `git revert`.
- **Nada quebra se um serviço cair.** O site é estático; não há consulta a
  banco no carregamento da página.

### Por que Node no build

`tools/build.mjs` roda no servidor da Vercel a cada publicação. Node é
garantido lá; Python não. É por isso que o gerador está em JavaScript e só
`tools/make_assets.py` (imagens, rodado localmente) segue em Python.

---

## Estrutura

```
Hack-Tech-Farm-site/
├── index.html sobre.html produtos.html …   ← GERADOS por tools/build.mjs
├── login.html dashboard.html               ← área restrita (noindex)
├── data/products.json                      ← fonte única de verdade
├── css/styles.css                          ← design system
├── css/dashboard.css                       ← só a área restrita
├── js/
│   ├── site.js        navegação, formulários, galeria
│   ├── login.js       tela de entrada
│   └── dashboard.js   gestão do catálogo
├── api/
│   ├── _lib.js        sessão cifrada, GitHub, Brevo, anti-spam
│   ├── auth/          login, callback, session, logout
│   ├── products.js    lê e grava o catálogo
│   ├── subscribe.js   newsletter → Brevo
│   └── contact.js     formulário → e-mail via Brevo
├── img/                                    ← favicon, capa OG, galeria
├── tools/build.mjs verify.mjs make_assets.py
└── vercel.json                             ← CSP, HSTS, build e cache
```

**Não edite os `.html` da raiz à mão.** Eles são sobrescritos a cada build.
Para mudar texto de página, edite `tools/build.mjs`.

---

## Rodar localmente

```bash
npm run dev            # gera o HTML e serve em http://localhost:4000
npm run verify         # links, CSP, contraste, coerência do catálogo
```

O site carrega normalmente. O dashboard e os formulários precisam das funções
em `/api`, que só existem na Vercel — use `vercel dev` se quiser testá-los.

---

## Deploy

### 1. OAuth App no GitHub

github.com → Settings → Developer settings → **OAuth Apps** → New OAuth App.

| Campo | Valor |
|---|---|
| Application name | Hack Tech Farm — dashboard |
| Homepage URL | `https://hacktechfarm.com.br.br` |
| Authorization callback URL | `https://hacktechfarm.com.br.br/api/auth/callback` |

Guarde o **Client ID** e gere um **Client Secret**.

O callback precisa bater exatamente com o domínio final. Se for testar antes
de apontar o domínio, use a URL `.vercel.app` primeiro e troque depois.

### 2. Brevo

Crie a conta em [brevo.com](https://brevo.com), plano gratuito.

1. **SMTP & API → API Keys → Generate** — guarde a chave.
2. **Contacts → Lists → Create** — anote o ID numérico da lista.
3. **Senders & Domains** — verifique o domínio `hacktechfarm.com.br.br`. Sem isso o
   remetente do formulário é recusado ou cai em spam.

### 3. Vercel

vercel.com → **Add New → Project** → selecione o repositório.
Framework: **Other**. O `vercel.json` já define o build.

Em Settings → Environment Variables:

| Variável | Onde obter |
|---|---|
| `GITHUB_CLIENT_ID` | OAuth App |
| `GITHUB_CLIENT_SECRET` | OAuth App |
| `GITHUB_REPO` | `taleshack-prog/Hack-Tech-Farm-site` |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BREVO_API_KEY` | Brevo → API Keys |
| `BREVO_LIST_ID` | Brevo → Lists |
| `CONTACT_TO` | `contato@hacktechfarm.com.br.br` |
| `CONTACT_FROM` | remetente no domínio verificado |

Deploy. Depois aponte o domínio em Settings → Domains.

---

## Segurança

**Login.** Não existe senha. Quem tem permissão de escrita no repositório
administra o site — a verificação é feita contra a própria API do GitHub a
cada login, então revogar acesso no GitHub revoga o acesso ao dashboard.

**Sessão.** O token do GitHub é cifrado com AES-256-GCM e guardado num cookie
`HttpOnly; Secure; SameSite=Lax`, com validade de 8 horas. O JavaScript da
página nunca vê o token, nem em caso de XSS.

**Escopo.** O OAuth pede `public_repo`, o mínimo para gravar num repositório
público. Não há acesso a repositórios privados nem a nada além.

**Validação.** Toda regra do catálogo é aplicada em `api/products.js`, no
servidor. Validar só no navegador seria decorativo — qualquer pessoa
autenticada poderia mandar um `PUT` direto pela linha de comando.

**Concorrência.** A gravação usa o `sha` do arquivo. Se duas pessoas editarem
ao mesmo tempo, a segunda recebe erro e a alteração da primeira não é
sobrescrita em silêncio.

**Cabeçalhos.** CSP com `script-src 'self'` (nenhum script inline em nenhuma
página), HSTS, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy.

**Formulários.** Honeypot, verificação de tempo de preenchimento e rate limit
por IP. Nenhum dado de visitante é armazenado aqui: a inscrição vai direto
para o Brevo e a mensagem de contato vira e-mail.

---

## Acessibilidade

Alvo: WCAG 2.1 AA. `npm run verify` roda as checagens automatizáveis —
contraste calculado par a par, `alt` em toda imagem, `lang`, um `<h1>` por
página, ausência de handlers inline.

**Falta fazer manualmente:** teste com leitor de tela (NVDA ou VoiceOver) e
navegação completa por teclado.

---

## Pendências antes do lançamento

1. **Imagens da galeria.** `img/obras/*.jpg` são placeholders gerados por
   código. Substitua pelas fotos reais, mantendo o par `<slug>.jpg` +
   `<slug>-thumb.jpg`, e ajuste títulos e fichas técnicas em
   `tools/build.mjs` → `buildGaleria()`.
2. **URL do NeuroArt.** O DApp não tem endereço público. A página está no ar
   com o CTA desativado; quando houver domínio, cadastre pelo dashboard.
3. **Descrições do roadmap.** Verdant, HackFinance Pro, FinanMap Cripto,
   Second Soul, TPC e RadarPrevi têm teaser provisório. Second Soul e TPC
   ficaram deliberadamente vagos por falta de informação.
4. **Parceiros.** A página diz honestamente que ainda não há parceria pública.
   Preencha `buildParceiros()` quando houver a primeira.
5. **Screenshots dos produtos.** O PRD §6.2 pede capturas de tela ou mockups
   nas páginas de produto. Hoje elas usam uma ficha técnica no lugar.
6. **Double opt-in.** O Brevo tem confirmação por e-mail nativa — ative em
   Contacts → Forms para ficar em conformidade plena com a LGPD.
7. **Turnstile.** O PRD pedia reCAPTCHA. Hoje há honeypot, time trap e rate
   limit. Se aparecer spam de verdade, o Cloudflare Turnstile é o próximo
   passo — cumpre a mesma função sem entregar dados do visitante a uma
   empresa de publicidade.

---

## Gestão de conteúdo

`/dashboard.html`, com login pelo GitHub.

As edições ficam na tela até você clicar em **Publicar no site** — cadastre
vários produtos e publique uma vez só. Depois de publicar, o site leva cerca
de 40 segundos para refletir.

- **No ar** → aparece em Produtos e na home
- **Em desenvolvimento** → aparece no Roadmap, no estágio escolhido
- **Ordem** → número menor primeiro; use múltiplos de 10
