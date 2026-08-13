-- =============================================================================
-- Hack Tech Farm — schema Postgres (Supabase)
-- Execute no SQL Editor do Supabase. É idempotente: pode rodar de novo.
--
-- Correção importante em relação ao rascunho anterior: a coluna se chamava
-- `desc`, que é PALAVRA RESERVADA em SQL (usada em ORDER BY ... DESC). O
-- CREATE TABLE falhava com erro de sintaxe antes de criar qualquer coisa.
-- Aqui ela virou `description`.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";  -- e-mail case-insensitive em subscribers

-- -----------------------------------------------------------------------------
-- Allowlist de administradores.
-- Ser autenticado não basta: é preciso estar nesta tabela. Assim, se alguém
-- conseguir criar conta pelo Supabase Auth, ainda não escreve nada.
-- -----------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Produtos — fonte única de verdade do catálogo e do roadmap.
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  tagline     text,
  description text,                                   -- era `desc`: reservada
  url         text,                                   -- destino externo do app
  page_url    text,                                   -- página interna, se houver
  icon        text default '📦',
  category    text,                                   -- Web3 | IA | PWA | Arte | SaaS
  status      text not null default 'dev',
  stage       text,                                   -- alpha | beta | planning
  sort_order  integer not null default 0,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint products_status_chk check (status in ('live', 'dev')),
  constraint products_stage_chk  check (stage is null or stage in ('alpha', 'beta', 'planning')),
  -- Um produto em desenvolvimento precisa dizer em que estágio está.
  constraint products_dev_needs_stage_chk check (status <> 'dev' or stage is not null),
  -- Bloqueia javascript:/data: já no banco, não só no front.
  constraint products_url_chk check (url is null or url = '' or url ~* '^https?://'),
  constraint products_slug_chk check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index if not exists products_status_idx on public.products (status, sort_order);

-- -----------------------------------------------------------------------------
-- Atualizações (posts de rede social e avisos do site).
-- -----------------------------------------------------------------------------
create table if not exists public.updates (
  id         bigint generated always as identity primary key,
  title      text not null,
  kind       text not null default 'social',          -- social | site
  platform   text not null default 'site',            -- linkedin | instagram | site
  body       text not null,
  image_url  text,
  link_url   text,
  status     text not null default 'draft',           -- draft | published
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint updates_kind_chk     check (kind in ('social', 'site')),
  constraint updates_platform_chk check (platform in ('linkedin', 'instagram', 'site')),
  constraint updates_status_chk   check (status in ('draft', 'published')),
  constraint updates_image_chk    check (image_url is null or image_url = '' or image_url ~* '^https?://'),
  constraint updates_link_chk     check (link_url  is null or link_url  = '' or link_url  ~* '^https?://')
);

create index if not exists updates_status_idx on public.updates (status, created_at desc);

-- -----------------------------------------------------------------------------
-- Newsletter e mensagens de contato.
-- Gravadas apenas pela service_role (funções em /api). Nunca pelo anon.
-- -----------------------------------------------------------------------------
create table if not exists public.subscribers (
  id            bigint generated always as identity primary key,
  email         citext not null unique,
  source        text,
  confirmed     boolean not null default false,
  confirm_token uuid not null default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  unsubscribed_at timestamptz
);

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  name       text not null,
  email      text not null,
  subject    text not null default 'outro',
  body       text not null,
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists updates_touch on public.updates;
create trigger updates_touch before update on public.updates
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Row Level Security
-- Sem isto a anon key seria, de fato, uma senha de administrador.
-- =============================================================================
alter table public.products    enable row level security;
alter table public.updates     enable row level security;
alter table public.subscribers enable row level security;
alter table public.messages    enable row level security;
alter table public.admins      enable row level security;

-- Produtos: leitura pública do que está marcado como público.
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated
  using (is_public = true);

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Atualizações: o público só vê o que foi publicado.
drop policy if exists updates_public_read on public.updates;
create policy updates_public_read on public.updates
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists updates_admin_all on public.updates;
create policy updates_admin_all on public.updates
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Inscritos e mensagens: nenhuma policy para anon = nenhum acesso.
drop policy if exists subscribers_admin_read on public.subscribers;
create policy subscribers_admin_read on public.subscribers
  for select to authenticated using (public.is_admin());

