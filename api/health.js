/* api/health.js — painel de saúde central.
 *
 * Lê o /health/summary de cada app listado em data/monitor.json e devolve
 * um resumo único para o dashboard desenhar os cards.
 *
 * Por que a leitura acontece aqui, no servidor, e não no navegador:
 *  - o token de monitoramento de cada app nunca sai daqui;
 *  - o navegador esbarraria em CORS ao chamar domínio de terceiro;
 *  - se o app estiver fora do ar, quem vê o erro é esta função, não a tela.
 *
 * Contrato esperado do app monitorado (HTTP 200):
 *   { "app": "Posthink", "status": "ok" | "degraded" | "down",
 *     "detail": "texto curto", "checked_at": "2026-09-24T18:00:00Z" }
 * Campos que faltarem são preenchidos aqui. Qualquer outra resposta —
 * timeout, 500, 401, JSON inválido — vira "down", que é o comportamento
 * correto: do ponto de vista de quem usa, o app não está respondendo.
 */

import { config, requireSession, sendJson, fail } from './_lib.js';
import { APPS } from './_monitor.js';

const TIMEOUT_MS = 6000;
const STATUSES = ['ok', 'degraded', 'down'];

/* Cada app tem o seu jeito de dizer que está bem. Em vez de exigir que todos
   falem igual, traduzimos aqui os nomes mais comuns. Assim um app que já tem
   health system próprio entra na tela sem ser alterado. */
const SINONIMOS = {
  ok: 'ok', up: 'ok', healthy: 'ok', pass: 'ok', online: 'ok', green: 'ok', true: 'ok',
  degraded: 'degraded', warn: 'degraded', warning: 'degraded', partial: 'degraded', yellow: 'degraded',
  down: 'down', fail: 'down', failed: 'down', error: 'down', unhealthy: 'down', critical: 'down',
  red: 'down', false: 'down',
};

/* Procura o estado em qualquer formato razoável de resposta. */
function lerStatus(body) {
  if (body === true) return 'ok';
  if (typeof body === 'string') return SINONIMOS[body.trim().toLowerCase()] || null;
  if (!body || typeof body !== 'object') return null;

  for (const campo of ['status', 'state', 'health', 'result', 'ok', 'healthy', 'alive']) {
    const valor = body[campo];
    if (valor === undefined || valor === null) continue;
    if (typeof valor === 'boolean') return valor ? 'ok' : 'down';
    const achado = SINONIMOS[String(valor).trim().toLowerCase()];
    if (achado) return achado;
  }
  return null;
}

/* O texto curto que aparece embaixo do estado, venha ele com o nome que vier. */
function lerDetalhe(body) {
  if (!body || typeof body !== 'object') return '';
  for (const campo of ['detail', 'details', 'message', 'msg', 'description', 'reason', 'info']) {
    const valor = body[campo];
    if (typeof valor === 'string' && valor.trim()) return valor.trim().slice(0, 200);
  }
  return resumirItens(body);
}

/* Alguns apps não mandam um texto pronto, e sim a lista do que verificaram
   (checks, services, components). Aqui essa lista vira uma frase: os itens com
   problema aparecem pelo nome, e se estiver tudo bem, só a contagem. */
function resumirItens(body) {
  const lista = [body.checks, body.services, body.components].find(Array.isArray);
  if (!lista || !lista.length) return '';

  const ruins = lista.filter((item) => {
    const estado = lerStatus(item);
    return estado && estado !== 'ok';
  });

  if (!ruins.length) {
    return `${lista.length} ${lista.length === 1 ? 'verificação' : 'verificações'}, tudo no ar.`;
  }
  return ruins
    .map((item) => {
      const nome = typeof item.name === 'string' ? item.name : 'item';
      const texto = lerDetalhe(item);
      return texto ? `${nome}: ${texto}` : nome;
    })
    .join('; ')
    .slice(0, 200);
}

