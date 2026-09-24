/* api/_monitor.js — lista dos apps monitorados pela tela Saúde.
 *
 * É um arquivo .js, e não .json, de propósito: a Vercel só empacota na função
 * o que ela consegue enxergar no código. Um JSON lido em tempo de execução
 * corre o risco de não subir junto; um import estático sempre sobe.
 *
 * Para acrescentar um app, copie um bloco e ajuste. Não tem passo nenhum
 * além disso: a tela desenha o que esta lista produzir.
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
 *   token_env   OPCIONAL. Nome da variável de ambiente na Vercel com o token.
 *               Só use se o link for protegido. Sem isso, o painel consulta
 *               o link sem nenhuma credencial.
 *
 * Sobre o formato da resposta: o painel aceita o que o app já devolve. Ele
 * entende status escrito como ok, up, healthy, online, degraded, warning,
 * down, error, unhealthy, e também { "ok": true }. O texto do detalhe pode
 * vir como detail, message, description ou reason. Se a resposta não for
 * JSON, o card mostra apenas que o app está de pé.
 */

export const APPS = [
  {
    id: 'posthink',
    name: 'Posthink',
    domain: 'api.posthink.com.br',
    icon: '✍️',
    health_url: 'https://api.posthink.com.br/health',
    mode: 'json',
    group: 'Produtos no ar',
  },
  {
    id: 'asphalt-hoops',
    name: 'Asphalt Hoops',
    domain: 'asphalt-hoops-production.up.railway.app',
    icon: '🏀',
    health_url: 'https://asphalt-hoops-production.up.railway.app/health',
    mode: 'json',
    group: 'Produtos no ar',
  },
  {
    id: 'genbreed',
    name: 'GenBreed',
    domain: 'genbreedaiapi-production.up.railway.app',
    icon: '🧬',
    health_url: 'https://genbreedaiapi-production.up.railway.app/api/v1/health/summary',
    mode: 'json',
    token_env: 'MONITOR_TOKEN_GENBREED',
    group: 'Produtos no ar',
  },
  {
    id: 'site-htf',
    name: 'Site Hack Tech Farm',
    domain: 'hacktechfarm.com.br',
    icon: '🌐',
    health_url: 'https://hacktechfarm.com.br/',
    mode: 'ping',
    group: 'Infraestrutura',
  },
];
