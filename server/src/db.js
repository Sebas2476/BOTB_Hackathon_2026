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

const PRODUCT_FIELDS = [
  'name', 'brand', 'category', 'price', 'rating', 'review_count',
  'target_audience', 'url', 'description', 'features',
];

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function normalizeProduct(input) {
  const p = {};
  for (const f of PRODUCT_FIELDS) p[f] = input[f] ?? null;
  for (const f of ['name', 'brand', 'category', 'target_audience', 'url', 'description', 'features']) {
    p[f] = p[f] == null ? null : String(p[f]).trim() || null;
  }
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

export function listProducts() {
  return db.prepare('SELECT * FROM products ORDER BY id DESC').all();
}

export function getProductsByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids);
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

export function createReport(config, total) {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO reports (status, config, progress_total) VALUES ('running', ?, ?)`)
    .run(JSON.stringify(config), total);
  return Number(lastInsertRowid);
}

export function updateReportProgress(id, done, results) {
  db.prepare('UPDATE reports SET progress_done = ?, results = ? WHERE id = ?')
    .run(done, JSON.stringify(results), id);
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
    SELECT id, status, config, progress_done, progress_total, summary, created_at, completed_at
    FROM reports ORDER BY id DESC
  `).all().map((r) => {
    const parsed = parseReport(r);
    // Keep the list payload light: only headline numbers per product.
    const products = parsed.summary?.products?.map((p) => ({
      productId: p.product.id,
      name: p.product.name,
      visibilityScore: p.visibilityScore,
      avgRank: p.avgRank,
    })) ?? [];
    return { ...parsed, summary: undefined, products };
  });
}