function loadApps() {
  /* A lista vive em api/_monitor.js. MONITOR_APPS na Vercel substitui a lista
     inteira, para testar um app novo sem precisar de deploy. */
  if (process.env.MONITOR_APPS) {
    try {
      const parsed = JSON.parse(process.env.MONITOR_APPS);
      const apps = Array.isArray(parsed) ? parsed : parsed.apps;
      if (Array.isArray(apps)) return apps;
    } catch (err) {
      console.error('[HTF/api] MONITOR_APPS não é um JSON válido — usando a lista do código', err);
    }
  }
  return APPS;
}

/* ================= Saúde do próprio site ===============================
 * O card do site não consulta um endereço: ele olha para dentro, aqui
 * mesmo. Hoje o que pode falhar em silêncio é o Brevo — foi o que derrubou
 * o formulário de contato sem ninguém perceber: bloqueio por IP, chave
 * trocada ou cota do dia estourada. Nenhuma dessas situações aparece no
 * site, só quando alguém tenta falar com a gente e não consegue.
 */

async function checarBrevo(cfg) {
  if (!cfg.brevoKey) {
    return { name: 'brevo', status: 'down', detail: 'BREVO_API_KEY não está configurada.' };
  }

  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 4000);
  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      signal: control.signal,
      headers: { 'api-key': cfg.brevoKey, Accept: 'application/json' },
    });
    const texto = await res.text();

    if (res.status === 401) {
      /* A mensagem do Brevo distingue chave inválida de IP bloqueado, e a
         diferença muda o que você precisa fazer. */
      const ipBloqueado = /IP address/i.test(texto);
      return {
        name: 'brevo',
        status: 'down',
        detail: ipBloqueado
          ? 'Brevo recusou por IP não autorizado — desligue a restrição de IP para chaves API.'
          : 'Brevo recusou a chave (401). Gere outra e atualize BREVO_API_KEY.',
      };
    }
    if (!res.ok) {
      return { name: 'brevo', status: 'degraded', detail: `Brevo respondeu HTTP ${res.status}.` };
    }

    /* Cota do dia: o plano gratuito corta o envio ao zerar. */
    let restantes = null;
    try {
      const conta = JSON.parse(texto);
      const email = (conta.plan || []).find((p) => p.type === 'free' || p.credits != null);
      if (email && typeof email.credits === 'number') restantes = email.credits;
    } catch { /* formato mudou: o que importa é que a chave funciona */ }

    if (restantes === 0) {
      return { name: 'brevo', status: 'degraded', detail: 'Cota de e-mails do dia esgotada.' };
    }
    return {
      name: 'brevo',
      status: 'ok',
      detail: restantes == null ? 'Chave aceita.' : `Chave aceita, ${restantes} e-mails na cota.`,
    };
  } catch (err) {
    const timeout = err && err.name === 'AbortError';
    return {
      name: 'brevo',
      status: 'degraded',
      detail: timeout ? 'Brevo não respondeu em 4s.' : 'Não foi possível falar com o Brevo.',
    };
  } finally {
    clearTimeout(timer);
  }
}

function checarConfig(cfg) {
  if (!cfg.ok) {
    return { name: 'config', status: 'down', detail: `Faltam variáveis: ${cfg.missing.join(', ')}.` };
  }
  if (!cfg.contactFrom) {
    return { name: 'config', status: 'degraded', detail: 'CONTACT_FROM vazio — o formulário de contato não envia.' };
  }
  return { name: 'config', status: 'ok', detail: '' };
}

async function saudeDoSite(base, cfg) {
  const started = Date.now();
  const checks = [checarConfig(cfg), await checarBrevo(cfg)];
  const pior = checks.some((c) => c.status === 'down') ? 'down'
    : checks.some((c) => c.status === 'degraded') ? 'degraded' : 'ok';

  return {
    ...base,
    status: pior,
    latency_ms: Date.now() - started,
    checked_at: new Date().toISOString(),
    detail: pior === 'ok'
      ? `${checks.length} verificações, tudo no ar.`
      : checks.filter((c) => c.status !== 'ok').map((c) => `${c.name}: ${c.detail}`).join('; ').slice(0, 200),
    checks,
  };
}

