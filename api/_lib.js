/* api/_lib.js — utilitários compartilhados das funções serverless (Vercel).
 *
 * Regra que vale para todo este diretório: a SUPABASE_SERVICE_ROLE_KEY ignora
 * o RLS. Ela só pode existir aqui, nunca no front-end.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* --- Anti-spam ------------------------------------------------------------
 * Três camadas baratas antes de recorrer ao Turnstile:
 *   1. honeypot: campo escondido que só um bot preenche
 *   2. time trap: envio em menos de 2,5s não é digitação humana
 *   3. rate limit por IP
 * O PRD pedia reCAPTCHA; usamos Cloudflare Turnstile, que cumpre a mesma
 * função sem enviar dados a um terceiro de publicidade — melhor para LGPD.
 * Se TURNSTILE_SECRET não estiver definida, a verificação é pulada.
 */

const MIN_ELAPSED_MS = 2500;

function isSpam(body) {
  if (body.website) return 'honeypot';
  if (typeof body.elapsed === 'number' && body.elapsed < MIN_ELAPSED_MS) return 'muito rápido';
  return null;
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // não configurado: as outras camadas seguem valendo
  if (!token) return false;

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token, remoteip: ip || '' })
  });
  const data = await res.json().catch(() => ({ success: false }));
  return data.success === true;
}

/* --- Rate limit em memória -----------------------------------------------
 * Vale por instância da função. Segura rajada de um mesmo IP; não é proteção
 * distribuída. Para isso, use Vercel Firewall ou Upstash Redis.
 */
const hits = new Map();

function rateLimit(ip, max = 5, windowMs = 60000) {
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count += 1;
  hits.set(ip, entry);
  if (hits.size > 5000) hits.clear(); // evita crescer sem limite
  return entry.count <= max;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : String(fwd || '')).split(',')[0].trim() || 'desconhecido';
}

/* --- Supabase (service_role) --------------------------------------------- */

async function supabaseInsert(table, row, { onConflict } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas');

  const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}${qs}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: onConflict ? 'resolution=ignore-duplicates,return=minimal' : 'return=minimal'
    },
    body: JSON.stringify(row)
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${detail.slice(0, 200)}`);
  }
}

/* --- Handler ------------------------------------------------------------- */

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/* Erros internos nunca vazam para o cliente: o log fica no servidor e a
 * pessoa recebe uma mensagem acionável. */
function fail(res, status, message, err) {
  if (err) console.error('[HTF/api]', message, err);
  sendJson(res, status, { error: message });
}

module.exports = {
  EMAIL_RE, isSpam, verifyTurnstile, rateLimit, clientIp,
  supabaseInsert, sendJson, fail
};
