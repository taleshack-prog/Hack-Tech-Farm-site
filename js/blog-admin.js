/* js/blog-admin.js — aprovação de artigos no dashboard.
 *
 * Diferente dos outros painéis, aqui não há edição em lote: publicar um
 * artigo é um ato individual e deliberado. Cada clique vira um commit no
 * nome de quem aprovou.
 */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var articles = [];
  var apiRef = null;
  var toastRef = null;

  window.HTFBlog = { init: init };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    var list = $('#blog-list');
    var filter = $('#blog-filter').value;
    list.textContent = '';

    var filtered = articles.filter(function (a) {
      return filter === 'all' || a.status === filter;
    });

    if (!filtered.length) {
      var empty = el('div', 'empty-state');
      empty.appendChild(el('p', null, 'Nenhum artigo com esse filtro.'));
      empty.appendChild(el('p', 'dim', 'Os rascunhos enviados pelo Content Engine aparecem aqui.'));
      list.appendChild(empty);
      return;
    }

    filtered.forEach(function (a) {
      var row = el('div', 'row is-' + (a.status === 'published' ? 'published' : 'draft'));
      row.dataset.slug = a.slug;

      row.appendChild(el('h3', null, a.title));

      var meta = el('div', 'meta');
      meta.appendChild(el('span', 'badge badge-' + (a.status === 'published' ? 'published' : 'draft'),
        a.status === 'published' ? 'No ar' : 'Rascunho'));
      if (a.author) meta.appendChild(el('span', 'badge badge-social', a.author));
      if (a.source) meta.appendChild(el('span', 'badge badge-site', a.source));
      meta.appendChild(el('span', 'dim', a.words + ' palavras'));
      if (a.publishedAt) meta.appendChild(el('span', 'dim', a.publishedAt));
      row.appendChild(meta);

      if (a.description) row.appendChild(el('div', 'body', a.description));
      if (a.excerpt) {
        var ex = el('div', 'body dim', a.excerpt + '…');
        ex.style.fontSize = '0.88rem';
        row.appendChild(ex);
      }

      var actions = el('div', 'actions');
      var toggle = el('button', 'btn btn-sm ' + (a.status === 'published' ? 'btn-ghost' : 'btn-success'),
        a.status === 'published' ? 'Tirar do ar' : 'Revisei — publicar');
      toggle.type = 'button';
      toggle.dataset.action = 'toggle';
      actions.appendChild(toggle);

      if (a.status === 'published') {
        var view = el('a', 'btn btn-sm btn-ghost', 'Ver no site');
        view.href = 'blog/' + a.slug + '.html';
        view.target = '_blank';
        view.rel = 'noopener';
        actions.appendChild(view);
      }
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  function load() {
    return apiRef('/api/drafts').then(function (data) {
      articles = data.articles || [];
      var drafts = articles.filter(function (a) { return a.status === 'draft'; }).length;
      $('#blog-pending').textContent = drafts;
      $('#blog-badge').hidden = drafts === 0;
      $('#blog-badge').textContent = drafts + ' aguardando revisão';
      render();
    });
  }

  function init(api, toast) {
    apiRef = api;
    toastRef = toast;

    $('#blog-filter').addEventListener('change', render);

    $('#blog-list').addEventListener('click', function (e) {
      var button = e.target.closest('button[data-action="toggle"]');
      if (!button) return;
      var slug = button.closest('.row').dataset.slug;
      var item = articles.find(function (a) { return a.slug === slug; });
      if (!item) return;

      var next = item.status === 'published' ? 'draft' : 'published';

      /* Fricção deliberada na publicação: quem clica assume a autoria da
         decisão. Tirar do ar não pergunta — desfazer deve ser fácil. */
      if (next === 'published') {
        var ok = window.confirm(
          'Publicar "' + item.title + '"?\n\n'
          + 'Ao confirmar, você declara que leu o texto e que os fatos, números e '
          + 'afirmações em primeira pessoa conferem. O commit fica no seu nome.'
        );
        if (!ok) return;
      }

      button.disabled = true;
      api('/api/drafts', { method: 'PATCH', body: { slug: slug, status: next } })
        .then(function () {
          toast(next === 'published'
            ? 'Publicado. O site atualiza em cerca de 40 segundos.'
            : 'Tirado do ar.');
          return load();
        })
        .catch(function (err) { toast(err.message, true); })
        .finally(function () { button.disabled = false; });
    });

    return load();
  }
})();
