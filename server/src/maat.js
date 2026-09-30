// Maat: MAAT Intelligence's AEO & GEO subject-matter expert.
//
// Maat reads the crawl findings, the product database (the manufacturer's truth), and
// the ranking and accuracy results from phases 1 and 2, then recommends what to fix,
// strictly within the AEO/GEO rulebook. With a Claude key, Maat reasons with the
// rulebook as its expert context and also judges the rules that need semantic review;
// without one, it builds recommendations directly from the rulebook's corrections.

import { anthropic } from './providers/anthropic.js';
import { GUIDANCE, RULES } from './rulebook.js';

const ACTIONABLE = ['Fail', 'Needs verification', 'Opportunity'];
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2, Opportunity: 3 };

// Which accuracy-audit fields (phase 2) and ranking signals (phase 1) each rule explains.
const RULE_LINKS = {
  'OFFER-01': ['price'], 'DATA-02': ['price', 'availability', 'rating'], 'OFFER-03': ['availability'],
  'CONSISTENCY-01': ['condition', 'ram_gb', 'storage_gb', 'processor', 'screen_inches', 'battery_hours', 'weight_kg'],
  'REVIEW-01': ['rating'], 'POLICY-01': ['return_window_days'], 'POLICY-02': ['warranty_months'], 'CLAIM-01': ['battery_hours'],
  'IDENTITY-02': [], 'CONTENT-01': ['ram_gb', 'storage_gb', 'processor', 'battery_hours', 'connectivity'],
};
const VISIBILITY_RULES = new Set(['ACCESS-01', 'ACCESS-02', 'ACCESS-03', 'DISCOVERY-01', 'URL-01', 'RENDER-01']);

function priorityFor(rule) {
  if (rule.result === 'Opportunity' || rule.risk === 'Opportunity') return 'Opportunity';
  if (rule.result === 'Needs verification') return 'Medium';
  if (/^High/.test(rule.risk)) return 'High';
  if (/Medium.High/.test(rule.risk)) return 'High';
  if (/Medium|Contextual/.test(rule.risk)) return 'Medium';
  return 'Low';
}

// Connects a site finding to what AI assistants got wrong (phase 2) or how visible the product was (phase 1).
function crossPhase(rule, productIds, phases) {
  const notes = [];
  for (const id of productIds) {
    const audit = phases.audit?.[id];
    const ranking = phases.ranking?.[id];
    const name = audit?.product?.name ?? ranking?.product?.name;
    // Only the fields this product's finding is actually about.
    const details = rule.findings.filter((f) => f.product?.id === id).map((f) => f.detail.toLowerCase()).join(' ');
    const keys = RULE_LINKS[rule.id] ?? [];
    const relevant = keys.length === 1 ? keys : keys.filter((k) => {
      const label = audit?.matrix?.find((m) => m.key === k)?.label.toLowerCase();
      return label && details.includes(label);
    });
    for (const key of relevant) {
      const row = audit?.matrix?.find((m) => m.key === key);
      const wrong = row ? Object.entries(row.cells).filter(([, c]) => c.status === 'inaccurate') : [];
      if (wrong.length) {
        notes.push(`${name}: ${wrong.length} AI assistant${wrong.length > 1 ? 's' : ''} also stated the wrong ${row.label === row.label.toUpperCase() ? row.label : row.label.toLowerCase()} in the accuracy audit (${wrong.map(([, c]) => c.theirs).join(', ')} vs ${row.ours}).`);
        break;
      }
    }
    if (VISIBILITY_RULES.has(rule.id) && ranking) {
      notes.push(`${name}: appeared in ${Math.round(ranking.visibilityScore * 100)}% of AI shopping answers in the ranking phase.`);
    }
  }
  return notes;
}

function ruleBasedRecommendations(site, phases) {
  return site.rules.filter((r) => ACTIONABLE.includes(r.result)).map((r) => {
    const productIds = [...new Set(r.findings.map((f) => f.product?.id).filter(Boolean))];
    const names = [...new Set(r.findings.map((f) => f.product?.name ?? f.url).filter(Boolean))];
    const emerging = r.evidence === 'Emerging';
    return {
      priority: priorityFor(r),
      ruleIds: [r.id],
      title: r.result === 'Needs verification' ? `Verify: ${r.title.toLowerCase()}` : r.title,
      why: r.findings.slice(0, 3).map((f) => f.detail).join(' ') + (r.findings.length > 3 ? ` (+${r.findings.length - 3} more)` : ''),
      action: r.correction + (emerging ? ' Emerging strategy: expected AI benefit remains unverified.' : ''),
      benefit: r.benefit,
      evidenceClass: r.evidence,
      confidence: r.result === 'Needs verification' ? 'Low' : r.evidence === 'Established' ? 'High' : 'Medium',
      affected: names,
      crossPhase: crossPhase(r, productIds, phases),
    };
  }).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.affected.length - a.affected.length);
}