drop policy if exists messages_admin_read on public.messages;
create policy messages_admin_read on public.messages
  for select to authenticated using (public.is_admin());

drop policy if exists messages_admin_update on public.messages;
create policy messages_admin_update on public.messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins
  for select to authenticated using (user_id = auth.uid());

-- =============================================================================
-- Carga inicial do catálogo (espelha data/seed.json)
-- =============================================================================
insert into public.products
  (slug, name, tagline, description, url, page_url, icon, category, status, stage, sort_order)
values
  ('posthink', 'Posthink',
   'A IA escreve, você continua sendo o autor.',
   'O Posthink pesquisa o tema, escreve no seu tom e publica no LinkedIn pela API oficial, no horário que você marcar. Nada vai ao ar sem a sua aprovação.',
   'https://posthink.com.br', 'posthink.html', '✍️', 'IA', 'live', null, 10),

  ('neuroart', 'NeuroArt DApp',
   'Arte de artistas neurodivergentes, tokenizada e com procedência verificável.',
   'Plataforma descentralizada que tokeniza e vende obras de artistas neurodivergentes e simpatizantes. Parte de cada venda financia pesquisa não medicamentosa em neurodivergência.',
   null, 'neuroart.html', '🎨', 'Web3', 'live', null, 20),

  ('asphalt-hoops', 'Asphalt Hoops',
   'Marque um rachão de basquete nas praças de Porto Alegre.',
   'PWA leve para criar e entrar em rachões nas quadras públicas da cidade.',
   'https://asphalt-hoops-pwa.vercel.app', 'asphalt.html', '🏀', 'PWA', 'live', null, 30),

  ('arthack', 'ArtHack',
   'O ateliê digital de Tales Hack.',
   'A galeria do artista plástico por trás da HTF.',
   'https://www.taleshack.com.br', 'galeria.html', '🖼️', 'Arte', 'live', null, 40),

  ('verdant', 'Verdant',
   'Impacto ambiental medido com dados, não com promessas.',
   'Em desenvolvimento. Ferramentas para acompanhar e comprovar indicadores ambientais de forma auditável.',
   null, null, '🌱', 'SaaS', 'dev', 'alpha', 50),

  ('hackfinance-pro', 'HackFinance Pro',
   'Gestão financeira para quem toca o próprio negócio.',
   'Em desenvolvimento. Controle de fluxo de caixa e projeções sem precisar virar contador.',
   null, null, '📈', 'SaaS', 'dev', 'alpha', 60),

  ('finanmap-cripto', 'FinanMap Cripto',
   'Seus criptoativos, espalhados por várias carteiras, num mapa só.',
   'Em beta. Consolidação de posições em cripto a partir de múltiplas carteiras e exchanges.',
   null, null, '🗺️', 'Web3', 'dev', 'beta', 70),

  ('second-soul', 'Second Soul',
   'Em beta fechado.',
   'Em beta fechado com um grupo pequeno de testadores. Abrimos os detalhes quando o produto estiver de pé.',
   null, null, '🌀', 'SaaS', 'dev', 'beta', 80),

  ('tpc', 'TPC',
   'Em definição.',
   'Ainda no papel. O nome fica; o escopo sai no próximo ciclo de planejamento.',
   null, null, '📐', 'SaaS', 'dev', 'planning', 90),

  ('radarprevi', 'RadarPrevi',
   'Mudanças nas regras de previdência, antes que elas te peguem de surpresa.',
   'Em planejamento. Acompanhamento de alterações regulatórias em previdência.',
   null, null, '📡', 'SaaS', 'dev', 'planning', 100)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Para liberar um administrador, crie o usuário em Authentication → Users e:
--   insert into public.admins (user_id, email)
--   select id, email from auth.users where email = 'tales@hacktechfarm.com';
-- -----------------------------------------------------------------------------
