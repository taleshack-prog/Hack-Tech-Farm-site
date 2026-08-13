/* js/data.js — camada de dados do site público.
 *
 * Fonte única de verdade: a tabela `products` no Postgres. Se o Supabase não
 * estiver configurado, cai para data/seed.json, então o site nunca renderiza
 * vazio em ambiente local ou durante uma indisponibilidade do banco.
 */
(function () {
  'use strict';

  var cfg = window.HTF_CONFIG || {};
  var hasRemote = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  var cache = null;

  /* --- Sanitização ---------------------------------------------------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Bloqueia javascript:, data:, vbscript: — escapar aspas não basta.
     Este era um vetor de XSS real no dashboard anterior. */
  function safeUrl(value) {
    if (!value) return '';
    var raw = String(value).trim();
    try {
      var parsed = new URL(raw, window.location.origin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
        return parsed.href;
      }
    } catch (err) { /* URL inválida cai fora */ }
    return '';
  }

  /* --- Normalização --------------------------------------------------- */

  var VALID_STATUS = ['live', 'dev'];
  var VALID_STAGE = ['alpha', 'beta', 'planning'];

  function normalize(row) {
    return {
      id: row.id,
      slug: String(row.slug || '').trim(),
      name: String(row.name || '').trim(),
      tagline: String(row.tagline || '').trim(),
      description: String(row.description || '').trim(),
      url: safeUrl(row.url),
      pageUrl: String(row.page_url || row.pageUrl || '').trim(),
      icon: String(row.icon || '📦').trim(),
      category: String(row.category || '').trim(),
      status: VALID_STATUS.indexOf(row.status) > -1 ? row.status : 'dev',
      stage: VALID_STAGE.indexOf(row.stage) > -1 ? row.stage : 'planning',
      sortOrder: Number(row.sort_order != null ? row.sort_order : row.sortOrder) || 0
    };
  }

  function bySortOrder(a, b) {
    return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR');
  }

  /* --- Busca ----------------------------------------------------------- */

  function fetchSeed() {
    return fetch('data/seed.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('seed indisponível');
        return res.json();
      })
      .then(function (json) { return json.products || []; });
  }

  function fetchRemote() {
    var url = cfg.supabaseUrl.replace(/\/$/, '') +
      '/rest/v1/products?select=*&is_public=eq.true&order=sort_order.asc';
    return fetch(url, {
      headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey }
    }).then(function (res) {
      if (!res.ok) throw new Error('Supabase respondeu ' + res.status);
      return res.json();
    });
  }

  function getProducts() {
    if (cache) return Promise.resolve(cache);

    var source = hasRemote
      ? fetchRemote().catch(function (err) {
          console.warn('[HTF] Supabase indisponível, usando seed local.', err);
          return fetchSeed();
        })
      : fetchSeed();

    return source.then(function (rows) {
      cache = (rows || []).map(normalize).sort(bySortOrder);
      return cache;
    });
  }

  window.HTFData = {
    getProducts: getProducts,
    getLive: function () {
      return getProducts().then(function (rows) {
        return rows.filter(function (p) { return p.status === 'live'; });
      });
    },
    getInDevelopment: function () {
      return getProducts().then(function (rows) {
        return rows.filter(function (p) { return p.status === 'dev'; });
      });
    },
    escapeHtml: escapeHtml,
    safeUrl: safeUrl
  };
})();
