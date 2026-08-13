/* api/auth/callback.js — o GitHub devolve aqui depois do login.
 * Troca o code por token, confere permissão de escrita e abre a sessão.
 */
import {
  config, readCookie, checkRepoAccess, githubUser,
  sealSession, setSessionCookie, sessionExpiry,
} from '../_lib.js';

function deny(res, reason) {
  res.writeHead(302, { Location: '/login.html?erro=' + encodeURIComponent(reason) });
  res.end();
}

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg.ok) return deny(res, `Configuração incompleta: ${cfg.missing.join(', ')}`);

  const { code, state } = req.query || {};
  const expected = readCookie(req, 'htf_oauth_state');

  if (!code || !state || state !== expected) {
    return deny(res, 'Pedido de login inválido ou expirado. Tente de novo.');
  }
  res.setHeader('Set-Cookie', 'htf_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');

  let token;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
      }),
    });
    const data = await tokenRes.json();
    token = data.access_token;
    if (!token) throw new Error(data.error_description || 'sem access_token');
  } catch (err) {
    console.error('[HTF/api] troca de code falhou', err);
    return deny(res, 'O GitHub recusou o login. Tente novamente.');
  }

  const access = await checkRepoAccess(token, cfg.repo);
  if (!access.ok) return deny(res, access.reason);

  const user = await githubUser(token);
  if (!user) return deny(res, 'Não foi possível ler seu perfil do GitHub.');

  setSessionCookie(res, sealSession({
    token,
    login: user.login,
    name: user.name || user.login,
    avatar: user.avatar_url,
    exp: sessionExpiry(),
  }, cfg.secret));

  res.writeHead(302, { Location: '/dashboard.html' });
  res.end();
}
