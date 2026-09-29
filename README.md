# BOTB_Hackathon_2026: RankSight

**See whether your products show up when shoppers ask AI assistants for recommendations.**

A business uploads its product catalog, selects products, and runs a report. The agent sends
realistic shopper prompts (e.g. *"What are the top 5 laptops for students?"*) to **Claude, ChatGPT,
Gemini, and Copilot**, parses each ranked answer, checks whether the product (and the brand) made
the list and at what position, and then recommends how to rank higher.

## Quick start

```bash
npm install
npm run dev          # API on :3001, web app on http://localhost:5173
```

1. **Products**: upload `server/sample-data/products.csv` (or your own CSV/JSON), or add a product manually.
2. **Run report**: pick products and models, choose how many test prompts to run, and optionally add custom ones.
3. **Reports**: view visibility score, average and best rank, mention rate per model, a prompt × model
   rank heatmap, the competitors that ranked instead, prioritized recommendations, and the raw AI answers.

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
When a Claude key is set, reports also include "Claude's strategy notes" on top of the rule-based recommendations.

## Product data format

Required: `name`, `brand`, `category` (plural, e.g. `laptops`).
Recommended: `price`, `rating`, `review_count`, `target_audience`, `url`, `description`, `features` (`;`-separated).

## Architecture

```
client/  Vite + React dashboard (react-router)
server/  Express API, SQLite via Node's built-in node:sqlite (Node 22.5+)
  src/prompts.js          shopper-style test prompt templates
  src/providers/          Claude / OpenAI / Gemini / Azure adapters + simulator
  src/analyzer.js         parses numbered lists, fuzzy-matches the product, extracts competitors
  src/recommendations.js  ranking-signal rules → prioritized recommendations
  src/reportRunner.js     runs prompts × models concurrently, aggregates stats
```

### API

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/products` | list / add (JSON object, JSON array, `{ csv }`, or `text/csv` body) |
| DELETE | `/api/products/:id` | remove a product |
| GET | `/api/providers` | models and whether each is live or simulated |
| POST | `/api/reports` | `{ productIds, models, promptsPerProduct, customPrompts }` → `{ id }` (runs async) |
| GET | `/api/reports`, `/api/reports/:id` | list / poll a report |
