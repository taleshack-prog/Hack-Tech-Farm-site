/* api/contact.js — formulário de contato, entregue por e-mail via Brevo.
 * Nada fica armazenado: a mensagem vai direto para a caixa de entrada.
 */
import {
  config, EMAIL_RE, isSpam, rateLimit, clientIp, brevoSendContact, sendJson, fail,
} from './_lib.js';

const SUBJECTS = ['parceria', 'cliente', 'produto', 'imprensa', 'outro'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Método não permitido.');
  }

  const cfg = config();
  if (!cfg.brevoKey || !cfg.contactFrom) {
    return fail(res, 503, 'O formulário ainda não está configurado. Fale com hacktechfarm@proton.me enquanto isso.');
  }

  const ip = clientIp(req);
  if (!rateLimit(ip, 3, 60000)) {
    return fail(res, 429, 'Muitas mensagens seguidas. Espere um minuto e tente de novo.');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const spam = isSpam(body);
  if (spam) {
    console.warn('[HTF/api] mensagem descartada (%s) de %s', spam, ip);
    return sendJson(res, 200, { ok: true });
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const message = String(body.message || '').trim();
  const subject = SUBJECTS.includes(body.subject) ? body.subject : 'outro';

  if (name.length < 2 || name.length > 120) return fail(res, 400, 'Informe seu nome.');
  if (!EMAIL_RE.test(email) || email.length > 254) return fail(res, 400, 'Digite um e-mail válido.');
  if (message.length < 10) return fail(res, 400, 'Conte um pouco mais sobre o que você precisa.');
  if (message.length > 5000) return fail(res, 400, 'Mensagem longa demais. Resuma em até 5.000 caracteres.');

  try {
    await brevoSendContact(cfg, { name, email, subject, message });
  } catch (err) {
    return fail(res, 502, 'A mensagem não foi enviada. Tente de novo, ou escreva para hacktechfarm@proton.me se persistir.', err);
  }

  return sendJson(res, 200, { ok: true });
}
