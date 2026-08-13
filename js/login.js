/* js/login.js — tela de entrada da área restrita. */
(function () {
  'use strict';

  var form = document.getElementById('login-form');
  var msg = document.getElementById('login-msg');
  var button = form.querySelector('button[type="submit"]');

  /* Já autenticado? Vai direto para o destino. */
  if (window.HTFAuth.readSession()) {
    window.location.replace(nextTarget());
  }

  /* Só aceita caminho relativo do próprio site: evita open redirect. */
  function nextTarget() {
    var raw = new URLSearchParams(window.location.search).get('next') || 'dashboard.html';
    return /^\/?[a-z0-9._-]+\.html$/i.test(raw) ? raw.replace(/^\//, '') : 'dashboard.html';
  }

  if (!window.HTFAuth.configured()) {
    msg.textContent = 'Supabase ainda não configurado. Preencha js/config.js com a URL e a anon key do projeto.';
    msg.className = 'form-msg err';
    button.disabled = true;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    msg.textContent = 'Entrando…';
    msg.className = 'form-msg';

    window.HTFAuth.signIn(form.email.value.trim(), form.password.value)
      .then(function () { window.location.replace(nextTarget()); })
      .catch(function (err) {
        msg.textContent = err.message;
        msg.className = 'form-msg err';
        form.password.value = '';
        form.password.focus();
      })
      .finally(function () {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      });
  });
})();
