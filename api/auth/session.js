/* api/auth/session.js — quem está logado.
 * Devolve apenas dados de exibição. O token nunca sai daqui.
 */
import { config, readCookie, openSession, sendJson, COOKIE_NAME } from '../_lib.js';

export default function handler(req, res) {
  const cfg = config();
  res.setHeader('Cache-Control', 'no-store');

  if (!cfg.ok) {
    return sendJson(res, 200, { authenticated: false, configured: false, missing: cfg.missing });
  }

  const session = openSession(readCookie(req, COOKIE_NAME), cfg.secret);
  if (!session) return sendJson(res, 200, { authenticated: false, configured: true });

  return sendJson(res, 200, {
    authenticated: true,
    configured: true,
    login: session.login,
    name: session.name,
    avatar: session.avatar,
    repo: cfg.repo,
  });
}
