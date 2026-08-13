/* js/site.js — interações do site público.
 * Correções sobre a versão anterior:
 *  - dropdown operável por teclado (era hover-only: falha WCAG 2.1.1)
 *  - menu mobile não fecha mais ao abrir o submenu
 *  - link "Produtos" continua alcançável no mobile
 *  - lightbox usa <dialog>, que já traz foco preso e Escape nativos
 *  - formulários com validação inline, aria-live e honeypot anti-spam
 */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ===================== Navegação ===================================== */

  function initNav() {
    var toggle = $('.menu-toggle');
    var links = $('.nav-links');
    if (!toggle || !links) return;

    function setMenu(open) {
      links.setAttribute('data-open', String(open));
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '✕' : '☰';
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    }
    setMenu(false);

    toggle.addEventListener('click', function () {
      setMenu(links.getAttribute('data-open') !== 'true');
    });

    /* Só fecha o menu em links de navegação de verdade — não no botão do
       submenu, que era o bug: abrir o submenu fechava o menu inteiro. */
    $$('a', links).forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });

    var dropdowns = $$('.dropdown');
    function closeDropdowns(except) {
      dropdowns.forEach(function (dd) {
        var btn = $('.dropdown-toggle', dd);
        if (btn && btn !== except) btn.setAttribute('aria-expanded', 'false');
      });
    }

    dropdowns.forEach(function (dd) {
      var btn = $('.dropdown-toggle', dd);
      var menu = $('.dropdown-menu', dd);
      if (!btn || !menu) return;

      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        closeDropdowns(btn);
        btn.setAttribute('aria-expanded', String(!open));
      });

      /* Abre no hover apenas em ponteiro fino (mouse), como atalho.
         O clique/teclado continua sendo o caminho canônico. */
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        dd.addEventListener('mouseenter', function () {
          closeDropdowns(btn);
          btn.setAttribute('aria-expanded', 'true');
        });
        dd.addEventListener('mouseleave', function () {
          btn.setAttribute('aria-expanded', 'false');
        });
      }

      menu.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
      });
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.dropdown')) closeDropdowns(null);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDropdowns(null);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 980) { setMenu(false); closeDropdowns(null); }
    });
  }

  /* ===================== Formulários =================================== */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var loadedAt = Date.now();

  function setMessage(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = 'form-msg' + (kind ? ' ' + kind : '');
  }

  function setFieldError(input, message) {
    if (!input) return false;
    var holder = input.parentElement.querySelector('.field-error');
    if (holder) holder.textContent = message || '';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  }

  /* Envia ao endpoint; se o back-end não estiver disponível (site rodando
     100% estático), avisa com clareza em vez de fingir sucesso — o código
     anterior mostrava "inscrição registrada" sem gravar nada em lugar nenhum. */
  function postJson(endpoint, payload) {
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.error || 'Não foi possível enviar agora. Tente de novo em instantes.');
        return body;
      });
    });
  }

  function initNewsletter() {
    $$('form[data-form="newsletter"]').forEach(function (form) {
      var input = $('input[type="email"]', form);
      var msg = $('.form-msg', form.parentElement) || $('.form-msg', form);
      var button = $('button[type="submit"]', form);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = (input.value || '').trim();

        if (!EMAIL_RE.test(email)) {
          setFieldError(input, 'Digite um e-mail válido.');
          setMessage(msg, 'Digite um e-mail válido para continuar.', 'err');
          input.focus();
          return;
        }
        setFieldError(input, '');

        button.setAttribute('aria-busy', 'true');
        button.disabled = true;
        setMessage(msg, 'Enviando…', '');

        postJson('/api/subscribe', {
          email: email,
          website: (form.elements.website || {}).value || '',
          elapsed: Date.now() - loadedAt,
          source: window.location.pathname
        }).then(function () {
          setMessage(msg, 'Pronto. Você está na lista — confirme no e-mail que acabamos de enviar.', 'ok');
          form.reset();
        }).catch(function (err) {
          setMessage(msg, err.message, 'err');
        }).finally(function () {
          button.removeAttribute('aria-busy');
          button.disabled = false;
        });
      });
    });
  }

  function initContact() {
    var form = $('form[data-form="contact"]');
    if (!form) return;
    var msg = $('.form-msg', form);
    var button = $('button[type="submit"]', form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      var email = form.elements.email.value.trim();
      var message = form.elements.message.value.trim();

      var ok = true;
      ok = setFieldError(form.elements.name, name.length >= 2 ? '' : 'Informe seu nome.') && ok;
      ok = setFieldError(form.elements.email, EMAIL_RE.test(email) ? '' : 'Digite um e-mail válido.') && ok;
      ok = setFieldError(form.elements.message, message.length >= 10 ? '' : 'Conte um pouco mais — pelo menos 10 caracteres.') && ok;

      if (!ok) {
        setMessage(msg, 'Revise os campos destacados.', 'err');
        (form.querySelector('[aria-invalid="true"]') || form).focus();
        return;
      }

      button.setAttribute('aria-busy', 'true');
      button.disabled = true;
      setMessage(msg, 'Enviando…', '');

      postJson('/api/contact', {
        name: name,
        email: email,
        subject: form.elements.subject.value,
        message: message,
        website: (form.elements.website || {}).value || '',
        elapsed: Date.now() - loadedAt
      }).then(function () {
        setMessage(msg, 'Mensagem enviada. Respondemos em até dois dias úteis.', 'ok');
        form.reset();
      }).catch(function (err) {
        setMessage(msg, err.message, 'err');
      }).finally(function () {
        button.removeAttribute('aria-busy');
        button.disabled = false;
      });
    });

    /* Limpa o erro assim que a pessoa corrige o campo. */
    $$('input, textarea', form).forEach(function (field) {
      field.addEventListener('input', function () {
        if (field.getAttribute('aria-invalid') === 'true') setFieldError(field, '');
      });
    });
  }

  /* ===================== Galeria / lightbox ============================ */

  function initGallery() {
    var buttons = $$('.gallery-btn');
    var dialog = $('#lightbox');
    if (!buttons.length || !dialog || typeof dialog.showModal !== 'function') return;

    var img = $('img', dialog);
    var caption = $('figcaption', dialog);
    var closeBtn = $('.lb-close', dialog);

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var thumb = $('img', btn);
        img.src = btn.dataset.full || thumb.src;
        img.alt = thumb.alt;
        caption.innerHTML = '';
        caption.appendChild(document.createTextNode(btn.dataset.title || thumb.alt || ''));
        if (btn.dataset.meta) {
          var span = document.createElement('span');
          span.textContent = btn.dataset.meta;
          caption.appendChild(span);
        }
        dialog.showModal(); /* foco preso e Escape são nativos do <dialog> */
      });
    });

    closeBtn.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close();
    });
  }

  /* ===================== Ano no rodapé ================================= */

  function initYear() {
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNav();
    initNewsletter();
    initContact();
    initGallery();
    initYear();
  });
})();
