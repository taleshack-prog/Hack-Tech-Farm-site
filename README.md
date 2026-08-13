# Hack Tech Farm — site institucional e hub de produtos

Site multi-página + área restrita de gestão de conteúdo, conforme o PRD de
13/08/2026.

**Stack:** HTML/CSS/JS estático · Vercel (hospedagem + funções serverless) ·
Supabase (Postgres + Auth).

---

## Por que esta arquitetura

O PRD pedia Vercel ou AWS (§8) e colocava "backend próprio" fora de escopo
(§3.2). O rascunho de código anterior fugia disso: era um servidor Express
com Postgres no Railway. Aqui o site é **100% estático**, com duas funções
serverless só para os formulários — nada que o PRD tenha excluído.

O catálogo de produtos é lido do Postgres, mas com uma diferença importante:
as páginas saem do build **já com os produtos dentro do HTML**. O JavaScript
apenas atualiza se o banco divergir do build. Isso mantém o SEO (§8) e faz o
site continuar funcionando mesmo com o banco fora do ar.

```
                   ┌─────────────────────────────┐
   visitante  ───► │ Vercel (estático + edge)    │
                   │  HTML pré-renderizado       │
                   └────────┬────────────────────┘
                            │ leitura (anon key + RLS)
                            ▼
                   ┌─────────────────────────────┐
   admin ─login──► │ Supabase Postgres + Auth    │
                   │  products · updates         │
                   └─────────────────────────────┘
                            ▲
                            │ service_role (nunca no navegador)
                   ┌────────┴────────────────────┐
   formulários ──► │ /api/subscribe /api/contact │
                   └─────────────────────────────┘
```

---

## Estrutura

```
hacktechfarm/
├── index.html sobre.html produtos.html …   ← gerados por tools/build.py
├── login.html dashboard.html               ← área restrita (noindex)
├── css/styles.css                          ← design system
├── css/dashboard.css                       ← só a área restrita
├── js/
│   ├── config.js      configuração pública (preencher com o Supabase)
│   ├── data.js        leitura do catálogo, com fallback em seed.json
│   ├── catalog.js     renderização de produtos e roadmap
│   ├── site.js        navegação, formulários, galeria
│   ├── auth.js        sessão via Supabase Auth
│   ├── login.js       tela de entrada
│   └── dashboard.js   CRUD da área restrita
├── data/seed.json                          ← fallback do catálogo
├── api/                                    ← funções serverless da Vercel
├── supabase/schema.sql                     ← tabelas, RLS e carga inicial
├── img/                                    ← favicon, capa OG, galeria
├── tools/                                  ← build, assets, verificação
└── vercel.json                             ← CSP, HSTS e cache
```

---

## Rodar localmente

```bash
npm run dev            # http://localhost:4000
```

Sem configurar nada, o site já funciona: o catálogo vem do `data/seed.json`.
Os formulários vão falhar com mensagem clara, porque `/api/*` só existe na
Vercel — use `vercel dev` se precisar testá-los.

Depois de editar `tools/build.py` ou `data/seed.json`:

```bash
npm run build          # regenera o HTML
npm run check          # sintaxe de todo o JS
python3 tools/verify.py   # links, CSP, contraste, acessibilidade
```

---

## Deploy

### 1. Supabase

