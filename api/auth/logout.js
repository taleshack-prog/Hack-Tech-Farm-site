/* api/auth/logout.js — encerra a sessão local. */
import { clearSessionCookie, sendJson } from '../_lib.js';

export default function handler(req, res) {
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}
