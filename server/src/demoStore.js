// Demo client storefront at /demo-store, built from the MAAT product database.
// It stands in for a manufacturer's website so the crawl phase has something real
// to inspect. Most pages are correct; the DEFECTS below are deliberate AEO/GEO
// mistakes (each tied to a rulebook rule) for the audit to find.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rows = parseCsv(fs.readFileSync(path.join(__dirname, '..', 'sample-data', 'product_database.csv'), 'utf8'));

export const BASE = '/store';
const STORE = 'Brightline Electronics';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const catSlug = (c) => `${slug(c)}${/s$/i.test(c) ? '' : 's'}`;
const money = (v) => Number(String(v).replace(/[$,]/g, ''));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const products = rows.map((r) => ({
  ...r,
  name: `${r.brand} ${r.model}`,
  cat: catSlug(r.category),
  path: `${BASE}/${catSlug(r.category)}/${slug(`${r.brand} ${r.model}`)}`,
  price: money(r.price_usd),
}));
const bySku = Object.fromEntries(products.map((p) => [p.product_id, p]));
const categories = [...new Set(products.map((p) => p.cat))];

// Deliberate defects, keyed by SKU. The audit should catch each of these.
export const DEFECTS = {
  'SYN-001': { visiblePrice: 429.99, note: 'Visible price differs from the database and from the page markup (OFFER-01, DATA-02)' },
  'SYN-003': { markupMissing: ['priceCurrency', 'image'], note: 'Product markup lacks required merchant-listing properties (DATA-01)' },
  'SYN-004': { availability: 'in_stock', note: 'Shown as in stock although the database says out of stock (OFFER-03)' },
  'SYN-005': { hideCondition: true, markupCondition: 'NewCondition', note: 'Refurbished product presented as new (CONSISTENCY-01)' },
  'SYN-006': { markupSku: 'SYN-060', note: 'Markup SKU conflicts with the manufacturer record (IDENTITY-02)' },
  'SYN-007': { listingPrice: 329.99, note: 'Category page price disagrees with the product page (CONSISTENCY-01)' },
  'SYN-008': { batteryNoConditions: true, specOverride: { ram_gb: '12' }, note: 'Battery claim without test conditions; RAM differs from the database (CLAIM-01, CONTENT-02, CONSISTENCY-01)' },
  'SYN-009': { noindex: true, note: 'Product page carries an unintended noindex (ACCESS-03)' },
  'SYN-010': { warrantyText: '24-month warranty', note: 'Warranty stated differs from the database (POLICY-02)' },
  'SYN-012': { jsOnly: true, note: 'Product facts are injected by JavaScript only (RENDER-01, CONTENT-01)' },
  'SYN-013': { canonicalTo: 'SYN-014', note: 'Canonical points to a different product (URL-01)' },
  'SYN-016': { brokenImage: true, noAlt: true, note: 'Broken product image without alt text (IMAGE-01)' },
  'SYN-017': { markupRating: 4.6, note: 'Rating markup disagrees with the visible rating (REVIEW-01)' },
  'SYN-018': { returnText: '15-day returns', note: 'Return window on the page contradicts the returns policy and database (POLICY-01)' },
  'SYN-020': { orphan: true, note: 'Not linked from any category page; only in the sitemap (DISCOVERY-01)' },
};
// Site-wide defects: tablets are blocked for OAI-SearchBot (ACCESS-01); the sitemap lists a dead URL (DISCOVERY-03).
const DEAD_SITEMAP_URL = `${BASE}/laptops/avenlo-study-13`;

const AVAIL_LABEL = { in_stock: 'In stock', out_of_stock: 'Out of stock', preorder: 'Available for preorder' };
const AVAIL_SCHEMA = { in_stock: 'InStock', out_of_stock: 'OutOfStock', preorder: 'PreOrder' };

