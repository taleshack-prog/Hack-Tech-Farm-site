/* js/catalog.js — renderiza produtos e roadmap a partir da camada de dados.
 * Cadastrar um produto no dashboard publica no site sem tocar em HTML.
 */
(function () {
  'use strict';

  var esc = window.HTFData.escapeHtml;

  var CATEGORY_CLASS = { 'Web3': 'tag-web3', 'IA': 'tag-ai', 'PWA': 'tag-pwa', 'Arte': 'tag-art' };
  var STAGE_LABEL = { alpha: 'Alpha', beta: 'Beta', planning: 'Planejamento' };
  var STAGE_CLASS = { alpha: 'status-alpha', beta: 'status-beta', planning: 'status-planning' };

  /* O HTML já vem pré-renderizado do build. Se o banco devolver exatamente o
     mesmo conteúdo, não mexemos no DOM — evita o "pisca" de repintura. */
  function swap(target, html) {
    if (target.innerHTML.trim() === html.trim()) return;
    target.innerHTML = html;
  }

  function link(product) {
    if (product.pageUrl) {
      return '<a class="card-link card-stretch" href="' + esc(product.pageUrl) + '">' +
             'Ver detalhes <span aria-hidden="true">→</span></a>';
    }
    if (product.url) {
      return '<a class="card-link card-stretch" href="' + esc(product.url) + '" target="_blank" rel="noopener">' +
             'Abrir ' + esc(product.name) + ' <span aria-hidden="true">↗</span>' +
             '<span class="visually-hidden"> (abre em nova aba)</span></a>';
    }
    return '';
  }

  function productCard(product) {
    return '' +
      '<article class="card">' +
        '<div class="card-icon" aria-hidden="true">' + esc(product.icon) + '</div>' +
        (product.category ? '<span class="card-tag ' + (CATEGORY_CLASS[product.category] || 'tag-pwa') + '">' + esc(product.category) + '</span>' : '') +
        '<h3>' + esc(product.name) + '</h3>' +
        '<p>' + esc(product.tagline || product.description) + '</p>' +
        link(product) +
      '</article>';
  }

  function renderProducts(target, limit) {
    window.HTFData.getLive().then(function (items) {
      var list = limit ? items.slice(0, limit) : items;
      if (!list.length) {
        target.innerHTML = '<div class="empty-state">Nenhum produto no ar ainda. Cadastre o primeiro pelo dashboard.</div>';
        return;
      }
      swap(target, list.map(productCard).join(''));
    }).catch(function (err) {
      console.error('[HTF] catálogo', err);
      target.innerHTML = '<div class="empty-state">Não foi possível carregar o catálogo agora. Recarregue a página.</div>';
    });
  }

  function renderRoadmap(target) {
    window.HTFData.getInDevelopment().then(function (items) {
      if (!items.length) {
        target.innerHTML = '<div class="empty-state">Nada em desenvolvimento no momento.</div>';
        return;
      }
      swap(target, items.map(function (p, i) {
        return '' +
          '<li class="tl-item">' +
            '<span class="tl-dot' + (p.stage === 'beta' ? ' art' : '') + '" aria-hidden="true">' + String(i + 1).padStart(2, '0') + '</span>' +
            '<span class="tl-status ' + (STAGE_CLASS[p.stage] || 'status-planning') + '">' + (STAGE_LABEL[p.stage] || 'Planejamento') + '</span>' +
            '<h3>' + esc(p.name) + '</h3>' +
            '<p>' + esc(p.description || p.tagline) + '</p>' +
          '</li>';
      }).join(''));
    }).catch(function (err) {
      console.error('[HTF] roadmap', err);
      target.innerHTML = '<div class="empty-state">Não foi possível carregar o roadmap agora.</div>';
    });
  }

  function renderFurrows(target) {
    window.HTFData.getLive().then(function (items) {
      swap(target, items.slice(0, 4).map(function (p, i) {
        return '' +
          '<li class="furrow">' +
            '<span class="idx">' + String(i + 1).padStart(2, '0') + '</span>' +
            '<span class="nm">' + esc(p.name) + '</span>' +
            '<span class="st">' + esc(p.category || 'no ar') + '</span>' +
          '</li>';
      }).join(''));
    }).catch(function () { /* o conteúdo do build permanece */ });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var grid = document.getElementById('products-grid');
    var featured = document.getElementById('featured-grid');
    var timeline = document.getElementById('roadmap-timeline');
    var furrows = document.getElementById('hero-furrows');

    if (grid) renderProducts(grid, 0);
    if (featured) renderProducts(featured, 3);
    if (timeline) renderRoadmap(timeline);
    if (furrows) renderFurrows(furrows);
  });
})();
