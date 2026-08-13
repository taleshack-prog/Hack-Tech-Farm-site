/* api/subscribe.js — inscrição na newsletter via Brevo.
 * POST { email, website?, elapsed?, source? }
 */
import {
  config, EMAIL_RE, isSpam, rateLimit, clientIp, brevoSubscribe, sendJson, fail,
} from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Método não permitido.');
  }

  const cfg = config();
  if (!cfg.brevoKey) {
    return fail(res, 503, 'A newsletter ainda não está configurada. Escreva para hacktechfarm@proton.me.');
  }

  const ip = clientIp(req);
  if (!rateLimit(ip, 5, 60000)) {
    return fail(res, 429, 'Muitas tentativas seguidas. Espere um minuto e tente de novo.');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  /* Bot detectado: responde 200 sem gravar. Devolver erro só ensinaria
     o script a contornar a armadilha. */
  const spam = isSpam(body);
  if (spam) {
    console.warn('[HTF/api] inscrição descartada (%s) de %s', spam, ip);
    return sendJson(res, 200, { ok: true });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return fail(res, 400, 'Digite um e-mail válido.');
  }

  try {
    await brevoSubscribe(cfg, email, String(body.source || '').slice(0, 120));
  } catch (err) {
    return fail(res, 502, 'A inscrição não foi salva. Tente de novo em instantes.', err);
  }

  return sendJson(res, 200, { ok: true });
}
