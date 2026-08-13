/* api/subscribe.js — inscrição na newsletter.
 * POST { email, website?, elapsed?, turnstileToken?, source? }
 */
const {
  EMAIL_RE, isSpam, verifyTurnstile, rateLimit, clientIp,
  supabaseInsert, sendJson, fail
} = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Método não permitido.');
  }

  const ip = clientIp(req);
  if (!rateLimit(ip, 5, 60000)) {
    return fail(res, 429, 'Muitas tentativas seguidas. Espere um minuto e tente de novo.');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  /* Bot detectado: responde 200 sem gravar. Devolver erro só ensinaria o
     script a contornar a armadilha. */
  const spam = isSpam(body);
  if (spam) {
    console.warn('[HTF/api] inscrição descartada (%s) de %s', spam, ip);
    return sendJson(res, 200, { ok: true });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return fail(res, 400, 'Digite um e-mail válido.');
  }

  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return fail(res, 400, 'Não conseguimos confirmar que você não é um robô. Recarregue a página.');
  }

  try {
    await supabaseInsert('subscribers', {
      email,
      source: String(body.source || '').slice(0, 120)
    }, { onConflict: 'email' });   // reinscrever não gera erro nem duplica
  } catch (err) {
    return fail(res, 502, 'A inscrição não foi salva. Tente de novo em instantes.', err);
  }

  return sendJson(res, 200, { ok: true });
};
