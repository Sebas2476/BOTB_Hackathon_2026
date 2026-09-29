import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { insertProducts, listProducts, getProductsByIds, deleteProduct, getReport, listReports } from './db.js';
import { parseCsv } from './csv.js';
import { describeProviders, getProvider } from './providers/index.js';
import { startReport } from './reportRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }));

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

app.delete('/api/products/:id', (req, res) => {
  if (!deleteProduct(Number(req.params.id))) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

app.get('/api/sample.csv', (_req, res) => {
  res.type('text/csv').attachment('sample-products.csv');
  fs.createReadStream(path.join(__dirname, '..', 'sample-data', 'products.csv')).pipe(res);
});

// --- Reports ----------------------------------------------------------------
app.get('/api/reports', (_req, res) => res.json(listReports()));

app.get('/api/reports/:id', (req, res) => {
  const report = getReport(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Not found' });
  res.json(report);
});

app.post('/api/reports', (req, res) => {
  const { productIds = [], models = [], promptsPerProduct = 3, customPrompts = [] } = req.body ?? {};
  if (!productIds.length) return res.status(400).json({ error: 'Select at least one product' });
  if (!models.length) return res.status(400).json({ error: 'Select at least one AI model' });
  const unknown = models.filter((m) => !getProvider(m));
  if (unknown.length) return res.status(400).json({ error: `Unknown model(s): ${unknown.join(', ')}` });

  const products = getProductsByIds(productIds.map(Number));
  if (!products.length) return res.status(404).json({ error: 'Products not found' });

  const count = Math.max(0, Math.min(5, Number(promptsPerProduct) || 0));
  const custom = Array.isArray(customPrompts) ? customPrompts.slice(0, 10) : [];
  if (!count && !custom.some((c) => c.trim())) return res.status(400).json({ error: 'No prompts to run' });

  const id = startReport(products, { models, promptsPerProduct: count, customPrompts: custom });
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
