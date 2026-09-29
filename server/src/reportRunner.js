import { buildPrompts, FORMAT_INSTRUCTION } from './prompts.js';
import { askModel, getProvider } from './providers/index.js';
import { anthropic } from './providers/anthropic.js';
import { analyzeAnswer } from './analyzer.js';
import { buildRecommendations } from './recommendations.js';
import { createReport, updateReportProgress, completeReport, failReport } from './db.js';

const CONCURRENCY = 4;

async function runPool(tasks, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      await worker(tasks[i], i);
    }
  });
  await Promise.all(runners);
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function summarizeProduct(product, results, models, prompts) {
  const ok = results.filter((r) => !r.error);
  const ranks = ok.filter((r) => r.mentioned).map((r) => r.rank);
  const rate = (rs, key) => (rs.length ? rs.filter((r) => r[key]).length / rs.length : 0);

  const byModel = {};
  for (const id of models) {
    const rs = ok.filter((r) => r.model === id);
    const rks = rs.filter((r) => r.mentioned).map((r) => r.rank);
    byModel[id] = {
      label: getProvider(id).label,
      live: results.find((r) => r.model === id)?.live ?? false,
      runs: rs.length,
      mentions: rks.length,
      mentionRate: rate(rs, 'mentioned'),
      brandMentionRate: rate(rs, 'brandMentioned'),
      avgRank: mean(rks),
      bestRank: rks.length ? Math.min(...rks) : null,
    };
  }

  const byPrompt = prompts.map((p) => {
    const rs = ok.filter((r) => r.promptId === p.id);
    return {
      promptId: p.id,
      text: p.text,
      mentionRate: rate(rs, 'mentioned'),
      ranks: Object.fromEntries(models.map((m) => {
        const r = rs.find((x) => x.model === m);
        return [m, r ? (r.error ? 'error' : r.rank) : null];
      })),
    };
  });

  const compCounts = new Map();
  for (const r of ok) {
    for (const c of r.competitors ?? []) {
      const key = c.name.toLowerCase();
      const entry = compCounts.get(key) ?? { name: c.name, mentions: 0, rankSum: 0 };
      entry.mentions++;
      entry.rankSum += c.rank;
      compCounts.set(key, entry);
    }
  }
  const topCompetitors = [...compCounts.values()]
    .map((c) => ({ name: c.name, mentions: c.mentions, avgRank: c.rankSum / c.mentions }))
    .sort((a, b) => b.mentions - a.mentions || a.avgRank - b.avgRank)
    .slice(0, 8);

  const stats = {
    runs: ok.length,
    errors: results.length - ok.length,
    visibilityScore: rate(ok, 'mentioned'),
    brandMentionRate: rate(ok, 'brandMentioned'),
    avgRank: mean(ranks),
    bestRank: ranks.length ? Math.min(...ranks) : null,
    byModel,
    byPrompt,
    topCompetitors,
  };
  return { product, ...stats, recommendations: buildRecommendations(product, stats) };
}

// Optional: when a Claude key is configured, ask Claude for tailored strategy notes.
async function aiInsights(summary) {
  if (!anthropic.isConfigured()) return null;
  const { product, visibilityScore, avgRank, byModel, topCompetitors } = summary;
  const prompt = `You are an expert in generative engine optimization (how AI assistants choose which products to recommend).
Product: ${JSON.stringify(product)}
Results across AI assistants: visibility ${Math.round(visibilityScore * 100)}%, average rank ${avgRank ?? 'n/a'}.
Per model: ${JSON.stringify(byModel)}
Competitors that ranked: ${topCompetitors.map((c) => c.name).join(', ')}
Give 3 specific, actionable recommendations to improve this product's ranking in AI assistant answers, each 1-2 sentences, as a plain numbered list.`;
  try {
    return await anthropic.ask(prompt);
  } catch (err) {
    return `AI insights unavailable: ${err.message}`;
  }
}

export function startReport(products, { models, promptsPerProduct = 3, customPrompts = [] }) {
  const plan = products.map((product) => ({
    product,
    prompts: buildPrompts(product, promptsPerProduct, customPrompts),
  }));
  const tasks = plan.flatMap(({ product, prompts }) =>
    prompts.flatMap((prompt) => models.map((model) => ({ product, prompt, model }))));

  const config = {
    productIds: products.map((p) => p.id),
    productNames: products.map((p) => p.name),
    models,
    promptsPerProduct,
    customPrompts,
  };
  const reportId = createReport(config, tasks.length);

  (async () => {
    const results = [];
    let done = 0;
    await runPool(tasks, CONCURRENCY, async ({ product, prompt, model }) => {
      const base = { productId: product.id, promptId: prompt.id, prompt: prompt.text, model };
      try {
        const { text, live } = await askModel(model, `${prompt.text}\n\n${FORMAT_INSTRUCTION}`, product);
        results.push({ ...base, live, ...analyzeAnswer(product, text), response: text });
      } catch (err) {
        results.push({ ...base, live: true, error: err.message });
      }
      done++;
      updateReportProgress(reportId, done, results);
    });

    const productSummaries = [];
    for (const { product, prompts } of plan) {
      const summary = summarizeProduct(product, results.filter((r) => r.productId === product.id), models, prompts);
      summary.aiInsights = await aiInsights(summary);
      productSummaries.push(summary);
    }
    completeReport(reportId, results, { products: productSummaries });
  })().catch((err) => failReport(reportId, err.stack || err));

  return reportId;
}
