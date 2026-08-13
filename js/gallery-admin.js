/* js/gallery-admin.js — painel da galeria no dashboard.
 *
 * A imagem é redimensionada AQUI, no navegador, antes de subir. Uma foto de
 * celular tem 8 MB; o limite de corpo das funções da Vercel é ~4,5 MB. Enviar
 * o original falharia e ainda gastaria a banda de quem está publicando.
 * Reduzimos para 1400px (grande) e 600x600 (miniatura), o que derruba para
 * algumas centenas de KB sem perda visível na tela.
 */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };

  var MAX_FULL = 1400;
  var THUMB = 600;

  var obras = [];
  var uploads = {};      // slug -> { full, thumb, preview }
  var removals = [];
  var dirty = false;
  var editingSlug = null;

  window.HTFGallery = { init: init, isDirty: function () { return dirty; } };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function slugify(text) {
    return String(text || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function setDirty(value) {
    dirty = value;
    $('#gallery-publish').disabled = !value;
    $('#gallery-dirty').hidden = !value;
  }

  /* --- Redimensionamento -------------------------------------------------
     createImageBitmap com imageOrientation 'from-image' respeita o EXIF, o
     que impede foto de celular aparecer deitada. */
  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' });
    }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Não foi possível ler a imagem.')); };
      img.src = URL.createObjectURL(file);
    });
  }

  function toJpeg(bitmap, maxSide, square) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');

    if (square) {
      canvas.width = canvas.height = maxSide;
      /* Recorte central: a miniatura é quadrada na grade do site. */
      var side = Math.min(bitmap.width, bitmap.height);
      var sx = (bitmap.width - side) / 2;
      var sy = (bitmap.height - side) / 2;
      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, maxSide, maxSide);
    } else {
      var scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }

    return canvas.toDataURL('image/jpeg', 0.84).split(',')[1];
  }

  function processFile(file) {
    if (!/^image\//.test(file.type)) {
      return Promise.reject(new Error('Escolha um arquivo de imagem.'));
    }
    return loadBitmap(file).then(function (bitmap) {
      return {
        full: toJpeg(bitmap, MAX_FULL, false),
        thumb: toJpeg(bitmap, THUMB, true),
      };
    });
  }

  /* --- Renderização ---------------------------------------------------- */

  function render() {
    var list = $('#gallery-list');
    list.textContent = '';

    if (!obras.length) {
      var empty = el('div', 'empty-state');
      empty.appendChild(el('p', null, 'Nenhuma obra na galeria.'));
      empty.appendChild(el('p', 'dim', 'Adicione a primeira no formulário acima.'));
      list.appendChild(empty);
      return;
    }

    obras.slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (o) {
      var row = el('div', 'row is-published');
      row.dataset.slug = o.slug;

      var img = el('img', 'thumb');
      img.alt = '';
      img.loading = 'lazy';
      img.src = uploads[o.slug] ? uploads[o.slug].preview : 'img/obras/' + o.slug + '-thumb.jpg';
      img.addEventListener('error', function () { img.style.display = 'none'; });
      row.appendChild(img);

      row.appendChild(el('h3', null, o.title));

      var meta = el('div', 'meta');
      if (o.meta) meta.appendChild(el('span', 'badge badge-site', o.meta));
      if (uploads[o.slug]) meta.appendChild(el('span', 'badge badge-published', 'Imagem nova'));
      if (o.placeholder && !uploads[o.slug]) {
        meta.appendChild(el('span', 'badge badge-draft', 'Placeholder — trocar'));
      }
      meta.appendChild(el('span', 'dim', 'ordem ' + o.order));
      row.appendChild(meta);

      var actions = el('div', 'actions');
      var edit = el('button', 'btn btn-sm btn-ghost', 'Editar');
      edit.type = 'button'; edit.dataset.action = 'edit';
      var del = el('button', 'btn btn-sm btn-danger', 'Remover');
      del.type = 'button'; del.dataset.action = 'delete';
      actions.append(edit, del);
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  /* --- Ações ------------------------------------------------------------ */

  function bindList(toast) {
    $('#gallery-list').addEventListener('click', function (e) {
      var button = e.target.closest('button[data-action]');
      if (!button) return;
      var slug = button.closest('.row').dataset.slug;
      var obra = obras.find(function (o) { return o.slug === slug; });
      if (!obra) return;

      if (button.dataset.action === 'edit') {
        editingSlug = slug;
        var f = $('#gallery-form');
        f.title_.value = obra.title;
        f.meta.value = obra.meta || '';
        f.order.value = obra.order;
        $('#gallery-submit').textContent = 'Atualizar obra';
        $('#gallery-cancel').hidden = false;
        $('#gallery-file-hint').textContent = 'Deixe em branco para manter a imagem atual.';
        f.title_.focus();
      }

      if (button.dataset.action === 'delete') {
        if (!window.confirm('Remover "' + obra.title + '" da galeria?')) return;
        obras = obras.filter(function (o) { return o.slug !== slug; });
        delete uploads[slug];
        if (removals.indexOf(slug) === -1) removals.push(slug);
        setDirty(true);
        render();
        toast('Removida da lista. Clique em Publicar galeria para valer no site.');
      }
    });
  }

  function resetForm() {
    editingSlug = null;
    $('#gallery-form').reset();
    $('#gallery-submit').textContent = 'Adicionar obra';
    $('#gallery-cancel').hidden = true;
    $('#gallery-file-hint').textContent = 'JPG ou PNG. A imagem é reduzida automaticamente antes de subir.';
  }

  /* --- Inicialização ---------------------------------------------------- */

  function init(api, toast) {
    bindList(toast);
    $('#gallery-cancel').addEventListener('click', resetForm);

    $('#gallery-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var title = f.title_.value.trim();
      var file = f.image.files[0];

      if (!title) return toast('Dê um título para a obra.', true);
      if (!editingSlug && !file) return toast('Escolha a imagem da obra.', true);

      var slug = editingSlug || slugify(title);
      if (!slug) return toast('O título precisa ter ao menos uma letra ou número.', true);
      if (!editingSlug && obras.some(function (o) { return o.slug === slug; })) {
        return toast('Já existe uma obra com esse título. Mude o título ou edite a existente.', true);
      }

      var submit = $('#gallery-submit');
      submit.disabled = true;
      submit.textContent = 'Processando imagem…';

      var work = file ? processFile(file) : Promise.resolve(null);

      work.then(function (images) {
        if (images) {
          uploads[slug] = {
            full: images.full,
            thumb: images.thumb,
            preview: 'data:image/jpeg;base64,' + images.thumb,
          };
          var pending = removals.indexOf(slug);
          if (pending > -1) removals.splice(pending, 1);
        }

        var obra = {
          slug: slug,
          title: title,
          meta: f.meta.value.trim(),
          order: Number(f.order.value) || (obras.length + 1) * 10,
        };

        if (editingSlug) {
          obras = obras.map(function (o) { return o.slug === slug ? obra : o; });
        } else {
          obras.push(obra);
        }

        setDirty(true);
        resetForm();
        render();
        toast('Pronto na lista. Clique em Publicar galeria para valer no site.');
      }).catch(function (err) {
        toast(err.message, true);
      }).finally(function () {
        submit.disabled = false;
        if (!editingSlug) submit.textContent = 'Adicionar obra';
      });
    });

    $('#gallery-publish').addEventListener('click', function () {
      var button = $('#gallery-publish');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Publicando…';

      var payload = {
        obras: obras.map(function (o) {
          return { slug: o.slug, title: o.title, meta: o.meta, order: o.order };
        }),
        uploads: Object.keys(uploads).map(function (slug) {
          return { slug: slug, full: uploads[slug].full, thumb: uploads[slug].thumb };
        }),
        removals: removals,
      };

      api('/api/gallery', { method: 'PUT', body: payload }).then(function (data) {
        obras = data.obras;
        uploads = {};
        removals = [];
        setDirty(false);
        render();
        toast('Galeria publicada. O site atualiza em cerca de 40 segundos.');
      }).catch(function (err) {
        toast(err.message, true);
        setDirty(true);
      }).finally(function () {
        button.removeAttribute('aria-busy');
        button.textContent = 'Publicar galeria';
      });
    });

    return api('/api/gallery').then(function (data) {
      obras = data.obras || [];
      setDirty(false);
      render();
    });
  }
})();
