import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { insertProducts, listProducts, countProducts, getProductsByIds, deleteProduct, getReport, listReports } from './db.js';
import { parseCsv } from './csv.js';
import { describeProviders, getProvider } from './providers/index.js';
import { startReport } from './reportRunner.js';
import { checkTarget } from './crawler.js';
import { demoStoreRouter, robotsTxt, BASE as DEMO_STORE } from './demoStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME_DB = path.join(__dirname, '..', 'sample-data', 'product_database.csv');

// The MAAT home product database: loaded on first start so the app is never empty
// (Render's free tier also wipes SQLite on every deploy).
const loadHomeDatabase = () => insertProducts(parseCsv(fs.readFileSync(HOME_DB, 'utf8')));
if (countProducts() === 0) {
  const { inserted } = loadHomeDatabase();
  console.log(`Loaded ${inserted.length} products from the home database`);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }));

app.set('trust proxy', true); // Render terminates TLS; keeps req.protocol accurate for demo-store URLs
app.get('/robots.txt', (req, res) => res.type('text/plain').send(robotsTxt(req)));
app.use(DEMO_STORE, demoStoreRouter());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/providers', (_req, res) => res.json(describeProviders()));

// --- Products ---------------------------------------------------------------
app.get('/api/products', (_req, res) => res.json(listProducts()));

// Accepts: a JSON product, a JSON array of products, { csv: "..." }, or a raw text/csv body.
app.post('/api/products', (req, res) => {
  let rows;
  if (typeof req.body === 'string') rows = parseCsv(req.body);
  else if (typeof req.body?.csv === 'string') rows = parseCsv(req.body.csv);
  else if (Array.isArray(req.body)) rows = req.body;
  else if (req.body && typeof req.body === 'object') rows = [req.body];
  else return res.status(400).json({ error: 'Expected CSV text or JSON product data' });

  if (!rows.length) return res.status(400).json({ error: 'No product rows found' });
  const result = insertProducts(rows);
  res.status(result.inserted.length ? 201 : 400).json(result);
});

// Re-imports the home database; products already present (same SKU) are skipped.
app.post('/api/products/home', (_req, res) => {
  const { inserted, errors } = loadHomeDatabase();
  res.json({ inserted, skipped: errors.length });
});

app.delete('/api/products/:id', (req, res) => {
  if (!deleteProduct(Number(req.params.id))) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

app.get('/api/sample.csv', (_req, res) => {
  res.type('text/csv').attachment('product_database.csv');
  fs.createReadStream(HOME_DB).pipe(res);
});

// --- Reports ----------------------------------------------------------------
app.get('/api/reports', (_req, res) => res.json(listReports()));

app.get('/api/reports/:id', (req, res) => {
  const report = getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Not found' });
  res.json(report);
});

app.post('/api/reports', async (req, res) => {
  const { productIds = [], models = [], promptsPerProduct = 3, customPrompts = [], siteUrl = '' } = req.body ?? {};
  if (!productIds.length) return res.status(400).json({ error: 'Select at least one product' });
  if (!models.length) return res.status(400).json({ error: 'Select at least one AI model' });
  const unknown = models.filter((m) => !getProvider(m));
  if (unknown.length) return res.status(400).json({ error: `Unknown model(s): ${unknown.join(', ')}` });

  const products = getProductsByIds(productIds.map(Number));
  if (!products.length) return res.status(404).json({ error: 'Products not found' });

  const count = Math.max(0, Math.min(5, Number(promptsPerProduct) || 0));
  const custom = Array.isArray(customPrompts) ? customPrompts.slice(0, 10) : [];
  if (!count && !custom.some((c) => c.trim())) return res.status(400).json({ error: 'No prompts to run' });

  // Phase 3 is optional: only public sites, or this app's own demo store.
  let site = null;
  if (String(siteUrl).trim()) {
    try {
      const { url, isPrivate } = await checkTarget(String(siteUrl).trim(), [req.get('host')], DEMO_STORE);
      site = { siteUrl: url.href, siteIsPrivate: isPrivate };
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  const id = startReport(products, { models, promptsPerProduct: count, customPrompts: custom, ...site });
  res.status(202).json({ id });
});

// --- Web app (production) ---------------------------------------------------
// When the client has been built, serve it from this same server so the whole
// app deploys as one service. Unknown non-API GETs fall back to index.html so
// client-side routes like /reports/2 survive a page refresh.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  for (const p of describeProviders()) console.log(`  ${p.label.padEnd(8)} ${p.live ? `live (${p.model})` : 'simulated'}`);
});
