// AI accuracy audit: asks a model what it knows about a product, then cross-references
// every claim against our own product database and flags missing or inaccurate facts.
// Each flag carries an AEO (answer engine optimization) explanation of why the answer
// engine likely got it wrong and what to publish so it gets it right.

import { normalize } from './analyzer.js';

// --- Audited fields ---------------------------------------------------------
// type drives the comparison; tol is relative (rel) or absolute (abs) tolerance for numbers.
// group picks the AEO explanation; severity is how much a wrong answer hurts a shopper.
export const AUDIT_FIELDS = [
  { key: 'price', label: 'Price', ask: 'price_usd', hint: 'number, current US price in USD', type: 'number', rel: 0.05, format: (v) => `$${Number(v).toFixed(2)}`, group: 'offer', severity: 'high', from: (p) => p.price },
  { key: 'availability', label: 'Availability', hint: '"in_stock" | "out_of_stock" | "preorder"', type: 'enum', group: 'offer', severity: 'high' },
  { key: 'condition', label: 'Condition', hint: '"new" | "refurbished" | "used"', type: 'enum', group: 'offer', severity: 'high' },
  { key: 'warranty_months', label: 'Warranty', hint: 'number of months', type: 'number', abs: 0, unit: 'mo', group: 'offer', severity: 'low' },
  { key: 'return_window_days', label: 'Return window', hint: 'number of days', type: 'number', abs: 0, unit: 'days', group: 'offer', severity: 'low' },
  { key: 'rating', label: 'Average rating', ask: 'rating_average', hint: 'number out of 5', type: 'number', abs: 0.2, unit: '★', group: 'reputation', severity: 'medium', from: (p) => p.rating },
  { key: 'review_count', label: 'Review count', hint: 'number', type: 'number', rel: 0.25, group: 'reputation', severity: 'low', from: (p) => p.review_count },
  { key: 'processor', label: 'Processor', hint: 'string', type: 'text', group: 'specs', severity: 'medium' },
  { key: 'ram_gb', label: 'RAM', hint: 'number, GB', type: 'number', abs: 0, unit: 'GB', group: 'specs', severity: 'medium' },
  { key: 'storage_gb', label: 'Storage', hint: 'number, GB', type: 'number', abs: 0, unit: 'GB', group: 'specs', severity: 'medium' },
  { key: 'operating_system', label: 'Operating system', hint: 'string', type: 'text', group: 'specs', severity: 'medium' },
  { key: 'screen_inches', label: 'Screen size', hint: 'number, inches', type: 'number', abs: 0.15, unit: '"', group: 'specs', severity: 'medium' },
  { key: 'display_resolution', label: 'Display resolution', hint: 'string "WIDTHxHEIGHT"', type: 'resolution', group: 'specs', severity: 'medium' },
  { key: 'battery_hours', label: 'Battery life', hint: 'number, hours', type: 'number', rel: 0.15, unit: 'h', group: 'specs', severity: 'medium' },
  { key: 'weight_kg', label: 'Weight', hint: 'number, kg', type: 'number', rel: 0.1, unit: 'kg', group: 'specs', severity: 'low' },
  { key: 'connectivity', label: 'Connectivity', hint: 'array of strings, e.g. ["Wi-Fi","Bluetooth","5G"]', type: 'list', group: 'features', severity: 'medium' },
  { key: 'ports', label: 'Ports', hint: 'array of strings', type: 'list', group: 'features', severity: 'low' },
  { key: 'noise_cancellation', label: 'Noise cancellation', hint: 'boolean', type: 'bool', group: 'features', severity: 'medium' },
  { key: 'water_resistance', label: 'Water resistance', hint: 'IP rating string such as "IPX4", or "none"', type: 'text', group: 'features', severity: 'medium' },
];

const askKey = (f) => f.ask ?? f.key;

// Our value for a field, or undefined when the database has nothing to check against.
export function ourValue(product, field) {
  const v = field.from ? field.from(product) : product.specs?.[field.key];
  if (v == null || v === '' || /^not_applicable/.test(String(v))) return undefined;
  return v;
}

export function auditableFields(product) {
  return AUDIT_FIELDS.filter((f) => ourValue(product, f) !== undefined);
}

export const productLabel = (p) => (p.specs?.model ? `${p.brand} ${p.specs.model}` : p.name);
const singular = (category) => category.replace(/ies$/, 'y').replace(/(?<!s)s$/, '');

