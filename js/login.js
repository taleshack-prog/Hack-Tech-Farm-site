/* js/login.js — tela de entrada. Todo o trabalho de OAuth acontece no
 * servidor; aqui só mostramos erro e evitamos login redundante.
 */
(function () {
  'use strict';

  var msg = document.getElementById('login-msg');
  var button = document.getElementById('login-btn');

  var erro = new URLSearchParams(window.location.search).get('erro');
  if (erro) {
    msg.textContent = erro;
    msg.className = 'form-msg err';
  }

  fetch('/api/auth/session', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.authenticated) {
        window.location.replace('dashboard.html');
        return;
      }
      if (!data.configured) {
        msg.textContent = 'Servidor sem configuração: faltam ' + (data.missing || []).join(', ') + '.';
        msg.className = 'form-msg err';
        button.setAttribute('aria-disabled', 'true');
        button.removeAttribute('href');
      }
    })
    .catch(function () { /* offline ou rodando estático: o botão segue visível */ });
})();
