/* api/_monitor.js — catálogo do ecossistema Hack Tech Farm.
 *
 * Este arquivo é a fonte única da tela "Saúde dos apps": o que existe, onde
 * roda, como se verifica e para onde ir. Acrescentar um produto novo é
 * acrescentar um bloco aqui — nada mais precisa mudar.
 *
 * É um .js, e não um .json, de propósito: a Vercel só empacota na função o
 * que ela enxerga no código. Um JSON lido em tempo de execução corre o risco
 * de não subir junto; um import estático sempre sobe.
 *
 * Campos:
 *   id          identificador curto, só para uso interno
 *   name        nome que aparece no card
 *   domain      texto pequeno embaixo do nome
 *   icon        um emoji
 *   group       título da faixa onde o card aparece
 *   health_url  o link que o painel consulta
 *   mode        'json' (padrão) lê o estado da resposta
 *               'ping'          só confere se o app atendeu
 *               'self'          o próprio site: checa Brevo e configuração
 *                               aqui dentro, sem sair na rede
 *   token_env   OPCIONAL. Nome da variável de ambiente na Vercel com o token.
 *               Só use se o link for protegido.
 *   links       OPCIONAL. Atalhos que aparecem no rodapé do card. Cada um é
 *               { label, url }. Convenção: Abrir, Admin, Código, Hospedagem.
 *               É o que faz do painel a porta de entrada do ecossistema, no
 *               lugar de uma pasta de favoritos no navegador.
 *
 * Sobre o formato da resposta: o painel aceita o que o app já devolve. Ele
 * entende status escrito como ok, up, healthy, online, degraded, warning,
 * down, error, unhealthy, e também { "ok": true }. O texto do detalhe pode
 * vir como detail, message, description ou reason, e uma lista de checks ou
 * services vira resumo automático. Se a resposta não for JSON, o card mostra
 * apenas que o app está de pé.
 */

const GH = 'https://github.com/taleshack-prog';
const RW = 'https://railway.com/project';

export const APPS = [
  {
    id: 'posthink',
    name: 'Posthink',
    domain: 'posthink.com.br',
    icon: '✍️',
    health_url: 'https://api.posthink.com.br/health/summary',
    mode: 'json',
    token_env: 'MONITOR_TOKEN_POSTHINK',
    group: 'Produtos no ar',
    links: [
      { label: 'Abrir', url: 'https://posthink.com.br/' },
      { label: 'Código', url: `${GH}/Linkedin-App` },
      { label: 'Railway', url: `${RW}/6492418d-ddee-4e6b-abbd-9ddb912e39d5` },
    ],
  },
  {
    id: 'asphalt-hoops',
    name: 'Asphalt Hoops',
    domain: 'asphalt-hoops-production.up.railway.app',
    icon: '🏀',
    health_url: 'https://asphalt-hoops-production.up.railway.app/api/health/summary',
    mode: 'json',
    token_env: 'MONITOR_TOKEN_ASPHALT',
    group: 'Produtos no ar',
    links: [
      { label: 'Abrir', url: 'https://asphalt-hoops-pwa.vercel.app/' },
      { label: 'Admin', url: 'https://asphalt-hoops-production.up.railway.app/asphalt-dashboard' },
      { label: 'Código (app)', url: `${GH}/AsphaltHoops-PWA` },
      { label: 'Código (API)', url: `${GH}/Asphalt-Hoops` },
      { label: 'Railway', url: `${RW}/be9c9fd4-9a65-43dc-8136-491d2f33ad5c` },
    ],
  },
  {
    id: 'genbreed',
    name: 'GenBreed',
    domain: 'genbreed.com.br',
    icon: '🧬',
    health_url: 'https://genbreedaiapi-production.up.railway.app/api/v1/health/summary',
    mode: 'json',
    token_env: 'MONITOR_TOKEN_GENBREED',
    group: 'Produtos no ar',
    links: [
      { label: 'Abrir', url: 'https://genbreed.com.br/' },
      { label: 'Código', url: `${GH}/GenBreedAI` },
      { label: 'Railway', url: `${RW}/5abc1e69-a5f5-424f-9209-54fd47d99f04` },
    ],
  },
  {
    id: 'neuroart',
    name: 'NeuroArt DApp',
    domain: 'neuro-art-d-app.vercel.app',
    icon: '🎨',
    health_url: 'https://neuro-art-d-app.vercel.app/api/health',
    mode: 'json',
    group: 'Produtos no ar',
    links: [
      { label: 'Abrir', url: 'https://neuro-art-d-app.vercel.app/' },
      { label: 'Código', url: `${GH}/NeuroArt-DApp` },
      { label: 'Vercel', url: 'https://vercel.com/tales-hacks-projects/neuro-art-d-app' },
    ],
  },

  {
    id: 'arthack',
    name: 'ArtHack',
    domain: 'taleshack.com.br',
    icon: '🖼️',
    health_url: 'https://www.taleshack.com.br/',
    mode: 'ping',
    group: 'Sites e conteúdo',
    links: [
      { label: 'Abrir', url: 'https://www.taleshack.com.br/' },
      { label: 'Código (site)', url: `${GH}/ArtHack` },
      { label: 'Código (CMS)', url: `${GH}/arthack-cms` },
      { label: 'Railway', url: `${RW}/a6a83d83-0e86-4bdc-8722-012feba66005` },
    ],
  },
  {
    id: 'seohack',
    name: 'SEOHack',
    domain: 'seo-hack-silk.vercel.app',
    icon: '📰',
    health_url: 'https://seo-hack-silk.vercel.app/api/health',
    mode: 'json',
    group: 'Sites e conteúdo',
    links: [
      { label: 'Abrir', url: 'https://seo-hack-silk.vercel.app/' },
      { label: 'Blog publicado', url: 'https://hacktechfarm.com.br/blog/' },
      { label: 'Código', url: `${GH}/SEOHack` },
      { label: 'Vercel', url: 'https://vercel.com/hack-tech-farm/seo-hack' },
    ],
  },

  {
    id: 'site-htf',
    name: 'Site Hack Tech Farm',
    domain: 'hacktechfarm.com.br',
    icon: '🌐',
    health_url: 'https://hacktechfarm.com.br/',
    mode: 'self',
    group: 'Infraestrutura',
    links: [
      { label: 'Abrir', url: 'https://hacktechfarm.com.br/' },
      { label: 'Código', url: `${GH}/Hack-Tech-Farm-site` },
      { label: 'Vercel', url: 'https://vercel.com/hack-tech-farm/hack-tech-farm-site' },
      { label: 'E-mail (Brevo)', url: 'https://app.brevo.com/' },
    ],
  },
];