1. Crie o projeto em [supabase.com](https://supabase.com).
2. SQL Editor → cole `supabase/schema.sql` → Run. Isso cria as tabelas, o RLS
   e a carga inicial dos dez produtos.
3. Authentication → Users → **Add user** para cada pessoa que vai administrar.
4. Libere o acesso de escrita rodando, para cada uma:

   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'tales@hacktechfarm.com';
   ```

   Só quem está em `public.admins` escreve. Ter conta não basta.
5. Settings → API → copie a **Project URL** e a **anon key** para `js/config.js`.

### 2. Vercel

1. Suba o repositório no GitHub.
2. vercel.com → **Add New → Project** → selecione o repo. Framework: **Other**.
   Não há build step: o HTML já está commitado.
3. Settings → Environment Variables:

   | Variável | Valor |
   |---|---|
   | `SUPABASE_URL` | Project URL do Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
   | `TURNSTILE_SECRET` | opcional (Cloudflare Turnstile) |

4. Deploy. O `vercel.json` já aplica CSP, HSTS e as demais políticas do PRD §8.
5. Aponte o domínio `hacktechfarm.com` em Settings → Domains.

---

## Segurança — o que mudou e por quê

| Ponto | Rascunho anterior | Agora |
|---|---|---|
| Falta de variável de ambiente | `if (!ADMIN_PASSWORD) return next()` — a API inteira abria | Sem `SUPABASE_URL`/service key a função retorna erro; o RLS nega por padrão |
| Senha | uma senha compartilhada, em texto puro no `.env` | conta por pessoa, hash gerido pelo Supabase Auth |
| Token | HMAC com segredo aleatório a cada boot — invalidava sessões e quebrava com mais de uma instância | JWT do Supabase, com expiração e refresh |
| Links vindos do banco | `escapeAttr` só trocava aspas: `javascript:alert(1)` passava | validação de protocolo no front **e** `CHECK` no Postgres |
| Handlers | `onclick="del(${id})"` dentro de string HTML | delegação de evento; CSP `script-src 'self'` bloqueia inline |
| Cabeçalhos | nenhum | CSP, HSTS, `nosniff`, `frame-ancestors 'none'`, Referrer-Policy |

A sessão fica em `sessionStorage`, o que a expõe caso haja XSS. A CSP restrita
e a ausência total de `innerHTML` com dado de usuário são o que sustenta essa
escolha; se a área restrita crescer, migre para cookie `HttpOnly` via uma
função em `/api`.

---

## Acessibilidade (PRD §5)

Alvo: WCAG 2.1 AA. `tools/verify.py` roda as checagens automatizáveis a cada
build — contraste calculado par a par, `alt` em toda imagem, `lang`, um `<h1>`
por página.

Corrigido em relação ao rascunho: o dropdown era `:hover` puro, impossível de
abrir por teclado; não havia estilo de foco visível; o lightbox não prendia o
foco; `scroll-behavior: smooth` ignorava `prefers-reduced-motion`; as bordas de
campo tinham 1.3:1 contra os 3:1 exigidos pelo critério 1.4.11.

**Falta fazer manualmente:** teste com leitor de tela (NVDA ou VoiceOver) e
navegação completa por teclado nas nove páginas.

---

## Pendências antes do lançamento

1. **Imagens da galeria.** `img/obras/*.jpg` são placeholders gerados por
   código. Substitua pelas fotos reais das obras, mantendo o par
   `<slug>.jpg` + `<slug>-thumb.jpg`, e reescreva os títulos e as fichas
   técnicas em `tools/build.py` → `build_galeria()`.
2. **URL do NeuroArt.** O DApp não tem endereço público no material recebido.
   A página está no ar com o CTA desativado; assim que houver domínio,
   cadastre em Produtos no dashboard.
3. **Descrições do roadmap.** Verdant, HackFinance Pro, FinanMap Cripto,
   Second Soul, TPC e RadarPrevi estão com teaser provisório (marcados com
   `_needs_review` no `seed.json`). Second Soul e TPC ficaram deliberadamente
   vagos porque não havia informação — confirme antes de publicar.
4. **Parceiros.** A página está honesta: diz que ainda não há parceria pública.
   Preencha `build_parceiros()` quando houver a primeira.
5. **Screenshots dos produtos.** O PRD §6.2 pede capturas de tela ou mockups
   nas páginas de produto. Hoje elas usam uma ficha técnica no lugar.
6. **Confirmação de e-mail da newsletter.** A tabela `subscribers` já tem
   `confirmed` e `confirm_token`; falta a função que dispara o e-mail de
   double opt-in.
7. **Turnstile.** O PRD pedia reCAPTCHA. Está preparado para Cloudflare
   Turnstile — mesma função, sem enviar dados do visitante para uma empresa de
   publicidade, o que é melhor para a LGPD. Basta definir `TURNSTILE_SECRET`
   e adicionar o widget nos formulários.

---

## Gestão de conteúdo

`/dashboard.html` (exige login). A tabela `products` é a fonte única de
verdade:

- **No ar** → aparece em Produtos e na home
- **Em desenvolvimento** → aparece no Roadmap, no estágio escolhido
- **Ordem** → número menor primeiro; use múltiplos de 10

Alterações refletem no site na hora, sem novo deploy. O `seed.json` continua
sendo o retrato do catálogo para quem clona o repositório — vale atualizá-lo
de vez em quando com um `select` da tabela.
