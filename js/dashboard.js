/* js/dashboard.js — gestão do catálogo.
 *
 * Modelo de edição: as alterações ficam em memória e só vão para o GitHub
 * quando você clica em "Publicar". Isso resolve o incômodo dos ~40 segundos
 * de rebuild — cadastre cinco produtos, publique uma vez, espere uma vez.
 */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var products = [];
  var sha = null;
  var dirty = false;
  var editingId = null;

  var STAGE_LABEL = { alpha: 'Alpha', beta: 'Beta', planning: 'Planejamento' };

  /* ------------------------------ UI ---------------------------------- */

  var toastTimer;
  function toast(message, isError) {
    var el = $('#toast');
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(isError));
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 4200);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;   // textContent, nunca innerHTML
    return node;
  }

  function safeUrl(value) {
    if (!value) return '';
    try {
      var u = new URL(String(value).trim());
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
    } catch (err) { return ''; }
  }

  function setDirty(value) {
    dirty = value;
    $('#publish').disabled = !value;
    $('#dirty-flag').hidden = !value;
  }

  function showPanel(name) {
    $$('.dash-nav button').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.panel === name));
    });
    $$('.dash-panel').forEach(function (p) { p.hidden = p.id !== 'panel-' + name; });
  }

  /* ------------------------------ API --------------------------------- */

  function api(path, options) {
    options = options || {};
    return fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      if (res.status === 401) {
        window.location.replace('login.html');
        throw new Error('Sessão expirada.');
      }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Erro no servidor (' + res.status + ').');
        return data;
      });
    });
  }

  /* --------------------------- Renderização --------------------------- */

  function renderStats() {
    $('#stat-live').textContent = products.filter(function (p) { return p.status === 'live'; }).length;
    $('#stat-dev').textContent = products.filter(function (p) { return p.status === 'dev'; }).length;
    $('#stat-total').textContent = products.length;
  }

  function renderList() {
    var list = $('#products-list');
    var filter = $('#filter-status').value;
    list.textContent = '';

    var filtered = products
      .filter(function (p) { return filter === 'all' || p.status === filter; })
      .sort(function (a, b) { return a.sort_order - b.sort_order; });

    if (!filtered.length) {
      var empty = el('div', 'empty-state');
      empty.appendChild(el('p', null, 'Nenhum produto com esse filtro.'));
      empty.appendChild(el('p', 'dim', 'Cadastre o primeiro em "Novo produto".'));
      list.appendChild(empty);
      return;
    }

    filtered.forEach(function (p) {
      var row = el('div', 'row is-' + (p.status === 'live' ? 'published' : 'draft'));
      row.dataset.id = p.id;

      row.appendChild(el('h3', null, (p.icon ? p.icon + '  ' : '') + p.name));

      var meta = el('div', 'meta');
      meta.appendChild(el('span', 'badge badge-' + p.status,
        p.status === 'live' ? 'No ar' : 'Em desenvolvimento'));
      if (p.stage) meta.appendChild(el('span', 'badge badge-site', STAGE_LABEL[p.stage] || p.stage));
      if (p.category) meta.appendChild(el('span', 'badge badge-social', p.category));
      if (p.is_public === false) meta.appendChild(el('span', 'badge badge-draft', 'Oculto do site'));
      meta.appendChild(el('span', 'dim', 'ordem ' + p.sort_order));
      row.appendChild(meta);

      if (p.tagline) row.appendChild(el('div', 'body', p.tagline));

      var url = safeUrl(p.url);
      if (url) {
        var a = el('a', null, url);
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
        a.style.color = 'var(--emerald)';
        var wrap = el('p');
        wrap.style.marginBottom = '12px';
        wrap.appendChild(a);
        row.appendChild(wrap);
      }

      var actions = el('div', 'actions');
      var edit = el('button', 'btn btn-sm btn-ghost', 'Editar');
      edit.type = 'button';
      edit.dataset.action = 'edit';
      var del = el('button', 'btn btn-sm btn-danger', 'Excluir');
      del.type = 'button';
      del.dataset.action = 'delete';
      actions.append(edit, del);
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  /* Delegação: o id vem do dataset, nunca de HTML montado com dado externo. */
  $('#products-list').addEventListener('click', function (e) {
    var button = e.target.closest('button[data-action]');
    if (!button) return;
    var id = Number(button.closest('.row').dataset.id);
    var item = products.find(function (p) { return p.id === id; });
    if (!item) return;

    if (button.dataset.action === 'edit') {
      editingId = id;
      var f = $('#product-form');
      ['slug', 'name', 'tagline', 'description', 'url', 'page_url', 'icon',
       'category', 'status', 'sort_order'].forEach(function (field) {
        f[field].value = item[field] == null ? '' : item[field];
      });
      f.stage.value = item.stage || '';
      f.is_public.value = item.is_public === false ? 'false' : 'true';
      syncStageField();
      $('#product-submit').textContent = 'Atualizar produto';
      $('#product-cancel').hidden = false;
      showPanel('create');
      f.name.focus();
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm('Remover "' + item.name + '" do catálogo?')) return;
      products = products.filter(function (p) { return p.id !== id; });
      setDirty(true);
      renderList();
      renderStats();
      toast('Removido da lista. Clique em Publicar para valer no site.');
    }
  });

  /* ---------------------------- Formulário ---------------------------- */

  function syncStageField() {
    var isDev = $('#product-form').status.value === 'dev';
    $('#stage-group').hidden = !isDev;
    if (!isDev) $('#product-form').stage.value = '';
  }
  $('#product-form').status.addEventListener('change', syncStageField);

  /* Slug automático a partir do nome, sem acento — o servidor exige [a-z0-9-]. */
  $('#product-form').name.addEventListener('blur', function (e) {
    var slugField = $('#product-form').slug;
    if (slugField.value.trim() || !e.target.value.trim()) return;
    slugField.value = e.target.value
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  });

  function resetForm() {
    editingId = null;
    $('#product-form').reset();
    $('#product-submit').textContent = 'Adicionar produto';
    $('#product-cancel').hidden = true;
    syncStageField();
  }
  $('#product-cancel').addEventListener('click', resetForm);

  $('#product-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var status = f.status.value;
    var stage = f.stage.value || null;

    if (status === 'dev' && !stage) {
      return toast('Produto em desenvolvimento precisa de um estágio.', true);
    }
    if (f.url.value.trim() && !safeUrl(f.url.value)) {
      return toast('O link de acesso precisa começar com https://.', true);
    }

    var slug = f.slug.value.trim().toLowerCase();
    if (products.some(function (p) { return p.slug === slug && p.id !== editingId; })) {
      return toast('Já existe um produto com o identificador "' + slug + '".', true);
    }

    var product = {
      id: editingId || Date.now(),
      slug: slug,
      name: f.name.value.trim(),
      tagline: f.tagline.value.trim() || null,
      description: f.description.value.trim() || null,
      url: safeUrl(f.url.value) || null,
      page_url: f.page_url.value.trim() || null,
      icon: f.icon.value.trim() || '📦',
      category: f.category.value,
      status: status,
      stage: status === 'live' ? null : stage,
      sort_order: Number(f.sort_order.value) || 100,
      is_public: f.is_public.value !== 'false',
    };

    if (editingId) {
      products = products.map(function (p) { return p.id === editingId ? product : p; });
      toast('Alterado na lista. Clique em Publicar para valer no site.');
    } else {
      products.push(product);
      toast('Adicionado à lista. Clique em Publicar para valer no site.');
    }

    setDirty(true);
    resetForm();
    renderList();
    renderStats();
    showPanel('list');
  });

  /* ---------------------------- Publicação ---------------------------- */

  $('#publish').addEventListener('click', function () {
    var button = $('#publish');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Publicando…';

    api('/api/products', {
      method: 'PUT',
      body: { products: products, sha: sha, message: 'atualização pelo dashboard' },
    }).then(function (data) {
      sha = data.sha;
      products = data.products;
      setDirty(false);
      renderList();
      renderStats();
      toast('Publicado. O site fica atualizado em cerca de 40 segundos.');
    }).catch(function (err) {
      toast(err.message, true);
      setDirty(true);
    }).finally(function () {
      button.removeAttribute('aria-busy');
      button.textContent = 'Publicar no site';
    });
  });

  /* Evita perder edições ao fechar a aba sem publicar. */
  function anyDirty() {
    return dirty || (window.HTFGallery && window.HTFGallery.isDirty());
  }

  window.addEventListener('beforeunload', function (e) {
    if (!anyDirty()) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ------------------------- Inicialização ---------------------------- */

  $$('.dash-nav button').forEach(function (b) {
    b.addEventListener('click', function () { showPanel(b.dataset.panel); });
  });
  $('#filter-status').addEventListener('change', renderList);

  $('#sign-out').addEventListener('click', function () {
    if (anyDirty() && !window.confirm('Há alterações não publicadas. Sair mesmo assim?')) return;
    dirty = false;
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .finally(function () { window.location.replace('login.html'); });
  });

  fetch('/api/auth/session', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (session) {
      if (!session.authenticated) {
        window.location.replace('login.html');
        return null;
      }
      $('#admin-user').textContent = session.login;
      $('#admin-repo').textContent = session.repo;
      return api('/api/products');
    })
    .then(function (data) {
      if (!data) return;
      products = data.products;
      sha = data.sha;
      setDirty(false);
      renderList();
      renderStats();
      showPanel('overview');
      if (window.HTFGallery) window.HTFGallery.init(api, toast).catch(function (err) { toast(err.message, true); });
    })
    .catch(function (err) { toast(err.message, true); });
})();
