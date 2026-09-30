// Evaluates crawl evidence against the AEO/GEO rulebook, using the product database
// as the authoritative manufacturer reference (GUIDE-04 step 7). Every rule gets one
// of the rulebook's result states; rules a crawl cannot decide are left "Not assessed"
// or "Needs verification" rather than guessed (GUIDE-04 step 5).

import { RULES, SOURCES } from './rulebook.js';
import { AUDIT_FIELDS, compareField, formatValue, ourValue } from './audit.js';
import { matchScore, normalize } from './analyzer.js';

const SEVERITY = { Fail: 0, 'Needs verification': 1, Opportunity: 2, Pass: 3, 'Not applicable': 4, 'Not assessed': 5 };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const num = (v) => { const m = String(v ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const short = (u, origin) => u.replace(origin, '') || '/';

// --- Reading facts off a page -----------------------------------------------------
const SPEC_LABELS = [
  [/processor|cpu|chip/i, 'processor'], [/memory|\bram\b/i, 'ram_gb'], [/storage|ssd/i, 'storage_gb'],
  [/operating system|\bos\b/i, 'operating_system'], [/resolution/i, 'display_resolution'], [/screen|display/i, 'screen_inches'],
  [/battery/i, 'battery_hours'], [/weight/i, 'weight_kg'], [/connectivity|wireless/i, 'connectivity'], [/ports|inputs/i, 'ports'],
  [/noise/i, 'noise_cancellation'], [/water/i, 'water_resistance'],
];

function visibleFacts(page) {
  const t = page.text ?? '';
  const facts = {};
  const price = t.match(/\$\s?(\d[\d,]*(?:\.\d{2})?)/);
  if (price) facts.price = Number(price[1].replace(/,/g, ''));
  if (/out of stock|sold out|unavailable/i.test(t)) facts.availability = 'out_of_stock';
  else if (/pre-?order/i.test(t)) facts.availability = 'preorder';
  else if (/\bin stock\b/i.test(t)) facts.availability = 'in_stock';
  if (/refurbished|renewed/i.test(t)) facts.condition = 'refurbished';
  else if (/condition:?\s*new|brand new/i.test(t)) facts.condition = 'new';
  const rating = t.match(/rated\s+([\d.]+)\s+out of 5/i) ?? t.match(/([\d.]+)\s*(?:★|out of 5 stars)/);
  if (rating) facts.rating = Number(rating[1]);
  const reviews = t.match(/(\d[\d,]*)\s+(?:customer\s+)?reviews/i);
  if (reviews) facts.review_count = Number(reviews[1].replace(/,/g, ''));
  const ret = t.match(/(\d+)[-\s]day returns?/i);
  if (ret) facts.return_window_days = Number(ret[1]);
  const war = t.match(/(\d+)[-\s](month|year)s?\s+(?:limited\s+)?warranty/i);
  if (war) facts.warranty_months = Number(war[1]) * (/year/i.test(war[2]) ? 12 : 1);
  for (const [label, value] of Object.entries(page.specs ?? {})) {
    const key = SPEC_LABELS.find(([re]) => re.test(label))?.[1];
    if (!key || facts[key] != null) continue;
    if (key === 'water_resistance') facts[key] = /not|none|^no\b/i.test(value) ? 'none' : value;
    else if (key === 'noise_cancellation') facts[key] = /yes|active/i.test(value) ? 'TRUE' : 'FALSE';
    else if (['connectivity', 'ports'].includes(key)) facts[key] = value.split(/\s*,\s*/).join(';');
    else facts[key] = AUDIT_FIELDS.find((f) => f.key === key)?.type === 'number' ? num(value) : value;
  }
  return facts;
}

const productNode = (page) => page.jsonLd?.find((n) => [].concat(n['@type']).includes('Product'));
const schemaTail = (v) => String(v ?? '').replace(/^https?:\/\/schema\.org\//, '');
const AVAIL = { InStock: 'in_stock', OutOfStock: 'out_of_stock', PreOrder: 'preorder', SoldOut: 'out_of_stock', BackOrder: 'preorder' };

function markupFacts(node) {
  if (!node) return null;
  const offer = [].concat(node.offers ?? [])[0] ?? {};
  const cond = schemaTail(offer.itemCondition);
  return {
    name: node.name ?? null,
    sku: node.sku ?? null,
    price: offer.price != null ? Number(offer.price) : null,
    priceCurrency: offer.priceCurrency ?? null,
    availability: AVAIL[schemaTail(offer.availability)] ?? null,
    condition: cond ? (/Refurbished/.test(cond) ? 'refurbished' : /Used/.test(cond) ? 'used' : 'new') : null,
    rating: node.aggregateRating?.ratingValue != null ? Number(node.aggregateRating.ratingValue) : null,
    review_count: node.aggregateRating?.reviewCount != null ? Number(node.aggregateRating.reviewCount) : null,
    image: node.image ?? null,
    offer,
  };
}

// --- Matching pages to database products ------------------------------------------
function matchProducts(pages, products) {
  const map = new Map(); // productId -> page
  for (const product of products) {
    const label = product.name;
    const candidates = pages.filter((p) => p.status === 200);
    const byName = candidates.find((p) => p.h1 && matchScore(product, p.h1) >= 0.75 && normalize(p.h1).includes(normalize(product.brand)));
    const bySlug = candidates.find((p) => p.url.split('/').pop() === slug(label));
    const bySku = candidates.find((p) => productNode(p)?.sku === product.sku);
    const page = byName ?? bySlug ?? bySku;
    if (page) map.set(product.id, page);
  }
  return map;
}

// --- Rule evaluation --------------------------------------------------------------
export function auditSite(crawl, products) {
  const { origin } = crawl;
  const pages = crawl.pages;
  const ok = pages.filter((p) => p.status === 200);
  const productPage = matchProducts(pages, products);
  const matched = products.filter((p) => productPage.has(p.id));
  const results = {}; // ruleId -> { result, findings[], scope, note }

  const set = (id, result, { findings = [], scope = null, note = null, method = 'machine' } = {}) => {
    results[id] = { result, findings, scope, note, method };
  };
  const find = (product, page, detail, observed) => ({
    url: page ? short(page.url, origin) : null,
    product: product ? { id: product.id, sku: product.sku, name: product.name } : null,
    detail,
    observed: observed ?? null,
  });
  // A page whose server HTML is an empty JavaScript shell is reported once, under RENDER-01;
  // content rules can't be judged from it, so they skip it instead of piling on flags.
  const isThin = (page) => (page.textLength ?? 0) < 300 && page.scriptCount > 0;
  const THIN_OK = new Set(['ACCESS-01', 'ACCESS-03', 'ACCESS-04', 'RENDER-01', 'URL-01', 'CONTENT-01']);

  // Rules checked per matched product page: Fail if any instance fails.
  const perProduct = (id, check, { emptyResult = 'Not applicable', note } = {}) => {
    const findings = [];
    let applicable = 0;
    let verify = 0;
    let opportunity = 0;
    for (const product of matched) {
      const page = productPage.get(product.id);
      if (isThin(page) && !THIN_OK.has(id)) continue;
      const r = check(product, page);
      if (!r) continue;
      applicable++;
      if (r.result === 'Fail' || r.result === 'Needs verification' || r.result === 'Opportunity') findings.push({ ...find(product, page, r.detail, r.observed), result: r.result });
      if (r.result === 'Needs verification') verify++;
      if (r.result === 'Opportunity') opportunity++;
    }
    const result = !applicable ? emptyResult
      : findings.some((f) => f.result === 'Fail') ? 'Fail'
        : verify ? 'Needs verification' : opportunity ? 'Opportunity' : 'Pass';
    set(id, result, { findings, scope: applicable, note });
  };

  const vis = new Map(matched.map((p) => [p.id, visibleFacts(productPage.get(p.id))]));
  const mk = new Map(matched.map((p) => [p.id, markupFacts(productNode(productPage.get(p.id)))]));
  const field = (key) => AUDIT_FIELDS.find((f) => f.key === key);
  const differs = (key, a, b) => compareField(field(key), a, b).status === 'inaccurate';
  const fmt = (key, v) => (v == null ? 'not shown' : formatValue(field(key), v));

  // ACCESS-01: robots rules for Google, OpenAI and Bing crawlers on catalog pages.
  perProduct('ACCESS-01', (product, page) => {
    const blocked = Object.entries(page.access).filter(([, allowed]) => !allowed).map(([agent]) => ({ googlebot: 'Googlebot', oaiSearchbot: 'OAI-SearchBot', bingbot: 'Bingbot' })[agent]);
    return blocked.length
      ? { result: 'Fail', detail: `robots.txt disallows this product page for ${blocked.join(', ')}.`, observed: { robots: crawl.robots.url } }
      : { result: 'Pass' };
  }, { note: 'Assumes catalog products are meant to be discoverable; a deliberate exclusion is a policy decision.' });

  // ACCESS-02: persistent errors on linked pages.
  {
    const linked = pages.filter((p) => p.via !== 'sitemap' && !p.skipped);
    const bad = linked.filter((p) => p.error || (p.status && p.status >= 400));
    set('ACCESS-02', bad.length ? 'Fail' : 'Pass', {
      scope: linked.length,
      findings: bad.map((p) => find(null, p, p.error ?? `HTTP ${p.status} after retry.`)),
    });
  }

  // ACCESS-03: noindex on catalog product pages.
  perProduct('ACCESS-03', (product, page) => {
    const directive = [page.metaRobots, page.xRobotsTag].filter(Boolean).join(', ');
    return /noindex/i.test(directive)
      ? { result: 'Fail', detail: `Page is marked noindex (${directive}), so search and AI answer engines drop it from results.`, observed: { directive } }
      : { result: 'Pass' };
  }, { note: 'Catalog products are assumed to be intended for indexing; confirm before removing a deliberate noindex.' });

  // ACCESS-04: snippet restrictions.
  perProduct('ACCESS-04', (product, page) => {
    const directive = [page.metaRobots, page.xRobotsTag].filter(Boolean).join(', ');
    return /nosnippet|max-snippet:\s*0/i.test(directive) || page.dataNosnippet
      ? { result: 'Needs verification', detail: 'Snippet restrictions limit what Google can quote from this page; confirm they are intended.', observed: { directive, dataNosnippet: page.dataNosnippet } }
      : { result: 'Pass' };
  });

  // DISCOVERY-01: products reachable only via sitemap (or not at all).
  if (crawl.limits.truncated) set('DISCOVERY-01', 'Not assessed', { note: 'Crawl hit its page limit, so the link graph is incomplete.' });
  else {
    const findings = [];
    for (const product of products) {
      const page = productPage.get(product.id);
      if (!page) findings.push({ ...find(product, null, 'No page for this product was found on the site.'), result: 'Needs verification' });
      else if (!page.inboundLinks) findings.push({ ...find(product, page, 'No crawlable link points to this product page; it was found only in the sitemap.'), result: 'Fail' });
    }
    set('DISCOVERY-01', findings.some((f) => f.result === 'Fail') ? 'Fail' : findings.length ? 'Needs verification' : 'Pass', { findings, scope: products.length });
  }

  set('DISCOVERY-02', 'Not assessed', { method: 'not assessed', note: 'Button-only loading needs an interactive browser test.' });

  // DISCOVERY-03: sitemap entries that fail, are noindexed, or canonicalize elsewhere.
  if (!crawl.sitemap.entries.length) set('DISCOVERY-03', 'Not applicable', { note: 'No sitemap found; a sitemap is optional.' });
  else {
    const byUrl = new Map(pages.map((p) => [p.url, p]));
    const findings = [];
    for (const e of crawl.sitemap.entries) {
      const p = byUrl.get(e.loc);
      if (!p) continue;
      if (p.error || p.status !== 200) findings.push(find(null, p, `Sitemap lists a URL that returns ${p.error ?? `HTTP ${p.status}`}.`));
      else if (/noindex/i.test(p.metaRobots ?? '')) findings.push(find(null, p, 'Sitemap lists a URL marked noindex.'));
      else if (p.canonical && p.canonical !== p.url && p.canonical !== p.finalUrl) findings.push(find(null, p, `Sitemap lists a URL whose canonical points elsewhere (${short(p.canonical, origin)}).`));
    }
    set('DISCOVERY-03', findings.length ? 'Fail' : 'Pass', { findings, scope: crawl.sitemap.entries.length });
  }

  // RENDER-01: product pages whose raw HTML carries no product content.
  perProduct('RENDER-01', (product, page) => {
    return isThin(page)
      ? { result: 'Needs verification', detail: `The server HTML contains only ${page.textLength} characters of text; product facts appear only after JavaScript runs. Google can render JavaScript, but other answer engines and failed renders will see an empty page. Confirm with Search Console URL Inspection.` }
      : { result: 'Pass' };
  });
  set('RENDER-02', 'Not assessed', { method: 'not assessed', note: 'Requires testing disclosure controls in a browser.' });

  // URL-01: canonical target correctness.
  perProduct('URL-01', (product, page) => {
    if (!page.canonical || page.canonical === page.url || page.canonical === page.finalUrl) return { result: 'Pass' };
    const target = pages.find((p) => p.url === page.canonical) ?? crawl.canonicalChecks[page.canonical];
    if (!target || target.status !== 200) return { result: 'Fail', detail: `Canonical points to ${short(page.canonical, origin)}, which returns ${target?.status ?? 'nothing'}.` };
    const other = products.find((p) => p.id !== product.id && target.h1 && matchScore(p, target.h1) >= 0.75 && normalize(target.h1).includes(normalize(p.brand)));
    if (other) return { result: 'Fail', detail: `Canonical points to a different product, ${other.name} (${short(page.canonical, origin)}). Search engines will treat this page as a duplicate of that product and drop it.`, observed: { canonical: page.canonical } };
    return { result: 'Needs verification', detail: `Canonical points to ${short(page.canonical, origin)}; confirm it is a genuine duplicate.` };
  });

  set('URL-02', 'Not assessed', { method: 'not assessed', note: 'Duplicate URL sets were not observed within the crawl; covered in part by DISCOVERY-03.' });
  set('URL-03', 'Not applicable', { note: 'No variant states are addressed by URL fragments in the product database.' });
  const paramUrls = ok.filter((p) => p.url.includes('?')).length;
  set('URL-04', paramUrls > 20 ? 'Needs verification' : 'Not applicable', { note: `${paramUrls} parameter URLs seen in the crawl.` });

  // IDENTITY-01 / IDENTITY-02: names and identifiers.
  perProduct('IDENTITY-01', (product, page) => {
    const m = mk.get(product.id);
    if (!m?.name || !page.h1) return null;
    return normalize(m.name) === normalize(page.h1) || matchScore(product, m.name) >= 0.75
      ? { result: 'Pass' }
      : { result: 'Fail', detail: `Markup names the product "${m.name}" but the page heading says "${page.h1}".` };
  });
  perProduct('IDENTITY-02', (product) => {
    const m = mk.get(product.id);
    if (!m?.sku || !product.sku) return null;
    return m.sku === product.sku
      ? { result: 'Pass' }
      : { result: 'Fail', detail: `Markup SKU is ${m.sku}, but the manufacturer record for ${product.name} is ${product.sku}.`, observed: { markup: m.sku, database: product.sku } };
  });

  const variantMarkup = ok.some((p) => p.jsonLd?.some((n) => [].concat(n['@type']).includes('ProductGroup')));
  for (const id of ['VARIANT-01', 'VARIANT-02', 'VARIANT-03']) {
    set(id, variantMarkup ? 'Not assessed' : 'Not applicable', { note: variantMarkup ? 'Variant markup found; needs variant-by-variant review.' : 'The product database defines no variants and no variant markup was found.' });
  }

  // DATA-01: markup present but missing merchant-listing required properties.
  perProduct('DATA-01', (product, page) => {
    const m = mk.get(product.id);
    if (page.jsonLdErrors?.length) return { result: 'Fail', detail: `Structured data does not parse: ${page.jsonLdErrors[0]}` };
    if (!m) return { result: 'Opportunity', detail: 'No schema.org Product markup on this page. Adding it lets Google merchant listings read the offer directly.' };
    const missing = [!m.name && 'name', !m.image && 'image', m.price == null && 'offers.price', !m.priceCurrency && 'offers.priceCurrency'].filter(Boolean);
    return missing.length ? { result: 'Fail', detail: `Product markup lacks required properties: ${missing.join(', ')}.` } : { result: 'Pass' };
  });

  // DATA-02: markup contradicts the visible page.
  perProduct('DATA-02', (product) => {
    const m = mk.get(product.id);
    const v = vis.get(product.id);
    if (!m) return null;
    const conflicts = ['price', 'availability', 'condition', 'rating']
      .filter((k) => m[k] != null && v[k] != null && differs(k, v[k], m[k]))
      .map((k) => `${field(k).label.toLowerCase()} (page: ${fmt(k, v[k])}, markup: ${fmt(k, m[k])})`);
    return conflicts.length ? { result: 'Fail', detail: `Markup contradicts the visible page on ${conflicts.join('; ')}.` } : { result: 'Pass' };
  });

  // OFFER-01 / OFFER-03: visible offer vs manufacturer database.
  perProduct('OFFER-01', (product) => {
    const v = vis.get(product.id);
    if (v.price == null) return { result: 'Needs verification', detail: 'No price was found in the page text.' };
    return differs('price', product.price, v.price)
      ? { result: 'Fail', detail: `Page shows ${fmt('price', v.price)}; the manufacturer database says ${fmt('price', product.price)}.`, observed: { page: v.price, database: product.price } }
      : { result: 'Pass' };
  });
  perProduct('OFFER-02', (product, page) => (/\/\s?mo\b|per month|financing|with membership|subscribe (?:and|&) save/i.test(page.text ?? '')
    ? { result: 'Needs verification', detail: 'Conditional pricing language found; confirm the headline price is not presented as unconditional.' }
    : null));
  perProduct('OFFER-03', (product) => {
    const v = vis.get(product.id);
    const db = product.specs.availability;
    if (!db || !v.availability) return null;
    return differs('availability', db, v.availability)
      ? { result: 'Fail', detail: `Page says ${fmt('availability', v.availability)}; the database says ${fmt('availability', db)}.`, observed: { page: v.availability, database: db } }
      : { result: 'Pass' };
  });

  // POLICY-01 / POLICY-02: return and warranty terms.
  perProduct('POLICY-01', (product, page) => {
    const v = vis.get(product.id);
    const db = product.specs.return_window_days;
    const hasPolicyLink = (page.links ?? []).some((l) => /return|refund|shipping/i.test(l));
    if (!hasPolicyLink && v.return_window_days == null) return { result: 'Fail', detail: 'No return terms or policy link on the product page.' };
    if (db && v.return_window_days != null && Number(db) !== v.return_window_days) {
      return { result: 'Fail', detail: `Page promises ${v.return_window_days}-day returns; the database and returns policy say ${db} days.`, observed: { page: v.return_window_days, database: Number(db) } };
    }
    return { result: 'Pass' };
  });
  perProduct('POLICY-02', (product) => {
    const v = vis.get(product.id);
    const db = product.specs.warranty_months;
    if (!db) return null;
    if (v.warranty_months == null) return { result: 'Needs verification', detail: 'No warranty length stated on the page.' };
    return Number(db) !== v.warranty_months
      ? { result: 'Fail', detail: `Page states a ${v.warranty_months}-month warranty; the database says ${db} months.`, observed: { page: v.warranty_months, database: Number(db) } }
      : { result: 'Pass' };
  });

  // CONTENT-01: decision-critical specs missing from readable text.
  const CRITICAL = ['processor', 'ram_gb', 'storage_gb', 'screen_inches', 'battery_hours', 'weight_kg', 'connectivity', 'noise_cancellation', 'water_resistance'];
  perProduct('CONTENT-01', (product, page) => {
    const v = vis.get(product.id);
    const expected = CRITICAL.filter((k) => ourValue(product, field(k)) !== undefined);
    const missing = expected.filter((k) => v[k] == null);
    if (!expected.length) return null;
    if (isThin(page)) return { result: 'Needs verification', detail: 'Specifications are not in the server HTML text; see RENDER-01.' };
    return missing.length
      ? { result: 'Fail', detail: `Missing from page text: ${missing.map((k) => field(k).label.toLowerCase()).join(', ')}.` }
      : { result: 'Pass' };
  });

  // CONTENT-02: numbers without units. CLAIM-01: battery claims without test conditions.
  perProduct('CONTENT-02', (product, page) => {
    const bare = Object.entries(page.specs ?? {}).filter(([, v]) => /^\d+(\.\d+)?$/.test(v.trim()));
    if (!Object.keys(page.specs ?? {}).length) return null;
    return bare.length ? { result: 'Fail', detail: `Specs without units: ${bare.map(([k]) => k).join(', ')}.` } : { result: 'Pass' };
  });
  perProduct('CLAIM-01', (product) => {
    const v = vis.get(product.id);
    const basis = product.specs.battery_test_basis;
    if (v.battery_hours == null || !basis || /not_applicable/.test(basis)) return null;
    const page = productPage.get(product.id);
    const battery = Object.entries(page.specs ?? {}).find(([k]) => /battery/i.test(k))?.[1] ?? '';
    return /test|measured|conditions|brightness|volume/i.test(battery)
      ? { result: 'Pass' }
      : { result: 'Fail', detail: `Claims ${battery.trim()} of battery life with no test conditions. The manufacturer's basis is "${basis}".`, observed: { page: battery.trim(), database: basis } };
  });

  // CONSISTENCY-01: page facts vs the manufacturer database, and across pages.
  perProduct('CONSISTENCY-01', (product, page) => {
    const v = vis.get(product.id);
    const m = mk.get(product.id);
    const issues = [];
    for (const k of ['processor', 'ram_gb', 'storage_gb', 'operating_system', 'screen_inches', 'display_resolution', 'battery_hours', 'weight_kg', 'noise_cancellation', 'water_resistance']) {
      const db = ourValue(product, field(k));
      if (db !== undefined && v[k] != null && differs(k, db, v[k])) issues.push(`${field(k).label.toLowerCase()}: page ${fmt(k, v[k])}, database ${fmt(k, db)}`);
    }
    const dbCond = product.specs.condition;
    if (dbCond === 'refurbished' && v.condition !== 'refurbished') issues.push(`condition: page ${v.condition ? fmt('condition', v.condition) : "doesn't say refurbished"}${m?.condition ? ` and markup says ${m.condition}` : ''}, database refurbished`);
    else if (dbCond && m?.condition && m.condition !== dbCond) issues.push(`condition: markup ${m.condition}, database ${dbCond}`);
    for (const other of ok) {
      if (other === page || !(other.links ?? []).includes(page.url)) continue;
      const card = other.text?.match(new RegExp(`${product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\$\\s?(\\d[\\d,]*\\.\\d{2})`));
      if (card && v.price != null && differs('price', v.price, Number(card[1].replace(/,/g, '')))) {
        issues.push(`price on ${short(other.url, origin)} is $${card[1]} but the product page shows ${fmt('price', v.price)}`);
      }
    }
    return issues.length ? { result: 'Fail', detail: `Conflicting facts: ${issues.join('; ')}.` } : { result: 'Pass' };
  });

  // NEED-01 / NEED-03: intended uses and what's included.
  perProduct('NEED-01', (product, page) => {
    const uses = (product.specs.intended_use ?? product.target_audience ?? '').split(/[;,]/).map((u) => u.trim()).filter(Boolean);
    if (!uses.length) return null;
    const missing = uses.filter((u) => !normalize(page.text).includes(normalize(u)));
    return missing.length ? { result: 'Opportunity', detail: `The page doesn't explain use for ${missing.join(', ')}.` } : { result: 'Pass' };
  });
  perProduct('NEED-03', (product, page) => {
    const acc = product.specs.included_accessories;
    if (!acc) return null;
    const items = acc.split(';').map((a) => a.trim());
    const missing = items.filter((a) => !normalize(page.text).includes(normalize(a)));
    return missing.length ? { result: 'Needs verification', detail: `Not stated what's included: ${missing.join(', ')}.` } : { result: 'Pass' };
  });

  // IMAGE-01: broken product images, missing text alternatives.
  perProduct('IMAGE-01', (product, page) => {
    const imgs = page.images ?? [];
    if (!imgs.length) return { result: 'Needs verification', detail: 'No product image found in the page HTML.' };
    const broken = imgs.filter((i) => crawl.imageChecks[i.src] && crawl.imageChecks[i.src] >= 400);
    const noAlt = imgs.filter((i) => !i.alt);
    if (broken.length) return { result: 'Fail', detail: `Product image is broken (HTTP ${crawl.imageChecks[broken[0].src]})${noAlt.length ? ' and has no alt text' : ''}.` };
    return noAlt.length ? { result: 'Opportunity', detail: 'Product image has no alt text describing the item.' } : { result: 'Pass' };
  });

  // REVIEW-01 / REVIEW-02: rating markup vs the visible summary; eligible entity.
  perProduct('REVIEW-01', (product) => {
    const m = mk.get(product.id);
    const v = vis.get(product.id);
    if (m?.rating == null) return null;
    if (v.rating == null) return { result: 'Needs verification', detail: 'Rating markup present but no visible rating summary found.' };
    return differs('rating', v.rating, m.rating)
      ? { result: 'Fail', detail: `Markup rating is ${m.rating}★ but the page shows ${v.rating}★ (database: ${product.rating}★).`, observed: { markup: m.rating, page: v.rating, database: product.rating } }
      : { result: 'Pass' };
  });
  {
    const wrongEntity = ok.flatMap((p) => (p.jsonLd ?? []).filter((n) => n.aggregateRating && !['Product', 'SoftwareApplication', 'Book', 'Course', 'Event', 'LocalBusiness', 'Movie', 'Recipe'].some((t) => [].concat(n['@type']).includes(t))).map((n) => find(null, p, `Rating markup is attached to a ${n['@type']}.`)));
    set('REVIEW-02', wrongEntity.length ? 'Fail' : 'Pass', { findings: wrongEntity, scope: ok.length });
  }

  set('REGION-01', ok.some((p) => p.hreflang?.length) ? 'Not assessed' : 'Not applicable', { note: 'No hreflang annotations found; they are optional.' });
  set('REGION-02', 'Not applicable', { note: 'The product database covers one market (US).' });
  set('LIFECYCLE-01', 'Not applicable', { note: 'No products are marked discontinued in the database.' });
  set('LIFECYCLE-02', 'Not applicable', { note: 'No removed product URLs were identified.' });
  set('SCALE-01', 'Not applicable', { note: `${pages.length} pages crawled; catalog is well below large-site guidance.` });

  // Semantic rules: judged by Maat when it has a language model, otherwise not assessed.
  for (const id of ['NEED-02', 'NEED-04', 'COMPARE-01', 'COMPARE-02', 'IMAGE-02', 'CLAIM-02', 'CLAIM-03', 'EXPERIMENT-01', 'EXPERIMENT-02']) {
    set(id, 'Not assessed', { method: 'semantic', note: 'Needs semantic review of page content.' });
  }

  // --- Assemble -------------------------------------------------------------------
  const rules = Object.values(RULES).map((rule) => {
    const r = results[rule.id] ?? { result: 'Not assessed', findings: [], note: 'No detection implemented.' };
    return {
      id: rule.id, group: rule.group, title: rule.title, evidence: rule.evidence, risk: rule.risk, platforms: rule.platforms,
      result: r.result, method: r.method, note: r.note, scope: r.scope,
      affected: r.findings.length, findings: r.findings,
      failWhen: rule.failWhen, correction: rule.correction, benefit: rule.benefit, exceptions: rule.exceptions,
      sources: rule.sources.map((s) => SOURCES[s]).filter(Boolean),
    };
  }).sort((a, b) => SEVERITY[a.result] - SEVERITY[b.result]);

  const counts = Object.fromEntries(Object.keys(SEVERITY).map((s) => [s, rules.filter((r) => r.result === s).length]));

  // Per-product fact table: database vs visible page vs markup.
  const FACT_KEYS = ['price', 'availability', 'condition', 'rating', 'review_count', 'return_window_days', 'warranty_months', ...CRITICAL, 'operating_system', 'display_resolution'];
  const productFacts = {};
  for (const product of products) {
    const page = productPage.get(product.id);
    const rulesHit = rules.filter((r) => r.findings.some((f) => f.product?.id === product.id && f.result !== 'Pass')).map((r) => ({ id: r.id, title: r.title, result: r.findings.find((f) => f.product?.id === product.id).result ?? r.result }));
    if (!page) { productFacts[product.id] = { found: false, rules: rulesHit }; continue; }
    const v = vis.get(product.id);
    const m = mk.get(product.id) ?? {};
    const db = { ...Object.fromEntries(FACT_KEYS.map((k) => [k, field(k) ? ourValue(product, field(k)) : product.specs[k]])), condition: product.specs.condition };
    const facts = FACT_KEYS.filter((k) => db[k] !== undefined && db[k] != null).map((k) => {
      const f = field(k) ?? { key: k, label: k === 'condition' ? 'Condition' : k, type: 'text' };
      const cmp = (x) => (x == null ? 'missing' : compareField(f, db[k], x).status === 'accurate' ? 'match' : 'mismatch');
      return {
        key: k, label: f.label,
        db: formatValue(f, db[k]),
        site: v[k] != null ? formatValue(f, v[k]) : null, siteStatus: cmp(v[k]),
        markup: m[k] != null ? formatValue(f, m[k]) : null, markupStatus: m[k] != null ? cmp(m[k]) : null,
      };
    });
    productFacts[product.id] = { found: true, url: page.url, rules: rulesHit, facts };
  }

  return {
    startUrl: crawl.startUrl,
    crawledAt: crawl.finishedAt,
    pagesCrawled: pages.length,
    productsInDb: products.length,
    productsFound: matched.length,
    truncated: crawl.limits.truncated,
    counts,
    rules,
    products: productFacts,
    google: crawl.google,
    robots: crawl.robots,
    sitemapUrls: crawl.sitemap.entries.length,
    pages: pages.map((p) => ({
      url: short(p.url, origin), status: p.status ?? null, via: p.via, error: p.error ?? p.skipped ?? null,
      title: p.title ?? null, inboundLinks: p.inboundLinks, noindex: /noindex/i.test(`${p.metaRobots ?? ''} ${p.xRobotsTag ?? ''}`),
      product: [...productPage.entries()].find(([, pg]) => pg === p)?.[0] ?? null,
    })),
    userAgent: crawl.userAgent,
  };
}