// --- Prompt -----------------------------------------------------------------
export function buildAuditPrompt(product) {
  const fields = auditableFields(product);
  const keys = fields.map((f) => `  "${askKey(f)}": ${f.hint}`).join(',\n');
  return `Tell me about the ${productLabel(product)} ${singular(product.category)}.

First write a 2-3 sentence overview for a shopper. Then give its details as a JSON object in a \`\`\`json code block with these keys:
{
${keys}
}`;
}

// --- Parsing ----------------------------------------------------------------
export function parseAuditAnswer(text) {
  const src = String(text ?? '');
  const fenced = src.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const start = src.indexOf('{');
  const end = src.lastIndexOf('}');
  const raw = fenced?.[1] ?? (start >= 0 && end > start ? src.slice(start, end + 1) : null);
  const overview = (fenced ? src.slice(0, fenced.index) : start >= 0 ? src.slice(0, start) : src).trim();
  if (!raw) return { overview, data: null };
  try {
    return { overview, data: JSON.parse(raw) };
  } catch {
    return { overview, data: null };
  }
}

// --- Comparison -------------------------------------------------------------
const num = (v) => {
  if (typeof v === 'number') return v;
  const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const CANON = [
  [/3\.5\s*mm|headphone jack|\baux\b/, '3.5mm'], [/usb[\s-]?c|type[\s-]?c|thunderbolt/, 'usb-c'],
  [/usb[\s-]?a/, 'usb-a'], [/hdmi/, 'hdmi'], [/wi[\s-]?fi|wlan|802\.11/, 'wi-fi'], [/bluetooth/, 'bluetooth'],
  [/\b5g\b/, '5g'], [/\b4g\b|lte/, 'lte'], [/\bwired\b|cable/, 'wired'], [/nfc/, 'nfc'],
];
const canonItem = (s) => {
  const t = String(s).toLowerCase();
  return CANON.find(([re]) => re.test(t))?.[1] ?? normalize(t);
};
const toList = (v) => (Array.isArray(v) ? v : String(v).split(/[;,]/)).map((x) => String(x).trim()).filter(Boolean);

const ENUMS = {
  availability: [[/pre[\s_-]?order/, 'preorder'], [/out|unavailable|sold/, 'out_of_stock'], [/in[\s_-]?stock|available/, 'in_stock']],
  condition: [[/refurb|renew/, 'refurbished'], [/used|pre-?owned/, 'used'], [/new/, 'new']],
};
const canonEnum = (key, v) => ENUMS[key]?.find(([re]) => re.test(String(v).toLowerCase()))?.[1] ?? normalize(v);

const toBool = (v) => {
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (/^(true|yes|y|1|anc|active)/.test(s)) return true;
  if (/^(false|no|n|0|none)/.test(s)) return false;
  return null;
};

const resolution = (v) => {
  const m = String(v).match(/(\d{3,4})\s*[x×*]\s*(\d{3,4})/);
  return m ? [Number(m[1]), Number(m[2])].sort((a, b) => b - a).join('x') : null;
};

// Returns { status: accurate | inaccurate | missing | incomplete, note }
export function compareField(field, ours, theirs) {
  if (theirs == null || theirs === '' || (Array.isArray(theirs) && !theirs.length)) {
    return { status: 'missing', note: 'The model gave no value.' };
  }
  switch (field.type) {
    case 'number': {
      const a = num(ours);
      const b = num(theirs);
      if (b == null) return { status: 'inaccurate', note: 'unreadable value' };
      const diff = Math.abs(a - b);
      const ok = field.rel != null ? diff <= Math.abs(a) * field.rel : diff <= (field.abs ?? 0) + 1e-9;
      if (ok) return { status: 'accurate' };
      const pctOff = a ? Math.round((diff / Math.abs(a)) * 100) : null;
      return { status: 'inaccurate', note: pctOff != null ? `off by ${pctOff}%` : null };
    }
    case 'enum':
      return canonEnum(field.key, ours) === canonEnum(field.key, theirs)
        ? { status: 'accurate' } : { status: 'inaccurate' };
    case 'bool': {
      const b = toBool(theirs);
      if (b == null) return { status: 'inaccurate', note: 'unreadable value' };
      return b === toBool(ours) ? { status: 'accurate' } : { status: 'inaccurate', note: b ? 'claims a feature the product does not have' : 'denies a feature the product has' };
    }
    case 'resolution':
      return resolution(ours) === resolution(theirs)
        ? { status: 'accurate' } : { status: 'inaccurate' };
    case 'list': {
      const ourItems = toList(ours);
      const theirItems = toList(theirs);
      const ourCanon = ourItems.map(canonItem);
      const theirCanon = theirItems.map(canonItem);
      const extra = theirItems.filter((t) => !ourCanon.includes(canonItem(t)));
      const missing = ourItems.filter((o) => !theirCanon.includes(canonItem(o)));
      if (extra.length) return { status: 'inaccurate', note: `adds ${extra.join(', ')}` };
      if (missing.length) return { status: 'incomplete', note: `leaves out ${missing.join(', ')}` };
      return { status: 'accurate' };
    }
    default: {
      const a = normalize(ours);
      const b = normalize(theirs);
      return a === b || (b && a.includes(b)) || (a && b.includes(a))
        ? { status: 'accurate' } : { status: 'inaccurate' };
    }
  }
}

export function formatValue(field, v) {
  if (v == null || v === '') return null;
  if (field.format) return field.format(num(v) ?? v);
  if (field.type === 'bool') return toBool(v) ? 'Yes' : 'No';
  if (field.type === 'list') return toList(v).join(', ');
  if (field.type === 'enum') return canonEnum(field.key, v).replace(/_/g, ' ');
  if (field.key === 'review_count') return Number(num(v)).toLocaleString('en-US');
  return field.unit ? `${v} ${field.unit}`.replace(' "', '"').replace(' ★', '★') : String(v);
}

// The model is not asked whether it knows the product (that would change how it answers),
// so recognition is read from the answer itself: it gave facts and didn't disclaim the product.
const UNFAMILIAR = /(don'?t|do not|couldn'?t|could not|can'?t|cannot)\s+(have|find|locate|verify|confirm)\s+(any\s+|reliable\s+|specific\s+)*(information|details|data|record)|not (familiar|aware of)|unfamiliar with|no (reliable |specific )?information (about|on)/i;

// Audits one model answer about one product.
export function auditAnswer(product, text) {
  const { overview, data } = parseAuditAnswer(text);
  const fields = auditableFields(product).map((f) => {
    const ours = ourValue(product, f);
    const theirs = data ? data[askKey(f)] ?? null : null;
    const { status, note } = data ? compareField(f, ours, theirs) : { status: 'missing', note: 'No structured answer to check.' };
    return { key: f.key, label: f.label, ours: formatValue(f, ours), theirs: formatValue(f, theirs), status, note: note ?? null };
  });
  const answered = fields.filter((f) => f.status !== 'missing').length;
  return {
    overview,
    parsed: Boolean(data),
    recognized: answered > 0 && !UNFAMILIAR.test(overview),
    fields,
    accuracy: fields.length ? fields.filter((f) => f.status === 'accurate').length / fields.length : null,
  };
}

// --- AEO explanations -------------------------------------------------------
// Why an answer engine gets a kind of fact wrong or leaves it out, and what to publish.
const AEO = {
  offer: {
    inaccurate: 'Answer engines quote commercial details from cached pages, third-party retailer listings, and training data that can be months old. When your live offer is not published as structured, frequently crawled data, a stale or reseller value wins.',
    missing: 'The model found no machine-readable offer for this product, so it would rather say nothing than quote a number. Shoppers asking "how much" or "is it in stock" get no answer that points to you.',
    fix: 'Publish schema.org Product + Offer markup (price, priceCurrency, availability, itemCondition, hasMerchantReturnPolicy, warranty), keep Google Merchant Center and Microsoft Merchant Center feeds in sync, and state the value as plain text on the page, not only in an image or script.',
  },
  specs: {
    inaccurate: 'When a spec is not stated clearly in one authoritative place, models infer it from similar products, older model years, or the category norm, and state the guess with confidence.',
    missing: 'The spec is not written anywhere answer engines can extract it, such as a text spec table or an FAQ, so the model cannot answer spec questions about this product.',
    fix: 'Publish an HTML spec table (not a PDF or image) using the same field names shoppers search for, mirror it in schema.org additionalProperty, and add direct Q&A lines such as "How much RAM does it have? 8 GB." Keep retailer listings identical so every source agrees.',
  },
  features: {
    inaccurate: 'Models fill feature gaps with what is typical for the category (for example assuming 5G, noise cancellation, or water resistance). Without an explicit statement either way, the typical answer wins.',
    missing: 'Nothing the model can read says whether the product has this feature, so it leaves it out of comparisons and "which X has Y" answers.',
    fix: 'State features as explicit yes/no answers ("Noise cancellation: No", "Water resistance: IPX4") in an FAQ block with schema.org FAQPage markup, and list them the same way on every retailer page.',
  },
  reputation: {
    inaccurate: 'Ratings and review counts are aggregated from different retailers and snapshots, so models often quote an outdated or partial figure.',
    missing: 'No aggregate rating is exposed in a form the model can read, so it has no quality signal to cite for this product.',
    fix: 'Mark up reviews with schema.org AggregateRating (ratingValue, reviewCount), syndicate reviews to major retailers, and keep the headline rating visible as text.',
  },
};

const GROUP_LABELS = { offer: 'Offer', specs: 'Specs', features: 'Features', reputation: 'Reputation' };
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };
const lower = { high: 'medium', medium: 'low', low: 'low' };

function flagsFor(product, results, labels) {
  const flags = [];
  for (const field of auditableFields(product)) {
    const perModel = results
      .filter((r) => !r.error)
      .map((r) => ({ ...r.fields.find((f) => f.key === field.key), model: r.model, label: labels[r.model] }))
      .filter((m) => m.status && m.status !== 'accurate');
    if (!perModel.length) continue;

    const wrong = perModel.filter((m) => m.status === 'inaccurate');
    const kind = wrong.length ? 'inaccurate' : 'missing';
    const shown = wrong.length ? wrong : perModel;
    const names = shown.map((m) => m.label).join(', ');
    const ours = formatValue(field, ourValue(product, field));
    const one = shown.length === 1;
    const title = wrong.length
      ? `${field.label}: ${names} ${one ? 'states' : 'state'} the wrong value`
      : `${field.label}: ${names} ${perModel.some((m) => m.status === 'incomplete') ? (one ? 'leaves out details' : 'leave out details') : (one ? "doesn't know it" : "don't know it")}`;

    flags.push({
      field: field.key,
      kind,
      priority: kind === 'inaccurate' ? field.severity : lower[field.severity],
      category: `${kind === 'inaccurate' ? 'Inaccurate' : 'Missing'} · ${GROUP_LABELS[field.group]}`,
      title,
      detail: AEO[field.group][kind],
      fix: AEO[field.group].fix,
      ours,
      claims: shown.map((m) => ({ model: m.label, value: m.theirs })),
      evidence: [`Ours: ${ours}`, ...shown.map((m) => `${m.label}: ${m.theirs ?? 'no answer'}${m.note && m.status !== 'missing' ? ` (${m.note})` : ''}`)].join(' · '),
    });
  }
  return flags.sort((a, b) => SEVERITY_RANK[a.priority] - SEVERITY_RANK[b.priority] || (a.kind === 'inaccurate' ? -1 : 1));
}

function entityFlag(product, results, labels) {
  const unknown = results.filter((r) => !r.error && !r.recognized);
  if (!unknown.length) return null;
  return {
    field: 'entity',
    kind: 'missing',
    priority: 'high',
    category: 'Missing · Entity',
    title: `${unknown.map((r) => labels[r.model]).join(', ')} ${unknown.length === 1 ? "doesn't" : "don't"} recognize ${productLabel(product)}`,
    detail: 'The answer engine has no reliable knowledge of this product as a distinct entity, so it cannot recommend or describe it and will substitute better-known competitors. This is the root cause behind most of the missing fields.',
    fix: 'Build entity signals: one consistent product name everywhere, a canonical product page with schema.org Product (brand, sku, gtin, sameAs links), listings on major retailers, and coverage in reviews and buying guides the models learn from.',
    evidence: `${unknown.length} of ${results.filter((r) => !r.error).length} models did not recognize the product`,
  };
}

// --- Summary ----------------------------------------------------------------
export function summarizeAudit(product, results, models, labels) {
  const ok = results.filter((r) => !r.error);
  const cells = ok.flatMap((r) => r.fields);
  const count = (s) => cells.filter((c) => c.status === s).length;
  const fields = auditableFields(product);

  const byModel = {};
  for (const id of models) {
    const r = results.find((x) => x.model === id);
    const fs = r?.fields ?? [];
    byModel[id] = {
      label: labels[id],
      live: r?.live ?? false,
      error: r?.error ?? null,
      recognized: r?.recognized ?? false,
      accuracy: r?.accuracy ?? null,
      coverage: fs.length ? fs.filter((f) => f.status !== 'missing').length / fs.length : null,
      inaccurate: fs.filter((f) => f.status === 'inaccurate').length,
      missing: fs.filter((f) => f.status === 'missing' || f.status === 'incomplete').length,
    };
  }

  const matrix = fields.map((f) => ({
    key: f.key,
    label: f.label,
    ours: formatValue(f, ourValue(product, f)),
    cells: Object.fromEntries(models.map((m) => {
      const r = results.find((x) => x.model === m);
      if (!r || r.error) return [m, { status: 'error' }];
      const c = r.fields.find((x) => x.key === f.key);
      return [m, { status: c.status, theirs: c.theirs, note: c.note }];
    })),
  }));

  const entity = entityFlag(product, results, labels);
  const flags = [...(entity ? [entity] : []), ...flagsFor(product, results, labels)];

  return {
    product,
    fieldsAudited: fields.length,
    checks: cells.length,
    accurate: count('accurate'),
    inaccurate: count('inaccurate'),
    missing: count('missing') + count('incomplete'),
    accuracyScore: cells.length ? count('accurate') / cells.length : null,
    recognizedBy: ok.filter((r) => r.recognized).length,
    modelsChecked: ok.length,
    errors: results.length - ok.length,
    byModel,
    matrix,
    flags,
  };
}

// Brief rule-based overview, used when no Claude key is configured.
export function overviewText(s) {
  const name = productLabel(s.product);
  if (!s.checks) return `No AI answers could be checked for ${name}.`;
  const acc = Math.round((s.accuracyScore ?? 0) * 100);
  const parts = [
    `Across ${s.modelsChecked} AI assistant${s.modelsChecked === 1 ? '' : 's'}, ${acc}% of the facts stated about ${name} matched your database (${s.accurate} of ${s.checks} checks). ${s.inaccurate} were wrong and ${s.missing} were missing or incomplete.`,
  ];
  if (s.recognizedBy < s.modelsChecked) {
    parts.push(`${s.modelsChecked - s.recognizedBy} assistant${s.modelsChecked - s.recognizedBy === 1 ? " doesn't" : "s don't"} recognize the product at all, which points to weak entity signals rather than any single missing spec.`);
  }
  const worst = s.flags.find((f) => f.kind === 'inaccurate' && f.priority === 'high') ?? s.flags.find((f) => f.kind === 'inaccurate');
  if (worst) {
    const field = AUDIT_FIELDS.find((f) => f.key === worst.field).label.toLowerCase();
    const said = worst.claims.map((c) => `${c.model} says ${c.value}`).join(', ');
    parts.push(`The most damaging error is the ${field}: your database says ${worst.ours}, but ${said}.`);
  }
  if (s.flags.length) {
    parts.push('From an AEO standpoint, the fix is to publish these facts in one structured, crawlable source (spec table, schema.org Product/Offer/FAQ markup, synced merchant feeds) so answer engines quote your data instead of guessing.');
  } else {
    parts.push('Every checked fact matched. Keep structured data and merchant feeds current and re-run this audit after price or spec changes.');
  }
  return parts.join(' ');
}

export function overviewPrompt(s) {
  return `You are an answer engine optimization (AEO) analyst. We asked AI assistants about the product below and compared their answers with the manufacturer's database.

Product: ${productLabel(s.product)} (${s.product.category})
Accuracy: ${Math.round((s.accuracyScore ?? 0) * 100)}% of ${s.checks} checks; ${s.inaccurate} inaccurate, ${s.missing} missing. Recognized by ${s.recognizedBy} of ${s.modelsChecked} assistants.
Flags:
${s.flags.map((f) => `- [${f.priority}] ${f.title}. ${f.evidence}`).join('\n') || '- none'}

Write a brief overview (3-4 sentences, plain prose, no lists or headings) explaining what the assistants get wrong or leave out, the likely AEO reasons, and the single most important fix.`;
}