async function probe(app, cfg) {
  const base = {
    id: app.id,
    name: app.name || app.id,
    domain: app.domain || '',
    icon: app.icon || '📦',
    group: app.group || 'Apps',
  };

  /* modo "self": o site olha para os próprios serviços, sem sair na rede. */
  if (app.mode === 'self') return saudeDoSite(base, cfg);

  const token = app.token_env ? process.env[app.token_env] : '';
  /* modo "ping": não interpreta a resposta, só confere se o app atendeu.
     Serve para app sem endpoint de saúde e para página de saúde em HTML. */
  const ping = app.mode === 'ping';

  if (!app.health_url) {
    return { ...base, status: 'unknown', detail: 'Sem endpoint de saúde configurado.' };
  }
  if (app.token_env && !token) {
    return { ...base, status: 'unknown', detail: `Falta a variável ${app.token_env} na Vercel.` };
  }

  const started = Date.now();
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(app.health_url, {
      signal: control.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'htf-monitor',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const latency = Date.now() - started;

    if (res.status === 401 || res.status === 403) {
      return {
        ...base, status: 'unknown', latency_ms: latency,
        detail: token ? 'Token recusado pelo app.' : 'O app pediu autenticação e não há token configurado.',
      };
    }
    if (!res.ok) {
      return { ...base, status: 'down', latency_ms: latency, detail: `Respondeu HTTP ${res.status}.` };
    }

    const agora = new Date().toISOString();
    if (ping) {
      return { ...base, status: 'ok', latency_ms: latency, detail: 'Respondeu HTTP 200.', checked_at: agora };
    }

    const texto = await res.text();
    let body = null;
    try {
      body = JSON.parse(texto);
    } catch {
      /* Não é JSON. Pode ser uma página de status em HTML: atendeu, está de pé. */
      return {
        ...base, status: 'ok', latency_ms: latency, checked_at: agora,
        detail: 'Respondeu, mas não em JSON — só dá para saber que está de pé.',
      };
    }

    const status = lerStatus(body);
    return {
      ...base,
      name: typeof body?.app === 'string' && body.app ? body.app : base.name,
      status: STATUSES.includes(status) ? status : 'ok',
      latency_ms: latency,
      detail: lerDetalhe(body),
      checked_at: typeof body?.checked_at === 'string' ? body.checked_at : agora,
    };
  } catch (err) {
    const latency = Date.now() - started;
    const timedOut = err && err.name === 'AbortError';
    return {
      ...base,
      status: 'down',
      latency_ms: latency,
      detail: timedOut ? `Não respondeu em ${TIMEOUT_MS / 1000}s.` : 'Não foi possível alcançar o app.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Método não permitido.');

  const cfg = config();
  if (!cfg.ok) return fail(res, 500, `Configuração incompleta: ${cfg.missing.join(', ')}.`);
  if (!requireSession(req, res, cfg)) return;   // a tela é da área restrita

  let apps;
  try {
    apps = loadApps();
  } catch (err) {
    return fail(res, 500, 'Não foi possível ler a lista de apps monitorados.', err);
  }

  /* Em paralelo: um app lento não atrasa os outros. */
  const results = await Promise.all(apps.map((app) => probe(app, cfg)));
  const count = (s) => results.filter((r) => r.status === s).length;

  res.setHeader('Cache-Control', 'no-store');
  sendJson(res, 200, {
    checked_at: new Date().toISOString(),
    summary: { ok: count('ok'), degraded: count('degraded'), down: count('down'), unknown: count('unknown') },
    apps: results,
  });
}
