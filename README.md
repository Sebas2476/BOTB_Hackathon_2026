# BOTB_Hackathon_2026: MAAT Intelligence

**See whether your products show up when shoppers ask AI assistants for recommendations.**

A business picks products from its catalog and runs **one report with three phases**:

1. **Ranking results**: realistic shopper prompts (e.g. *"What are the top 5 laptops for students?"*) go to
   **Claude, ChatGPT, Gemini, and Copilot**; each ranked answer is parsed to see whether the product (and brand)
   made the list and at what position.
2. **Accuracy audit**: each assistant is asked about each product, the way a shopper would, and every claim
   (price, availability, condition, specs, features, rating) is cross-referenced against the product database.
   Missing and inaccurate facts are flagged with an AEO explanation.
3. **Website crawl & Maat**: the client's website is crawled following Googlebot's robots.txt rules, and Google
   PageSpeed Insights (Lighthouse) supplies Google's rendered view. **Maat**, MAAT's AEO & GEO expert, checks the
   crawl against the 48-rule AEO/GEO rulebook (`server/sample-data/aeo_geo_rulebook.csv`) using the product
   database as the manufacturer's truth, links site problems to what the assistants got wrong in phases 1–2, and
   recommends prioritized fixes.

## Quick start

```bash
npm install
npm run dev          # API on :3001, site on http://localhost:5173
```

The site has two parts: the marketing homepage at `/` (`client/index.html`, a standalone page whose demo
widgets use illustrative sample data) and the working app at `/app` (`client/app.html` + React). The homepage's
**Run an AI Product Audit**, **Run Your First MAAT Audit**, and **Sign In** buttons open the app; there are no
user accounts yet, so Sign In goes straight in. Old links such as `/reports/5` redirect to `/app/reports/5`.

1. **Products**: the home database (`server/sample-data/product_database.csv`, 20 products) loads automatically
   when the database is empty, or via **Load home database**. You can also upload your own CSV/JSON or add a product manually.
2. **Run report**: pick products and models, choose how many test prompts to run, optionally add custom ones, and
   enter the client's website (defaults to the built-in demo store).
3. **Reports**: one page per report, in order: ranking (visibility, ranks, heatmap, competitors), accuracy audit
   (fact-check grid, AEO flags, AI overview), then the website section (Maat's overview and recommendations, the
   product's page vs. the database, rulebook results, Google's view, and the crawl log).

### Demo store

`/demo-store` is a small storefront generated from the product database so the crawl has a site to inspect. Most
pages are correct; a set of deliberate AEO/GEO mistakes (wrong price, stale availability, noindex, wrong canonical,
rating markup mismatch, orphan page, JS-only page, crawler blocked in robots.txt, and so on) is listed in
`DEFECTS` in `server/src/demoStore.js`. Google PageSpeed can only reach public URLs, so Google's view appears when
the report runs on the deployed site.

### Maat

With `ANTHROPIC_API_KEY` set, Maat uses Claude with the rulebook's guidance as its expert context, writes the
overview and recommendations, and judges the rules that need reading comprehension (use cases, comparisons, claim
sources). Without a key, Maat runs in rulebook mode: recommendations come straight from each failing rule's
correction, and those semantic rules stay "Not assessed". Either way Maat follows the rulebook's result states
(Pass, Fail, Needs verification, Opportunity, Not applicable, Not assessed) and never prescribes what GUIDE-09 excludes.

### Real vs. simulated models

With no API keys configured, every model runs in **simulated** mode, which returns deterministic, realistic
answers so the whole flow is demo-able offline. To query the real models:

```bash
cp server/.env.example server/.env   # then fill in the keys you have
```

| Model   | Env vars |
|---------|----------|
| Claude  | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| ChatGPT | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Gemini  | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Copilot | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` |

Microsoft Copilot has no public consumer API, so an Azure OpenAI deployment is used as the closest proxy.
Each provider falls back to simulation independently, so you can mix live and simulated models.
When a Claude key is set, reports also include "Claude's strategy notes" on top of the rule-based recommendations,
and audit overviews are written by Claude instead of the rule-based summary.

## Product data format

Required: `name` (or `model`, combined with brand), `brand`, `category` (normalized to plural, e.g. `laptops`).
Recommended: `price`, `rating`, `review_count`, `target_audience`, `url`, `description`, `features` (`;`-separated).
The home database's column names are also accepted: `product_id` (SKU; duplicates are skipped), `price_usd`,
`rating_average`, `intended_use`. Every other column (`ram_gb`, `battery_hours`, `availability`, `connectivity`, ...)
is stored as a product spec and checked by the accuracy audit.

## Architecture

```
client/  Vite: marketing homepage (index.html) + React app under /app (app.html, react-router)
server/  Express API, SQLite via Node's built-in node:sqlite (Node 22.5+)
  src/prompts.js          shopper-style test prompt templates
  src/providers/          Claude / OpenAI / Gemini / Azure adapters + simulator
  src/analyzer.js         parses numbered lists, fuzzy-matches the product, extracts competitors
  src/recommendations.js  ranking-signal rules → prioritized recommendations
  src/reportRunner.js     runs the three phases (ranking, accuracy audit, website + Maat) into one report
  src/audit.js            audit prompt, answer parsing, field-by-field fact check, AEO flags + overview
  src/crawler.js          website crawl (Googlebot robots rules), page extraction, Google PageSpeed view
  src/siteAudit.js        evaluates the crawl against the rulebook, with the product database as truth
  src/maat.js             Maat: AEO/GEO expert recommendations (Claude or rulebook mode)
  src/rulebook.js         loads the AEO/GEO rulebook: rules, sources, guidance
  src/demoStore.js        demo client storefront at /demo-store with deliberate defects
```

### API

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/products` | list / add (JSON object, JSON array, `{ csv }`, or `text/csv` body) |
| POST | `/api/products/home` | (re)load the home database; existing SKUs are skipped |
| DELETE | `/api/products/:id` | remove a product |
| GET | `/api/providers` | models and whether each is live or simulated |
| POST | `/api/reports` | `{ productIds, models, promptsPerProduct, customPrompts, siteUrl }` → `{ id }` (runs all phases async; `siteUrl` optional) |
| GET | `/api/reports`, `/api/reports/:id` | list / poll a report |
| GET | `/demo-store/...`, `/robots.txt` | demo client storefront and its robots.txt |

## Deploying to Render

The app deploys as a single Render web service: Express serves the API and the built React app.
`render.yaml` defines it (Blueprint), or set it up manually:

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Health check path:** `/api/health`
- **Env vars:** `NODE_VERSION=24`, plus any API keys from `server/.env.example`

Note: Render's free tier has no persistent disk, so the SQLite database resets on every
redeploy/restart. For persistent data, use a paid instance with a disk mounted at e.g. `/var/data`
and set `DB_PATH=/var/data/data.db`.