function ruleBasedOverview(site, recs, phases) {
  const fails = site.rules.filter((r) => r.result === 'Fail');
  const high = recs.filter((r) => r.priority === 'High');
  const linked = recs.flatMap((r) => r.crossPhase).length;
  const parts = [
    `I inspected ${site.pagesCrawled} pages of ${site.startUrl} and found ${site.productsFound} of ${site.productsInDb} catalog products. Against the ${site.rules.length}-rule AEO/GEO rulebook, ${fails.length} rules fail, ${site.counts['Needs verification']} need verification, and ${site.counts.Pass} pass within the assessed scope.`,
  ];
  if (high.length) parts.push(`The highest-risk issues are ${high.slice(0, 3).map((r) => r.title.toLowerCase()).join('; ')}.`);
  if (linked) parts.push(`${linked} of these site problems line up with what AI assistants got wrong or missed in phases 1 and 2, which makes them the most likely causes to fix first.`);
  parts.push('Every correction below comes from the rulebook, is scoped to what the crawl could observe, and should be confirmed against the product database before publishing.');
  return parts.join(' ');
}

// --- Claude mode ------------------------------------------------------------------
const SYSTEM = () => `You are Maat, the AEO (answer engine optimization) and GEO (generative engine optimization) subject-matter expert at MAAT Intelligence. You advise manufacturers who sell directly to consumers on how their website must present products so AI assistants and search engines describe and recommend them accurately.

You work strictly within this rulebook (${GUIDANCE['GUIDE-01']?.text}):

PURPOSE AND SCOPE
${GUIDANCE['GUIDE-02']?.text}

EVIDENCE CLASSES
${GUIDANCE['GUIDE-03']?.text}

DETECTION PROTOCOL
${GUIDANCE['GUIDE-04']?.text}

RESULT STATES
${GUIDANCE['GUIDE-05']?.text}

PRIORITY
${GUIDANCE['GUIDE-06']?.text}

NEVER PRESCRIBE
${GUIDANCE['GUIDE-09']?.text}

The product database you are given is the manufacturer's authoritative record. Never invent specifications, numbers, sources, quotes or testimonials. Label any Emerging-evidence recommendation with "Emerging strategy: expected AI benefit remains unverified." Do not promise ranking or traffic gains. Write plainly for a business owner.`;

function claudePrompt(site, recs, phases, pageExcerpts) {
  const failing = site.rules.filter((r) => ACTIONABLE.includes(r.result)).map((r) => ({
    rule: r.id, title: r.title, result: r.result, evidence: r.evidence, risk: r.risk, correction: r.correction,
    findings: r.findings.slice(0, 6).map((f) => `${f.product?.name ?? f.url}: ${f.detail}`),
  }));
  const semantic = site.rules.filter((r) => r.method === 'semantic').map((r) => ({ rule: r.id, title: r.title, failWhen: r.failWhen, correction: r.correction, exceptions: r.exceptions, evidence: r.evidence }));
  const phase = Object.values(phases.ranking ?? {}).map((s) => ({
    product: s.product.name,
    visibility: `${Math.round(s.visibilityScore * 100)}%`,
    avgRank: s.avgRank,
    aiAccuracy: phases.audit?.[s.product.id] ? `${Math.round((phases.audit[s.product.id].accuracyScore ?? 0) * 100)}%` : null,
    aiErrors: phases.audit?.[s.product.id]?.flags?.filter((f) => f.kind === 'inaccurate').slice(0, 4).map((f) => f.title),
  }));

  return `Website audited: ${site.startUrl} (${site.pagesCrawled} pages, ${site.productsFound}/${site.productsInDb} catalog products found).

PHASE 1 AND 2 RESULTS (how AI assistants rank and describe each product):
${JSON.stringify(phase)}

MACHINE-CHECKED RULE FINDINGS (phase 3 crawl):
${JSON.stringify(failing)}

RULES NEEDING YOUR SEMANTIC REVIEW:
${JSON.stringify(semantic)}

PRODUCT PAGE TEXT EXCERPTS (with the database record for each):
${pageExcerpts}

Respond with only a JSON object:
{
  "overview": "4-6 sentence expert overview connecting the website problems to the AI ranking and accuracy results",
  "recommendations": [
    { "priority": "High|Medium|Low|Opportunity", "ruleIds": ["RULE-ID"], "title": "short action title", "why": "what the evidence shows and why it matters for AI answers", "action": "specific correction for this site", "confidence": "High|Medium|Low", "affected": ["product or URL"] }
  ],
  "semanticReviews": [
    { "rule": "RULE-ID", "result": "Pass|Fail|Needs verification|Opportunity|Not assessed", "detail": "one sentence citing the page evidence", "products": ["product name"] }
  ]
}
Give at most 10 recommendations, highest priority first, merging findings that share a fix. Review every semantic rule listed.`;
}