function layout(origin, { title, description, body, head = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
${head}
<style>
  body { font-family: system-ui, sans-serif; margin: 0; color: #1d1d1b; background: #fafaf8; }
  header, main, footer { max-width: 960px; margin: 0 auto; padding: 16px; }
  header { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #ddd; }
  header a { color: #1d1d1b; } .logo { font-weight: 700; margin-right: auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 14px; }
  table { border-collapse: collapse; } td, th { border-bottom: 1px solid #eee; padding: 6px 12px 6px 0; text-align: left; }
  .price { font-size: 1.5rem; font-weight: 700; } .notice { background: #fff4d6; padding: 8px 12px; border-radius: 6px; }
</style>
</head>
<body>
<header>
  <a class="logo" href="${BASE}/">${STORE}</a>
  ${categories.map((c) => `<a href="${BASE}/${c}/">${c[0].toUpperCase() + c.slice(1)}</a>`).join('\n  ')}
  <a href="${BASE}/policies/returns">Returns</a>
</header>
<main>
${body}
</main>
<footer><small>© 2026 Brightline Electronics. Prices in USD. Free returns within 30 days.</small></footer>
</body>
</html>`;
}

function productJsonLd(origin, p, d) {
  const offer = {
    '@type': 'Offer',
    url: origin + p.path,
    price: p.price.toFixed(2),
    priceCurrency: 'USD',
    availability: `https://schema.org/${AVAIL_SCHEMA[d.availability ?? p.availability]}`,
    itemCondition: `https://schema.org/${d.markupCondition ?? (p.condition === 'refurbished' ? 'RefurbishedCondition' : 'NewCondition')}`,
    hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', merchantReturnDays: Number(p.return_window_days), applicableCountry: 'US' },
  };
  for (const k of d.markupMissing ?? []) delete offer[k];
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: d.markupSku ?? p.product_id,
    brand: { '@type': 'Brand', name: p.brand },
    image: `${origin}${BASE}/images/${p.product_id}.svg`,
    description: `${p.name} ${p.category.toLowerCase()} for ${p.intended_use.split(';').join(' and ')}.`,
    color: p.color,
    offers: offer,
    aggregateRating: { '@type': 'AggregateRating', ratingValue: String(d.markupRating ?? p.rating_average), reviewCount: String(p.review_count) },
  };
  if ((d.markupMissing ?? []).includes('image')) delete data.image;
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

const SPEC_ROWS = [
  ['processor', 'Processor'], ['ram_gb', 'Memory', (v) => `${v} GB RAM`], ['storage_gb', 'Storage', (v) => `${v} GB`],
  ['operating_system', 'Operating system'], ['screen_inches', 'Screen', (v) => `${v}-inch`], ['display_resolution', 'Resolution'],
  ['weight_kg', 'Weight', (v) => `${v} kg`], ['connectivity', 'Connectivity', (v) => v.split(';').join(', ')],
  ['ports', 'Ports', (v) => v.split(';').join(', ')], ['noise_cancellation', 'Active noise cancellation', (v) => (/true/i.test(v) ? 'Yes' : 'No')],
  ['water_resistance', 'Water resistance', (v) => (v === 'none' ? 'Not water resistant' : v)], ['color', 'Color'],
];

function productBody(origin, p, d) {
  const specs = { ...p, ...(d.specOverride ?? {}) };
  const avail = d.availability ?? p.availability;
  const price = d.visiblePrice ?? p.price;
  const battery = p.battery_hours
    ? `<tr><th>Battery life</th><td>${p.battery_hours} hours${d.batteryNoConditions ? '' : ` (tested: ${esc(p.battery_test_basis)})`}</td></tr>`
    : '';
  const rows = SPEC_ROWS.filter(([k]) => specs[k]).map(([k, label, fmt]) => `<tr><th>${label}</th><td>${esc(fmt ? fmt(specs[k]) : specs[k])}</td></tr>`).join('\n');
  const img = d.brokenImage
    ? `<img src="${BASE}/images/missing-${p.product_id}.jpg" width="320" height="200">`
    : `<img src="${BASE}/images/${p.product_id}.svg" alt="${esc(p.name)} in ${esc(p.color)}" width="320" height="200">`;
  const uses = p.intended_use.split(';').join(' and ');
  return `
<p><a href="${BASE}/${p.cat}/">${p.cat}</a> / ${esc(p.name)}</p>
<h1>${esc(p.name)}</h1>
${img}
<p class="price">$${price.toFixed(2)} <small>USD</small></p>
<p><strong>${AVAIL_LABEL[avail]}</strong>${d.hideCondition ? '' : ` · Condition: ${p.condition === 'refurbished' ? 'Refurbished' : 'New'}`} · Sold by ${STORE}</p>
<p>Shipping: ${money(p.shipping_cost_usd) ? `$${money(p.shipping_cost_usd).toFixed(2)}` : 'Free'}${p.delivery_days_min ? `, arrives in ${p.delivery_days_min}–${p.delivery_days_max} business days` : ''}.
 ${d.returnText ?? `${p.return_window_days}-day returns`} (<a href="${BASE}/policies/returns">return policy</a>).
 ${d.warrantyText ?? `${p.warranty_months}-month limited warranty`}.</p>
<h2>About this ${esc(p.category.toLowerCase())}</h2>
<p>The ${esc(p.name)} is built for ${esc(uses)}. Rated ${p.rating_average} out of 5 from ${p.review_count} reviews.</p>
<h2>Specifications</h2>
<table>
${rows}
${battery}
</table>
<h2>What's in the box</h2>
<p>${esc(p.name)}, ${esc(p.included_accessories.split(';').join(', '))}.</p>`;
}

export function demoStoreRouter() {
  const router = express.Router();
  const origin = (req) => `${req.protocol}://${req.get('host')}`;

  router.get('/', (req, res) => {
    res.send(layout(origin(req), {
      title: `${STORE} | Laptops, phones, tablets and headphones`,
      description: 'Shop laptops, smartphones, tablets and headphones with free returns within 30 days.',
      head: `<link rel="canonical" href="${origin(req)}${BASE}/">`,
      body: `<h1>${STORE}</h1>
<p>Laptops, smartphones, tablets and headphones from Avenlo, Brivex, Celdora, Dovari, Elnivo, Foventa, Gavero, Hivora, Iverlo, Jovira, Keldavo and Lunvero.</p>
<div class="grid">${categories.map((c) => `<a class="card" href="${BASE}/${c}/">${c[0].toUpperCase() + c.slice(1)}</a>`).join('')}</div>`,
    }));
  });

  router.get('/policies/returns', (req, res) => {
    res.send(layout(origin(req), {
      title: `Returns and warranty | ${STORE}`,
      description: 'Return policy and warranty terms.',
      body: `<h1>Returns and warranty</h1>
<p>Return any product within 30 days of delivery for a full refund. Refurbished products carry a 6-month warranty; new products carry the manufacturer's limited warranty stated on the product page. Offers apply to the US market only.</p>`,
    }));
  });

  router.get('/sitemap.xml', (req, res) => {
    const urls = [`${BASE}/`, ...categories.map((c) => `${BASE}/${c}/`), ...products.map((p) => p.path), DEAD_SITEMAP_URL];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${origin(req)}${u}</loc><lastmod>2026-09-30</lastmod></url>`).join('\n')}
</urlset>`);
  });

  router.get('/images/:file', (req, res) => {
    const sku = req.params.file.replace(/\.svg$/, '');
    const p = bySku[sku];
    if (!p) return res.status(404).send('Not found');
    res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#e8eef6"/><text x="160" y="105" text-anchor="middle" font-family="sans-serif" font-size="18">${esc(p.name)}</text></svg>`);
  });

  router.get('/:cat/', (req, res, next) => {
    if (!categories.includes(req.params.cat)) return next();
    const list = products.filter((p) => p.cat === req.params.cat && !DEFECTS[p.product_id]?.orphan);
    res.send(layout(origin(req), {
      title: `${req.params.cat[0].toUpperCase() + req.params.cat.slice(1)} | ${STORE}`,
      description: `Compare ${req.params.cat} by price, specs and ratings.`,
      head: `<link rel="canonical" href="${origin(req)}${BASE}/${req.params.cat}/">`,
      body: `<h1>${req.params.cat[0].toUpperCase() + req.params.cat.slice(1)}</h1>
<div class="grid">${list.map((p) => `<div class="card"><a href="${p.path}"><strong>${esc(p.name)}</strong></a><br>$${(DEFECTS[p.product_id]?.listingPrice ?? p.price).toFixed(2)} · ${p.rating_average}★</div>`).join('\n')}</div>`,
    }));
  });

  router.get('/:cat/:slug', (req, res, next) => {
    const p = products.find((x) => x.path === `${BASE}/${req.params.cat}/${req.params.slug}`);
    if (!p) return next();
    const d = DEFECTS[p.product_id] ?? {};
    const o = origin(req);
    const canonical = d.canonicalTo ? o + bySku[d.canonicalTo].path : o + p.path;
    const head = [
      `<link rel="canonical" href="${canonical}">`,
      d.noindex ? '<meta name="robots" content="noindex">' : '',
      productJsonLd(o, p, d),
    ].join('\n');
    const description = `${p.name}: specs, price and availability.`;

    if (d.jsOnly) {
      // Product facts only exist after this script runs; the raw HTML has an empty shell.
      const html = productBody(o, p, d);
      return res.send(layout(o, {
        title: `${p.name} | ${STORE}`, description, head: head.replace(/<script type="application\/ld\+json">.*<\/script>/, ''),
        body: `<div id="app">Loading…</div>
<script>document.getElementById('app').innerHTML = ${JSON.stringify(html)};</script>`,
      }));
    }
    res.send(layout(o, { title: `${p.name} | ${STORE}`, description, head, body: productBody(o, p, d) }));
  });

  router.use((req, res) => res.status(404).send(layout(origin(req), { title: `Page not found | ${STORE}`, body: '<h1>Page not found</h1>' })));
  return router;
}

// robots.txt for the whole host. Tablets are (mistakenly) blocked for OpenAI's search crawler.
export function robotsTxt(req) {
  return `User-agent: *
Allow: /

User-agent: OAI-SearchBot
Disallow: ${BASE}/tablets/

Sitemap: ${req.protocol}://${req.get('host')}${BASE}/sitemap.xml
`;
}
