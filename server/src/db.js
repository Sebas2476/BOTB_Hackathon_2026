import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL,
    rating REAL,
    review_count INTEGER,
    target_audience TEXT,
    url TEXT,
    description TEXT,
    features TEXT,
    sku TEXT,
    specs TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    config TEXT NOT NULL,
    progress_done INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER NOT NULL DEFAULT 0,
    results TEXT,
    summary TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );
`);

// Columns added after the first release; older local databases get them here.
function addColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('products', 'sku', 'TEXT');
addColumn('products', 'specs', 'TEXT');
addColumn('reports', 'type', "TEXT NOT NULL DEFAULT 'ranking'");
addColumn('reports', 'phase', 'TEXT');

const PRODUCT_FIELDS = [
  'name', 'brand', 'category', 'price', 'rating', 'review_count',
  'target_audience', 'url', 'description', 'features', 'sku', 'specs',
];

// Alternate column names accepted on import (e.g. the MAAT product database export).
const ALIASES = {
  sku: ['product_id'],
  price: ['price_usd'],
  rating: ['rating_average'],
  target_audience: ['intended_use'],
};
const ALIASED = new Set(Object.values(ALIASES).flat());
// Any other column is kept as a product spec, which the accuracy audit checks.
const NOT_SPECS = new Set([...PRODUCT_FIELDS, ...ALIASED, 'model', 'id', 'created_at']);

const pluralize = (word) => (/s$/.test(word) ? word : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`);

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Short feature list built from specs, for catalogs that ship specs instead of prose.
function featuresFromSpecs(s) {
  const out = [];
  if (s.ram_gb) out.push(`${s.ram_gb}GB RAM`);
  if (s.storage_gb) out.push(`${s.storage_gb}GB storage`);
  if (s.processor) out.push(`${s.processor} processor`);
  if (s.screen_inches) out.push(`${s.screen_inches}-inch ${s.display_resolution ?? ''} display`.replace('  ', ' '));
  if (s.battery_hours) out.push(`${s.battery_hours}-hour battery`);
  if (s.weight_kg) out.push(`${s.weight_kg} kg`);
  if (s.noise_cancellation === 'TRUE') out.push('active noise cancellation');
  if (s.water_resistance && s.water_resistance !== 'none') out.push(`${s.water_resistance} water resistance`);
  if (s.connectivity) out.push(s.connectivity.split(';').join(', '));
  return out.join('; ') || null;
}

export function normalizeProduct(input) {
  const p = {};
  for (const f of PRODUCT_FIELDS) p[f] = input[f] ?? ALIASES[f]?.map((a) => input[a]).find((v) => v != null && v !== '') ?? null;
  if (!p.name && input.model) p.name = `${input.brand ?? ''} ${input.model}`.trim();

  const specs = {};
  for (const [k, v] of Object.entries(input)) {
    if (!NOT_SPECS.has(k) && v != null && String(v).trim() !== '') specs[k] = String(v).trim();
  }
  p.specs = Object.keys(specs).length ? JSON.stringify(specs) : null;

  for (const f of ['name', 'brand', 'category', 'target_audience', 'url', 'description', 'features', 'sku']) {
    p[f] = p[f] == null ? null : String(p[f]).trim() || null;
  }
  if (p.category) p.category = pluralize(p.category.toLowerCase());
  if (p.target_audience) p.target_audience = p.target_audience.split(/\s*;\s*/).join(', ');
  if (!p.features && Object.keys(specs).length) p.features = featuresFromSpecs(specs);
  p.price = toNumber(p.price);
  p.rating = toNumber(p.rating);
  p.review_count = p.review_count == null ? null : Math.round(toNumber(p.review_count) ?? 0);
  const missing = ['name', 'brand', 'category'].filter((f) => !p[f]);
  return { product: p, missing };
}

const insertStmt = db.prepare(`
  INSERT INTO products (${PRODUCT_FIELDS.join(', ')})
  VALUES (${PRODUCT_FIELDS.map((f) => ':' + f).join(', ')})
`);

const skuStmt = db.prepare('SELECT id FROM products WHERE sku = ?');

export function insertProducts(rows) {
  const inserted = [];
  const errors = [];
  db.exec('BEGIN');
  try {
    rows.forEach((row, i) => {
      const { product, missing } = normalizeProduct(row);
      if (missing.length) {
        errors.push({ row: i + 1, error: `Missing required field(s): ${missing.join(', ')}` });
        return;
      }
      if (product.sku && skuStmt.get(product.sku)) {
        errors.push({ row: i + 1, error: `${product.sku} is already in the database` });
        return;
      }
      const { lastInsertRowid } = insertStmt.run(product);
      inserted.push(Number(lastInsertRowid));
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { inserted, errors };
}

const parseProduct = (row) => ({ ...row, specs: row.specs ? JSON.parse(row.specs) : {} });

export function listProducts() {
  return db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(parseProduct);
}

export function countProducts() {
  return db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
}

export function getProductsByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids).map(parseProduct);
}

export function deleteProduct(id) {
  return db.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
}

function parseReport(row) {
  if (!row) return null;
  return {
    ...row,
    config: JSON.parse(row.config),
    results: row.results ? JSON.parse(row.results) : [],
    summary: row.summary ? JSON.parse(row.summary) : null,
  };
}

export function createReport(config, total, type = 'ranking') {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO reports (type, status, config, progress_total) VALUES (?, 'running', ?, ?)`)
    .run(type, JSON.stringify(config), total);
  return Number(lastInsertRowid);
}

export function updateReportProgress(id, done, results, phase = null) {
  db.prepare('UPDATE reports SET progress_done = ?, results = ?, phase = ? WHERE id = ?')
    .run(done, JSON.stringify(results), phase, id);
}

export function completeReport(id, results, summary) {
  db.prepare(`
    UPDATE reports SET status = 'complete', results = ?, summary = ?,
      progress_done = progress_total, completed_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(results), JSON.stringify(summary), id);
}

export function failReport(id, error) {
  db.prepare(`UPDATE reports SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`)
    .run(String(error), id);
}

export function getReport(id) {
  return parseReport(db.prepare('SELECT * FROM reports WHERE id = ?').get(id));
}

export function listReports() {
  return db.prepare(`
    SELECT id, type, status, phase, config, progress_done, progress_total, summary, created_at, completed_at
    FROM reports ORDER BY id DESC
  `).all().map((r) => {
    const parsed = parseReport(r);
    // Keep the list payload light: only headline numbers per product.
    const products = parsed.summary?.products?.map((p) => {
      const ranking = parsed.type === 'full' ? p.ranking : p;
      const audit = parsed.type === 'full' ? p.audit : p;
      return {
        productId: p.product.id,
        name: p.product.name,
        visibilityScore: ranking?.visibilityScore,
        avgRank: ranking?.avgRank,
        accuracyScore: audit?.accuracyScore,
        flagCount: audit?.flags?.length,
      };
    }) ?? [];
    const site = parsed.summary?.site;
    const siteHeadline = site && !site.error ? { fails: site.counts?.Fail ?? 0, recommendations: site.maat?.recommendations?.length ?? 0 } : null;
    return { ...parsed, summary: undefined, products, site: siteHeadline };
  });
}