function pageExcerpts(site, products, crawlPages) {
  return products.slice(0, 8).map((p) => {
    const info = site.products[p.id];
    if (!info?.found) return `- ${p.name}: no page found`;
    const page = crawlPages.find((x) => x.url === info.url);
    const record = { price: p.price, rating: p.rating, ...p.specs };
    return `- ${p.name} (${info.url})\n  DATABASE: ${JSON.stringify(record)}\n  PAGE: ${(page?.text ?? '').slice(0, 1200)}`;
  }).join('\n');
}

function parseJson(text) {
  const src = String(text);
  const start = src.indexOf('{');
  const end = src.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(src.slice(start, end + 1)); } catch { return null; }
}

// --- Entry point --------------------------------------------------------------------
export async function consultMaat(site, { products, crawlPages, phases }) {
  const fallbackRecs = ruleBasedRecommendations(site, phases);
  const base = {
    mode: 'rules',
    overview: ruleBasedOverview(site, fallbackRecs, phases),
    recommendations: fallbackRecs,
    semanticReviews: [],
  };
  if (!anthropic.isConfigured()) return base;

  try {
    const text = await anthropic.ask(claudePrompt(site, fallbackRecs, phases, pageExcerpts(site, products, crawlPages)), { system: SYSTEM(), maxTokens: 6000 });
    const data = parseJson(text);
    if (!data?.recommendations?.length) return { ...base, note: 'Maat could not produce a structured answer; showing rulebook-based recommendations.' };
    const recs = data.recommendations.map((r) => {
      const rules = (r.ruleIds ?? []).map((id) => RULES[id]).filter(Boolean);
      const emerging = rules.some((x) => x.evidence === 'Emerging');
      const matchingFallback = fallbackRecs.filter((f) => f.ruleIds.some((id) => (r.ruleIds ?? []).includes(id)));
      return {
        priority: PRIORITY_ORDER[r.priority] != null ? r.priority : 'Medium',
        ruleIds: r.ruleIds ?? [],
        title: r.title,
        why: r.why,
        action: r.action + (emerging && !/Emerging strategy/.test(r.action) ? ' Emerging strategy: expected AI benefit remains unverified.' : ''),
        benefit: rules[0]?.benefit ?? null,
        evidenceClass: rules[0]?.evidence ?? null,
        confidence: r.confidence ?? 'Medium',
        affected: r.affected ?? [],
        crossPhase: [...new Set(matchingFallback.flatMap((f) => f.crossPhase))],
      };
    }).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    return { mode: 'claude', overview: data.overview ?? base.overview, recommendations: recs, semanticReviews: data.semanticReviews ?? [] };
  } catch (err) {
    return { ...base, note: `Maat's language model was unavailable (${err.message}); showing rulebook-based recommendations.` };
  }
}

// Folds Maat's semantic judgments back into the rule list.
export function applySemanticReviews(site, reviews) {
  const allowed = new Set(['Pass', 'Fail', 'Needs verification', 'Opportunity', 'Not assessed']);
  for (const review of reviews ?? []) {
    const rule = site.rules.find((r) => r.id === review.rule && r.method === 'semantic');
    if (!rule || !allowed.has(review.result)) continue;
    rule.result = review.result;
    rule.method = 'semantic (Maat)';
    rule.findings = review.result === 'Pass' ? [] : [{ url: null, product: null, detail: review.detail, result: review.result, products: review.products ?? [] }];
    rule.affected = rule.findings.length;
  }
  const order = { Fail: 0, 'Needs verification': 1, Opportunity: 2, Pass: 3, 'Not applicable': 4, 'Not assessed': 5 };
  site.rules.sort((a, b) => order[a.result] - order[b.result]);
  site.counts = Object.fromEntries(Object.keys(order).map((s) => [s, site.rules.filter((r) => r.result === s).length]));
  return site;
}
