# BOTB_Hackathon_2026: MAAT Intelligence

**See whether your products show up when shoppers ask AI assistants for recommendations.**

A business uploads its product catalog, selects products, and runs a report. The agent sends
realistic shopper prompts (e.g. *"What are the top 5 laptops for students?"*) to **Claude, ChatGPT,
Gemini, and Copilot**, parses each ranked answer, checks whether the product (and the brand) made
the list and at what position, and then recommends how to rank higher.

It also runs an **AI accuracy audit**: it asks each assistant what it knows about a product, cross-references
every claim (price, availability, condition, specs, features, rating) against your own product database, and
flags anything **missing** or **inaccurate**, with an AEO (answer engine optimization) explanation of why the
assistant got it wrong and how to fix it, plus a brief AI overview per product.

## Quick start

```bash
npm install
npm run dev          # API on :3001, web app on http://localhost:5173
```

1. **Products**: the home database (`server/sample-data/product_database.csv`, 20 products) loads automatically
   when the database is empty, or via **Load home database**. You can also upload your own CSV/JSON or add a product manually.
2. **Run report**: pick products and models, choose how many test prompts to run, and optionally add custom ones.
3. **Audit accuracy**: pick products and models; each model is asked about each product and its answer is fact-checked.
4. **Reports**: for visibility reports, see visibility score, average and best rank, mention rate per model, a prompt × model
   rank heatmap, the competitors that ranked instead, prioritized recommendations, and the raw AI answers. For audits,
   see the accuracy score, a field × model fact-check grid, AEO-explained flags, and the AI overview.

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
client/  Vite + React dashboard (react-router)
server/  Express API, SQLite via Node's built-in node:sqlite (Node 22.5+)
  src/prompts.js          shopper-style test prompt templates
  src/providers/          Claude / OpenAI / Gemini / Azure adapters + simulator
  src/analyzer.js         parses numbered lists, fuzzy-matches the product, extracts competitors
  src/recommendations.js  ranking-signal rules → prioritized recommendations
  src/reportRunner.js     runs prompts × models concurrently, aggregates stats; also runs audits
  src/audit.js            audit prompt, answer parsing, field-by-field fact check, AEO flags + overview
```

### API

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/products` | list / add (JSON object, JSON array, `{ csv }`, or `text/csv` body) |
| POST | `/api/products/home` | (re)load the home database; existing SKUs are skipped |
| DELETE | `/api/products/:id` | remove a product |
| GET | `/api/providers` | models and whether each is live or simulated |
| POST | `/api/reports` | `{ productIds, models, promptsPerProduct, customPrompts }` → `{ id }` (runs async) |
| POST | `/api/audits` | `{ productIds, models }` → `{ id }` (runs async; stored as a report with `type: "audit"`) |
| GET | `/api/reports`, `/api/reports/:id` | list / poll a report or audit |

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
