/* js/dashboard.js — gestão de produtos e atualizações.
 *
 * Diferenças relevantes em relação ao rascunho anterior:
 *  - nada de onclick="fn(${id})" em string de HTML: os handlers são ligados
 *    por delegação de evento, então não há como um dado do banco virar código;
 *  - todo texto entra pelo DOM (textContent), não por innerHTML;
 *  - links passam por validação de protocolo, o que bloqueia javascript:;
 *  - "editar" faz UPDATE de verdade — antes o registro era apagado e recriado,
 *    e qualquer falha no meio do caminho perdia o conteúdo.
 */
(function () {
  'use strict';

  var session = window.HTFAuth.requireSession();
  if (!session) return; // dentro de IIFE, `return` aqui é válido

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var updates = [];
  var products = [];
  var editingUpdateId = null;
  var editingProductId = null;

  var LABEL = {
    kind: { social: 'Rede social', site: 'Site' },
    platform: { linkedin: 'LinkedIn', instagram: 'Instagram', site: 'Site HTF' },
    status: { published: 'Publicada', draft: 'Rascunho' },
    stage: { alpha: 'Alpha', beta: 'Beta', planning: 'Planejamento' }
  };

  /* ---------------- infraestrutura de UI ---------------- */

  var toastTimer;
  function toast(message, isError) {
    var el = $('#toast');
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(isError));
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3600);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function safeUrl(value) {
    if (!value) return '';
    try {
      var u = new URL(String(value).trim());
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
    } catch (err) { return ''; }
  }

  function showPanel(name) {
    $$('.dash-nav button').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.panel === name));
    });
    $$('.dash-panel').forEach(function (p) { p.hidden = p.id !== 'panel-' + name; });
  }

  /* ---------------- carregamento ---------------- */

  function loadAll() {
    return Promise.all([
      window.HTFAuth.rest('updates?select=*&order=created_at.desc'),
      window.HTFAuth.rest('products?select=*&order=sort_order.asc')
    ]).then(function (results) {
      updates = results[0] || [];
      products = results[1] || [];
      renderUpdates();
      renderProducts();
      renderStats();
    }).catch(function (err) { toast(err.message, true); });
  }

  function renderStats() {
    $('#stat-updates').textContent = updates.length;
    $('#stat-published').textContent = updates.filter(function (u) { return u.status === 'published'; }).length;
    $('#stat-products').textContent = products.length;
  }

  /* ---------------- atualizações ---------------- */

  function renderUpdates() {
    var list = $('#updates-list');
    var kind = $('#filter-kind').value;
    var status = $('#filter-status').value;
    list.textContent = '';

    var filtered = updates.filter(function (u) {
      return (kind === 'all' || u.kind === kind) && (status === 'all' || u.status === status);
    });

    if (!filtered.length) {
      var empty = el('div', 'empty-state');
      empty.appendChild(el('p', null, 'Nenhuma atualização com esses filtros.'));
      empty.appendChild(el('p', 'dim', 'Crie uma em "Nova atualização" ou troque os filtros.'));
      list.appendChild(empty);
      return;
    }

    filtered.forEach(function (u) {
      var row = el('div', 'row is-' + u.status);
      row.dataset.id = u.id;

      row.appendChild(el('h3', null, u.title));

      var meta = el('div', 'meta');
      meta.appendChild(el('span', 'badge badge-' + u.kind, LABEL.kind[u.kind] || u.kind));
      meta.appendChild(el('span', 'badge badge-' + u.platform, LABEL.platform[u.platform] || u.platform));
      meta.appendChild(el('span', 'badge badge-' + u.status, LABEL.status[u.status] || u.status));
      meta.appendChild(el('span', 'dim', new Date(u.created_at).toLocaleDateString('pt-BR')));
      row.appendChild(meta);

      var img = safeUrl(u.image_url);
      if (img) {
        var thumb = el('img', 'thumb');
        thumb.src = img;
        thumb.alt = '';
        thumb.loading = 'lazy';
        thumb.addEventListener('error', function () { thumb.remove(); });
        row.appendChild(thumb);
      }

      row.appendChild(el('div', 'body', u.body));

      var link = safeUrl(u.link_url);
      if (link) {
        var a = el('a', null, link);
        a.href = link; a.target = '_blank'; a.rel = 'noopener';
        a.style.color = 'var(--emerald)';
        var wrap = el('p'); wrap.style.marginBottom = '12px';
        wrap.appendChild(a);
        row.appendChild(wrap);
      }

      var actions = el('div', 'actions');
      var toggle = el('button', 'btn btn-sm ' + (u.status === 'published' ? 'btn-ghost' : 'btn-success'),
        u.status === 'published' ? 'Voltar para rascunho' : 'Publicar');
      toggle.type = 'button'; toggle.dataset.action = 'toggle';

      var edit = el('button', 'btn btn-sm btn-ghost', 'Editar');
      edit.type = 'button'; edit.dataset.action = 'edit';

      var del = el('button', 'btn btn-sm btn-danger', 'Excluir');
      del.type = 'button'; del.dataset.action = 'delete';

      actions.append(toggle, edit, del);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  /* Delegação: um listener só, e o id vem do dataset — nunca de string HTML. */
  $('#updates-list').addEventListener('click', function (e) {
    var button = e.target.closest('button[data-action]');
    if (!button) return;
    var id = Number(button.closest('.row').dataset.id);
    var item = updates.find(function (u) { return u.id === id; });
    if (!item) return;

    if (button.dataset.action === 'toggle') {
      var next = item.status === 'published' ? 'draft' : 'published';
      window.HTFAuth.rest('updates?id=eq.' + id, {
        method: 'PATCH',
        body: { status: next, published_at: next === 'published' ? new Date().toISOString() : null }
      }).then(loadAll)
        .then(function () { toast(next === 'published' ? 'Publicada.' : 'Voltou para rascunho.'); })
        .catch(function (err) { toast(err.message, true); });
    }

    if (button.dataset.action === 'edit') {
      editingUpdateId = item.id;
      var f = $('#update-form');
      f.title_.value = item.title;
      f.kind.value = item.kind;
      f.platform.value = item.platform;
      f.body_.value = item.body;
      f.image_url.value = item.image_url || '';
      f.link_url.value = item.link_url || '';
      f.status.value = item.status;
      $('#update-submit').textContent = 'Salvar alterações';
      $('#update-cancel').hidden = false;
      showPanel('create');
      f.title_.focus();
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm('Excluir "' + item.title + '"? Não dá para desfazer.')) return;
      window.HTFAuth.rest('updates?id=eq.' + id, { method: 'DELETE' })
        .then(loadAll).then(function () { toast('Atualização excluída.'); })
        .catch(function (err) { toast(err.message, true); });
    }
  });

  function resetUpdateForm() {
    editingUpdateId = null;
    $('#update-form').reset();
    $('#update-submit').textContent = 'Salvar atualização';
    $('#update-cancel').hidden = true;
    syncPlatformField();
  }

  $('#update-cancel').addEventListener('click', resetUpdateForm);

  function syncPlatformField() {
    var isSocial = $('#update-form').kind.value === 'social';
    $('#platform-group').hidden = !isSocial;
    if (!isSocial) $('#update-form').platform.value = 'site';
  }
  $('#update-form').kind.addEventListener('change', syncPlatformField);

  $('#update-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var payload = {
      title: f.title_.value.trim(),
      kind: f.kind.value,
      platform: f.platform.value,
      body: f.body_.value.trim(),
      image_url: safeUrl(f.image_url.value) || null,
      link_url: safeUrl(f.link_url.value) || null,
      status: f.status.value
    };

    if (f.image_url.value.trim() && !payload.image_url) {
      return toast('A URL da imagem precisa começar com http:// ou https://.', true);
    }
    if (f.link_url.value.trim() && !payload.link_url) {
      return toast('O link precisa começar com http:// ou https://.', true);
    }
    if (payload.status === 'published') payload.published_at = new Date().toISOString();

    var request = editingUpdateId
      ? window.HTFAuth.rest('updates?id=eq.' + editingUpdateId, { method: 'PATCH', body: payload })
      : window.HTFAuth.rest('updates', { method: 'POST', body: payload, prefer: 'return=minimal' });

    request.then(function () {
      toast(editingUpdateId ? 'Alterações salvas.' : 'Atualização salva.');
      resetUpdateForm();
      return loadAll();
    }).catch(function (err) { toast(err.message, true); });
  });

  /* ---------------- produtos ---------------- */

  function renderProducts() {
    var list = $('#products-list');
    list.textContent = '';

    if (!products.length) {
      var empty = el('div', 'empty-state');
      empty.appendChild(el('p', null, 'Nenhum produto cadastrado.'));
      empty.appendChild(el('p', 'dim', 'O primeiro que você cadastrar já aparece no site.'));
      list.appendChild(empty);
      return;
    }

    products.forEach(function (p) {
      var row = el('div', 'row is-' + (p.status === 'live' ? 'published' : 'draft'));
      row.dataset.id = p.id;

      row.appendChild(el('h3', null, p.name));

      var meta = el('div', 'meta');
      meta.appendChild(el('span', 'badge badge-' + p.status, p.status === 'live' ? 'No ar' : 'Em desenvolvimento'));
      if (p.stage) meta.appendChild(el('span', 'badge badge-site', LABEL.stage[p.stage] || p.stage));
      if (p.category) meta.appendChild(el('span', 'badge badge-social', p.category));
      meta.appendChild(el('span', 'dim', 'ordem ' + p.sort_order));
      row.appendChild(meta);

      if (p.description) row.appendChild(el('div', 'body', p.description));

      var url = safeUrl(p.url);
      if (url) {
        var a = el('a', null, url);
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
        a.style.color = 'var(--emerald)';
        var wrap = el('p'); wrap.style.marginBottom = '12px';
        wrap.appendChild(a);
        row.appendChild(wrap);
      }

      var actions = el('div', 'actions');
      var edit = el('button', 'btn btn-sm btn-ghost', 'Editar');
      edit.type = 'button'; edit.dataset.action = 'edit';
      var del = el('button', 'btn btn-sm btn-danger', 'Excluir');
      del.type = 'button'; del.dataset.action = 'delete';
      actions.append(edit, del);
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  $('#products-list').addEventListener('click', function (e) {
    var button = e.target.closest('button[data-action]');
    if (!button) return;
    var id = Number(button.closest('.row').dataset.id);
    var item = products.find(function (p) { return p.id === id; });
    if (!item) return;

    if (button.dataset.action === 'edit') {
      editingProductId = item.id;
      var f = $('#product-form');
      f.slug.value = item.slug;
      f.name.value = item.name;
      f.tagline.value = item.tagline || '';
      f.description.value = item.description || '';
      f.url.value = item.url || '';
      f.page_url.value = item.page_url || '';
      f.icon.value = item.icon || '';
      f.category.value = item.category || 'SaaS';
      f.status.value = item.status;
      f.stage.value = item.stage || '';
      f.sort_order.value = item.sort_order;
      $('#product-submit').textContent = 'Salvar alterações';
      $('#product-cancel').hidden = false;
      f.name.focus();
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm('Excluir "' + item.name + '"? Ele sai do site imediatamente.')) return;
      window.HTFAuth.rest('products?id=eq.' + id, { method: 'DELETE' })
        .then(loadAll).then(function () { toast('Produto excluído.'); })
        .catch(function (err) { toast(err.message, true); });
    }
  });

  function resetProductForm() {
    editingProductId = null;
    $('#product-form').reset();
    $('#product-submit').textContent = 'Cadastrar produto';
    $('#product-cancel').hidden = true;
  }
  $('#product-cancel').addEventListener('click', resetProductForm);

  /* Gera o slug a partir do nome, sem acento — o banco exige [a-z0-9-]. */
  $('#product-form').name.addEventListener('blur', function (e) {
    var slugField = $('#product-form').slug;
    if (slugField.value.trim() || !e.target.value.trim()) return;
    slugField.value = e.target.value
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  });

  $('#product-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var status = f.status.value;
    var stage = f.stage.value || null;

    if (status === 'dev' && !stage) {
      return toast('Produto em desenvolvimento precisa de um estágio (alpha, beta ou planejamento).', true);
    }
    if (f.url.value.trim() && !safeUrl(f.url.value)) {
      return toast('O link de acesso precisa começar com http:// ou https://.', true);
    }

    var payload = {
      slug: f.slug.value.trim(),
      name: f.name.value.trim(),
      tagline: f.tagline.value.trim() || null,
      description: f.description.value.trim() || null,
      url: safeUrl(f.url.value) || null,
      page_url: f.page_url.value.trim() || null,
      icon: f.icon.value.trim() || '📦',
      category: f.category.value,
      status: status,
      stage: status === 'live' ? null : stage,
      sort_order: Number(f.sort_order.value) || 0
    };

    var request = editingProductId
      ? window.HTFAuth.rest('products?id=eq.' + editingProductId, { method: 'PATCH', body: payload })
      : window.HTFAuth.rest('products', { method: 'POST', body: payload, prefer: 'return=minimal' });

    request.then(function () {
      toast(editingProductId ? 'Produto atualizado. Já está no ar.' : 'Produto cadastrado. Já está no ar.');
      resetProductForm();
      return loadAll();
    }).catch(function (err) {
      toast(/duplicate key/i.test(err.message) ? 'Já existe um produto com esse identificador.' : err.message, true);
    });
  });

  /* ---------------- inicialização ---------------- */

  $$('.dash-nav button').forEach(function (b) {
    b.addEventListener('click', function () { showPanel(b.dataset.panel); });
  });
  $('#filter-kind').addEventListener('change', renderUpdates);
  $('#filter-status').addEventListener('change', renderUpdates);
  $('#sign-out').addEventListener('click', function () {
    window.HTFAuth.signOut();
    window.location.replace('login.html');
  });

  $('#admin-email').textContent = session.email;
  syncPlatformField();
  showPanel('overview');
  loadAll();
})();
