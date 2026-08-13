/* tools/verify.mjs — verificação do projeto antes do deploy.
 *
 * Checa: links internos quebrados, <script> inline (violaria a CSP),
 * JSON válido, contraste WCAG dos pares do design system, e regras
 * básicas de acessibilidade.
 *
 * Uso: npm run verify
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const readPage = (f) => readFileSync(join(ROOT, f), 'utf8');

/* ------------------------------- links ---------------------------------- */
for (const page of pages) {
  const html = readPage(page);
  for (const m of html.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#|data:|\/\/|\/api\/)/.test(target)) continue;
    const clean = target.split('#')[0].split('?')[0];
    if (!clean) continue;
    if (!existsSync(join(ROOT, clean.replace(/^\//, '')))) {
      problems.push(`${page}: alvo inexistente -> ${target}`);
    }
  }
}

/* --------------------------------- CSP ---------------------------------- */
for (const page of pages) {
  const html = readPage(page);
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)) {
    if (m[0].includes('application/ld+json')) continue;  // JSON-LD é dado
    problems.push(`${page}: <script> inline viola a CSP -> ${m[0].slice(0, 70)}`);
  }
  for (const m of html.matchAll(/\son(click|load|error|submit)=/g)) {
    problems.push(`${page}: handler inline on${m[1]} viola a CSP`);
  }
}

/* -------------------------------- JSON ---------------------------------- */
for (const file of ['data/products.json', 'vercel.json', 'package.json']) {
  try {
    JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
  } catch (err) {
    problems.push(`${file}: JSON inválido -> ${err.message}`);
  }
}

/* Coerência do catálogo com o que o servidor aceita */
const catalog = JSON.parse(readFileSync(join(ROOT, 'data/products.json'), 'utf8')).products;
const seen = new Set();
for (const p of catalog) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) problems.push(`catálogo: slug inválido "${p.slug}"`);
  if (seen.has(p.slug)) problems.push(`catálogo: slug duplicado "${p.slug}"`);
  seen.add(p.slug);
  if (p.status === 'dev' && !['alpha', 'beta', 'planning'].includes(p.stage)) {
    problems.push(`catálogo: "${p.name}" está em dev sem estágio válido`);
  }
  if (p.url && !/^https?:\/\//.test(p.url)) problems.push(`catálogo: URL inválida em "${p.name}"`);
}

/* ------------------------------ contraste -------------------------------- */
function luminance(hex) {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const ratio = (fg, bg) => {
  const a = luminance(fg); const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const PAIRS = [
  ['texto secundário sobre o fundo', '#A3AEC2', '#0B0F1A', 4.5],
  ['texto secundário sobre card', '#A3AEC2', '#141B2B', 4.5],
  ['texto primário sobre o fundo', '#EDEFF4', '#0B0F1A', 4.5],
  ['acento sienna sobre o fundo', '#D07231', '#0B0F1A', 4.5],
  ['acento esmeralda sobre o fundo', '#2FA37A', '#0B0F1A', 4.5],
  ['texto do botão primário', '#0B0F1A', '#D07231', 4.5],
  ['borda de campo (não textual)', '#5B6580', '#0B0F1A', 3.0],
  ['badge LinkedIn', '#FFFFFF', '#0A66C2', 4.5],
  ['badge Instagram', '#FFFFFF', '#C13584', 4.5],
];

for (const [label, fg, bg, min] of PAIRS) {
  const r = ratio(fg, bg);
  if (r < min) problems.push(`contraste: ${label} = ${r.toFixed(2)}:1 (mínimo ${min}:1)`);
  else notes.push(`  ${label.padEnd(34)} ${r.toFixed(2).padStart(6)}:1  (min ${min}:1)`);
}

/* -------------------------------- a11y ----------------------------------- */
for (const page of pages) {
  const html = readPage(page);
  if (!html.includes('<h1')) problems.push(`${page}: página sem <h1>`);
  if (!html.includes('lang="pt-BR"')) problems.push(`${page}: <html> sem lang`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!m[0].includes('alt=')) problems.push(`${page}: <img> sem alt -> ${m[0].slice(0, 60)}`);
  }
}

/* ------------------------------- saída ----------------------------------- */
console.log('Contraste WCAG 2.1 AA');
notes.forEach((n) => console.log(n));
const shown = catalog.filter((p) => p.is_public !== false);
const hidden = catalog.length - shown.length;
console.log(`\nCatálogo: ${shown.filter((p) => p.status === 'live').length} no ar, `
  + `${shown.filter((p) => p.status === 'dev').length} em desenvolvimento`
  + (hidden ? `, ${hidden} oculto(s) do site` : ''));
console.log(`Páginas verificadas: ${pages.length}\n`);

if (problems.length) {
  console.log(`${problems.length} problema(s):`);
  problems.forEach((p) => console.log('  ✗ ' + p));
  process.exit(1);
}
console.log('✓ Nenhum problema encontrado.');
