/* api/_deploy.js — último deploy de cada app, lido da Vercel e do Railway.
 *
 * Serve para responder "quebrou depois do quê?" sem sair do painel: ao lado
 * do estado de saúde aparece quando foi o último deploy e qual foi o commit.
 *
 * Os dois tokens são de leitura e ficam na Vercel, em VERCEL_API_TOKEN e
 * RAILWAY_API_TOKEN. Sem eles, o painel simplesmente não mostra a linha de
 * deploy — nada quebra, e a saúde continua igual.
 *
 * Cache de 5 minutos por app, em memória. Deploy é coisa rara; sem o cache,
 * cada leitura do painel viraria uma chamada em cada plataforma.
 */

const TIMEOUT_MS = 3500;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

async function comTempo(url, options) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: control.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- Vercel -------------------------------- */

async function vercel(token, cfg) {
  const params = new URLSearchParams({ app: cfg.project, limit: '3', target: 'production' });
  if (cfg.team) params.set('slug', cfg.team);

  const res = await comTempo(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Vercel ${res.status}`);

  const { deployments = [] } = await res.json();
  const pronto = deployments.find((d) => d.state === 'READY' || d.readyState === 'READY') || deployments[0];
  if (!pronto) return null;

  return {
    when: new Date(pronto.ready || pronto.created || pronto.createdAt).toISOString(),
    message: (pronto.meta?.githubCommitMessage || '').split('\n')[0].slice(0, 90),
    state: pronto.state || pronto.readyState || '',
  };
}

/* ------------------------------- Railway ------------------------------- */
/* A API do Railway é GraphQL. Aqui só se lê: o token nunca sai do servidor. */

const QUERY = `query ultimos($id: String!) {
  project(id: $id) {
    deployments(first: 5) {
      edges { node { status createdAt meta } }
    }
  }
}`;

async function railway(token, cfg) {
  const res = await comTempo('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: QUERY, variables: { id: cfg.projectId } }),
  });
  if (!res.ok) throw new Error(`Railway ${res.status}`);

  const body = await res.json();
  if (body.errors?.length) throw new Error(`Railway: ${body.errors[0].message}`.slice(0, 120));

  const nos = (body.data?.project?.deployments?.edges || []).map((e) => e.node).filter(Boolean);
  const pronto = nos.find((n) => n.status === 'SUCCESS') || nos[0];
  if (!pronto) return null;

  const meta = pronto.meta || {};
  return {
    when: new Date(pronto.createdAt).toISOString(),
    message: String(meta.commitMessage || '').split('\n')[0].slice(0, 90),
    state: pronto.status || '',
  };
}

/* ------------------------------ Entrada -------------------------------- */

export async function ultimoDeploy(app) {
  const cfg = app.deploy;
  if (!cfg) return null;

  const agora = Date.now();
  const guardado = cache.get(app.id);
  if (guardado && agora - guardado.em < CACHE_MS) return guardado.valor;

  /* Um app pode apontar para um token próprio (deploy.token_env). Serve
     quando as contas são separadas — o NeuroArt, por exemplo, vive na conta
     hobby, e um token do time Hack Tech Farm não alcança lá. */
  const padrao = cfg.provider === 'vercel' ? 'VERCEL_API_TOKEN' : 'RAILWAY_API_TOKEN';
  const token = process.env[cfg.token_env || padrao] || process.env[padrao];
  if (!token) return null;   // sem token, a linha de deploy não aparece

  let valor = null;
  try {
    valor = cfg.provider === 'vercel' ? await vercel(token, cfg) : await railway(token, cfg);
  } catch (err) {
    /* Falha aqui não contamina a saúde do app: o card continua mostrando o
       estado real e só fica sem a informação de deploy. */
    console.warn('[HTF/api] deploy de %s: %s', app.id, err.message);
    valor = { error: true };
  }

  cache.set(app.id, { em: agora, valor });
  if (cache.size > 50) cache.clear();
  return valor;
}
