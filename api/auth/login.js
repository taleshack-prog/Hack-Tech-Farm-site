/* api/auth/login.js — inicia o fluxo OAuth do GitHub.
 * Gera um "state" aleatório contra CSRF e leva a pessoa ao GitHub.
 */
import crypto from 'node:crypto';
import { config, fail } from '../_lib.js';

export default function handler(req, res) {
  const cfg = config();
  if (!cfg.ok) {
    return fail(res, 500, `Configuração incompleta no servidor: ${cfg.missing.join(', ')}.`);
  }

  const state = crypto.randomBytes(16).toString('hex');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;

  /* O state vai num cookie curto e é conferido no callback: sem isso,
     um terceiro poderia forjar o retorno do OAuth. */
  res.setHeader('Set-Cookie',
    `htf_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);

  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', `${proto}://${host}/api/auth/callback`);
  url.searchParams.set('scope', 'public_repo');   // o mínimo para gravar num repo público
  url.searchParams.set('state', state);

  res.writeHead(302, { Location: url.toString() });
  res.end();
}
