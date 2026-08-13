/* js/auth.js — autenticação da área restrita via Supabase Auth.
 *
 * O rascunho anterior tinha três problemas sérios aqui:
 *   1. o middleware chamava next() quando ADMIN_PASSWORD não estava definida,
 *      ou seja, faltar uma variável de ambiente abria a API inteira;
 *   2. senha única compartilhada, sem hash e sem identificar quem editou;
 *   3. `return` no topo de um <script>, que é SyntaxError e derrubava a página.
 *
 * Aqui quem valida credencial é o Supabase Auth: senha com hash, uma conta por
 * pessoa, sessão que expira e RLS decidindo o que cada um pode escrever.
 */
(function () {
  'use strict';

  var cfg = window.HTF_CONFIG || {};
  var KEY = 'htf.session';

  function base() { return String(cfg.supabaseUrl || '').replace(/\/$/, ''); }
  function configured() { return Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey); }

  function readSession() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s.access_token || !s.expires_at || Date.now() >= s.expires_at) return null;
      return s;
    } catch (err) { return null; }
  }

  function writeSession(data) {
    var session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      email: (data.user && data.user.email) || '',
      /* 30s de margem para não expirar no meio de uma requisição */
      expires_at: Date.now() + (Number(data.expires_in || 3600) - 30) * 1000
    };
    sessionStorage.setItem(KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() { sessionStorage.removeItem(KEY); }

  function signIn(email, password) {
    if (!configured()) {
      return Promise.reject(new Error('Supabase não configurado. Preencha js/config.js antes de entrar.'));
    }
    return fetch(base() + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(res.status === 400
            ? 'E-mail ou senha incorretos.'
            : (data.error_description || data.msg || 'Não foi possível entrar agora.'));
        }
        return writeSession(data);
      });
    });
  }

  function signOut() {
    var session = readSession();
    clearSession();
    if (session && configured()) {
      fetch(base() + '/auth/v1/logout', {
        method: 'POST',
        headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + session.access_token }
      }).catch(function () { /* sessão local já foi embora de qualquer forma */ });
    }
  }

  /* Requer sessão válida. Sem ela, manda para o login e interrompe o fluxo
     devolvendo null — o chamador testa o retorno em vez de usar `return`
     solto no topo do script. */
  function requireSession() {
    var session = readSession();
    if (!session) {
      window.location.replace('login.html?next=' + encodeURIComponent(window.location.pathname));
      return null;
    }
    return session;
  }

  /* Wrapper do PostgREST. O RLS é quem autoriza; isto só carrega o token. */
  function rest(path, options) {
    options = options || {};
    var session = readSession();
    if (!session) {
      window.location.replace('login.html');
      return Promise.reject(new Error('Sessão expirada.'));
    }

    var headers = {
      apikey: cfg.supabaseAnonKey,
      Authorization: 'Bearer ' + session.access_token,
      'Content-Type': 'application/json'
    };
    if (options.prefer) headers.Prefer = options.prefer;

    return fetch(base() + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        clearSession();
        window.location.replace('login.html');
        throw new Error('Sessão expirada. Entre novamente.');
      }
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.message || body.hint || 'O servidor recusou a operação (' + res.status + ').');
        });
      }
      if (res.status === 204) return null;
      return res.json().catch(function () { return null; });
    });
  }

  window.HTFAuth = {
    configured: configured,
    signIn: signIn,
    signOut: signOut,
    readSession: readSession,
    requireSession: requireSession,
    rest: rest
  };
})();
