/* api/_lib.js — utilitários compartilhados das funções serverless.
 *
 * Nenhum segredo desta camada chega ao navegador. O token do GitHub vive
 * cifrado dentro de um cookie HttpOnly: o JavaScript da página não consegue
 * lê-lo nem em caso de XSS.
 */

import crypto from 'node:crypto';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const COOKIE_NAME = 'htf_session';
const SESSION_HOURS = 8;

/* ========================= Configuração ================================= */

export function config() {
  const missing = [];
  const get = (name, required = true) => {
    const value = process.env[name];
    if (!value && required) missing.push(name);
    return value || '';
  };

  const cfg = {
    clientId: get('GITHUB_CLIENT_ID'),
    clientSecret: get('GITHUB_CLIENT_SECRET'),
    repo: get('GITHUB_REPO'),                    // formato: usuario/repositorio
    branch: process.env.GITHUB_BRANCH || 'main',
    secret: get('AUTH_SECRET'),
    brevoKey: get('BREVO_API_KEY', false),
    brevoListId: process.env.BREVO_LIST_ID || '',
    contactTo: process.env.CONTACT_TO || 'hacktechfarm@proton.me',
    contactFrom: process.env.CONTACT_FROM || '',
    missing,
  };

  /* Faltou variável de ambiente = erro. Nunca liberar acesso por omissão:
     era exatamente esse o defeito da versão anterior. */
  cfg.ok = missing.length === 0;
  return cfg;
}

/* ===================== Sessão (AES-256-GCM em cookie) ==================== */

const keyFrom = (secret) => crypto.createHash('sha256').update(secret).digest();

export function sealSession(payload, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function openSession(sealed, secret) {
  try {
    const [ivB64, tagB64, dataB64] = String(sealed).split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
    const payload = JSON.parse(plain.toString('utf8'));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null; // cookie adulterado, chave errada ou sessão expirada
  }
}

export function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setSessionCookie(res, value) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

export const sessionExpiry = () => Date.now() + SESSION_HOURS * 3600 * 1000;

export function requireSession(req, res, cfg) {
  const session = openSession(readCookie(req, COOKIE_NAME), cfg.secret);
  if (!session) {
    fail(res, 401, 'Sessão expirada. Entre novamente.');
    return null;
  }
  return session;
}

/* ============================== GitHub ================================== */

async function gh(path, token, options = {}) {
  return fetch('https://api.github.com' + path, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hacktechfarm-site',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

/* Quem pode escrever no repositório administra o site. Não existe uma lista
   de usuários paralela para manter atualizada. */
export async function checkRepoAccess(token, repo) {
  const res = await gh(`/repos/${repo}`, token);
  if (!res.ok) return { ok: false, reason: 'Repositório inacessível com esta conta.' };
  const data = await res.json();
  if (!data.permissions?.push) {
    return { ok: false, reason: 'Sua conta do GitHub não tem permissão de escrita neste repositório.' };
  }
  return { ok: true };
}

export async function githubUser(token) {
  const res = await gh('/user', token);
  return res.ok ? res.json() : null;
}

export async function readRepoFile(token, repo, branch, path) {
  const res = await gh(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, token);
  if (!res.ok) throw new Error(`Não foi possível ler ${path} (${res.status}).`);
  const data = await res.json();
  return { sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf8') };
}

/* O sha é o controle de concorrência do GitHub: se outra pessoa gravou entre
   a leitura e a escrita, vem 409 e nada é sobrescrito em silêncio. */
export async function writeRepoFile(token, repo, branch, path, content, sha, message) {
  const res = await gh(`/repos/${repo}/contents/${path}`, token, {
    method: 'PUT',
    body: { message, content: Buffer.from(content, 'utf8').toString('base64'), sha, branch },
  });

  if (res.status === 409) {
    throw new Error('Alguém salvou uma alteração enquanto você editava. Recarregue a página e tente de novo.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`O GitHub recusou a gravação (${res.status}). ${detail.slice(0, 160)}`);
  }
  return res.json();
}

/* ============================= Anti-spam ================================ */

const MIN_ELAPSED_MS = 2500;
const hits = new Map();

export function isSpam(body) {
  if (body.website) return 'honeypot';
  if (typeof body.elapsed === 'number' && body.elapsed < MIN_ELAPSED_MS) return 'muito rápido';
  return null;
}

export function rateLimit(ip, max = 5, windowMs = 60000) {
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count += 1;
  hits.set(ip, entry);
  if (hits.size > 5000) hits.clear();
  return entry.count <= max;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : String(fwd || '')).split(',')[0].trim() || 'desconhecido';
}

/* =============================== Brevo ================================== */

async function brevo(path, apiKey, body) {
  return fetch(`https://api.brevo.com/v3${path}`, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function brevoSubscribe(cfg, email, source) {
  const res = await brevo('/contacts', cfg.brevoKey, {
    email,
    listIds: cfg.brevoListId ? [Number(cfg.brevoListId)] : undefined,
    attributes: { ORIGEM: source || 'site' },
    updateEnabled: true,   // reinscrição atualiza em vez de dar erro
  });

  if (res.ok || res.status === 204) return;   // 204 = contato já existia
  const detail = await res.text().catch(() => '');
  throw new Error(`Brevo ${res.status}: ${detail.slice(0, 200)}`);
}

const SUBJECT_LABEL = {
  parceria: 'Proposta de parceria', cliente: 'Quer contratar',
  produto: 'Dúvida sobre produto', imprensa: 'Imprensa', outro: 'Outro assunto',
};

export async function brevoSendContact(cfg, { name, email, subject, message }) {
  const res = await brevo('/smtp/email', cfg.brevoKey, {
    sender: { name: 'Site Hack Tech Farm', email: cfg.contactFrom },
    to: [{ email: cfg.contactTo }],
    replyTo: { email, name },   // responder no cliente de e-mail vai direto à pessoa
    subject: `[Site] ${SUBJECT_LABEL[subject] || 'Contato'} — ${name}`,
    textContent: `Nome: ${name}\nE-mail: ${email}\nAssunto: ${SUBJECT_LABEL[subject] || subject}\n\n${message}\n`,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status}: ${detail.slice(0, 200)}`);
  }
}

/* ============================== Respostas =============================== */

export function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/* O detalhe técnico fica no log; a pessoa recebe algo acionável. */
export function fail(res, status, message, err) {
  if (err) console.error('[HTF/api]', message, err);
  sendJson(res, status, { error: message });
}
