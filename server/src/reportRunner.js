import { buildPrompts, FORMAT_INSTRUCTION } from './prompts.js';
import { askModel, getProvider } from './providers/index.js';
import { anthropic } from './providers/anthropic.js';
import { analyzeAnswer } from './analyzer.js';
import { buildRecommendations } from './recommendations.js';
import { auditableFields, auditAnswer, buildAuditPrompt, ourValue, overviewPrompt, overviewText, summarizeAudit } from './audit.js';
import { simulateAudit } from './providers/simulator.js';
import { crawlSite } from './crawler.js';
import { auditSite } from './siteAudit.js';
import { applySemanticReviews, consultMaat } from './maat.js';
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

// Phase 1: ask each model shopper-style questions and find where each product ranks.
async function runRanking(products, { models, promptsPerProduct, customPrompts }, tick) {
  const plan = products.map((product) => ({ product, prompts: buildPrompts(product, promptsPerProduct, customPrompts) }));
  const tasks = plan.flatMap(({ product, prompts }) => prompts.flatMap((prompt) => models.map((model) => ({ product, prompt, model }))));
  const results = [];
  await runPool(tasks, CONCURRENCY, async ({ product, prompt, model }) => {
    const base = { productId: product.id, promptId: prompt.id, prompt: prompt.text, model };
    try {
      const { text, live } = await askModel(model, `${prompt.text}\n\n${FORMAT_INSTRUCTION}`, product);
      results.push({ ...base, live, ...analyzeAnswer(product, text), response: text });
    } catch (err) {
      results.push({ ...base, live: true, error: err.message });
    }
    tick(results);
  });
  const summaries = [];
  for (const { product, prompts } of plan) {
    const summary = summarizeProduct(product, results.filter((r) => r.productId === product.id), models, prompts);
    summary.aiInsights = await aiInsights(summary);
    summaries.push(summary);
  }
  return { results, summaries };
}

// Phase 2: ask each model about each product, cross-reference its claims against our
// database, and explain every flag from an AEO standpoint.
async function runAudit(products, { models }, tick) {
  const labels = Object.fromEntries(models.map((m) => [m, getProvider(m).label]));
  const tasks = products.flatMap((product) => models.map((model) => ({ product, model })));
  const results = [];
  await runPool(tasks, CONCURRENCY, async ({ product, model }) => {
    const prompt = buildAuditPrompt(product);
    const base = { productId: product.id, model, prompt };
    const simulate = () => simulateAudit(model, product, auditableFields(product), (f) => ourValue(product, f));
    try {
      const { text, live } = await askModel(model, prompt, product, simulate);
      results.push({ ...base, live, ...auditAnswer(product, text), response: text });
    } catch (err) {
      results.push({ ...base, live: true, error: err.message });
    }
    tick(results);
  });
  const summaries = [];
  for (const product of products) {
    const summary = summarizeAudit(product, results.filter((r) => r.productId === product.id), models, labels);
    summary.overview = overviewText(summary);
    summary.overviewBy = 'rules';
    if (anthropic.isConfigured() && summary.checks) {
      try {
        summary.overview = (await anthropic.ask(overviewPrompt(summary))).trim();
        summary.overviewBy = 'claude';
      } catch {
        // keep the rule-based overview
      }
    }
    summaries.push(summary);
  }
  return { results, summaries };
}

// Phase 3: crawl the client's website, check it against the rulebook and the product
// database, and have Maat recommend AEO/GEO fixes informed by phases 1 and 2.
async function runSiteAudit(products, { siteUrl, isPrivate }, phases, onProgress) {
  const crawl = await crawlSite(siteUrl, { isPrivate, onProgress });
  onProgress(null, null, 'Maat is reviewing the findings');
  const site = auditSite(crawl, products);
  const maat = await consultMaat(site, { products, crawlPages: crawl.pages, phases });
  applySemanticReviews(site, maat.semanticReviews);
  return { ...site, maat };
}

const CRAWL_UNITS = 20; // share of the progress bar given to the crawl phase

export function startReport(products, { models, promptsPerProduct = 3, customPrompts = [], siteUrl = null, siteIsPrivate = false }) {
  const rankingTotal = products.reduce((n, p) => n + buildPrompts(p, promptsPerProduct, customPrompts).length, 0) * models.length;
  const auditTotal = products.length * models.length;
  const total = rankingTotal + auditTotal + (siteUrl ? CRAWL_UNITS : 0);
  const config = {
    productIds: products.map((p) => p.id),
    productNames: products.map((p) => p.name),
    models,
    promptsPerProduct,
    customPrompts,
    siteUrl,
  };
  const reportId = createReport(config, total, 'full');

  (async () => {
    const results = { ranking: [], audit: [] };
    const save = (done, phase) => updateReportProgress(reportId, done, results, phase);

    const ranking = await runRanking(products, { models, promptsPerProduct, customPrompts }, (rs) => {
      results.ranking = rs;
      save(rs.length, 'Ranking: asking AI models shopper questions');
    });
    const audit = await runAudit(products, { models }, (rs) => {
      results.audit = rs;
      save(rankingTotal + rs.length, 'Accuracy audit: checking what AI models say about each product');
    });

    let site = null;
    if (siteUrl) {
      const phases = {
        ranking: Object.fromEntries(ranking.summaries.map((s) => [s.product.id, s])),
        audit: Object.fromEntries(audit.summaries.map((s) => [s.product.id, s])),
      };
      try {
        site = await runSiteAudit(products, { siteUrl, isPrivate: siteIsPrivate }, phases, (crawled, queued, label) => {
          const frac = queued ? Math.min(1, crawled / queued) : 1;
          save(rankingTotal + auditTotal + Math.round(frac * (CRAWL_UNITS - 2)), label ?? `Website crawl: ${crawled} pages inspected`);
        });
      } catch (err) {
        site = { error: err.message, startUrl: siteUrl };
      }
    }

    const summary = {
      products: products.map((p) => ({
        product: p,
        ranking: ranking.summaries.find((s) => s.product.id === p.id),
        audit: audit.summaries.find((s) => s.product.id === p.id),
      })),
      site,
    };
    completeReport(reportId, results, summary);
  })().catch((err) => failReport(reportId, err.stack || err));

  return reportId;
}
