// Turns a free-text AI answer into a ranked list and locates the product in it.

const STOP = new Set(['the', 'a', 'an', 'and', 'with', 'for', 'of', 'in', 'by', 'gen', 'edition', 'inch']);

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s) {
  return normalize(s).split(' ').filter((t) => t && !STOP.has(t));
}

// Extracts "1. Foo Bar - reason" style entries (also handles "1)", "#1", bullets after headers).
export function parseRankedList(text) {
  const items = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*#?(\d{1,2})[.)]\s*(.+)$/);
    if (!m) continue;
    const rank = Number(m[1]);
    const body = m[2].replace(/\*\*|__|`/g, '').trim();
    // Item name = text before the first separator used for the reason.
    const name = body.split(/\s+[-–—]\s+|:\s/)[0].trim().replace(/[.:,]+$/, '');
    if (name) items.push({ rank, name, line: body });
  }
  // Keep the first run of a list (models sometimes add extra numbered sections).
  const seen = new Set();
  return items.filter((it) => (seen.has(it.rank) ? false : seen.add(it.rank)));
}

// Scores how well a list entry refers to the product (0..1).
export function matchScore(product, itemText) {
  const item = new Set(tokens(itemText));
  const brandTokens = tokens(product.brand);
  const nameTokens = tokens(product.name).filter((t) => !brandTokens.includes(t));
  if (!nameTokens.length) return 0;

  const nameHits = nameTokens.filter((t) => item.has(t)).length;
  const brandHit = brandTokens.length > 0 && brandTokens.every((t) => item.has(t));
  const ratio = nameHits / nameTokens.length;

  // Model numbers like "14", "x1", "m4" are strong identifiers — require them when present.
  const idTokens = nameTokens.filter((t) => /\d/.test(t));
  const idsOk = idTokens.every((t) => item.has(t));

  if (!idsOk) return brandHit ? 0.3 * ratio : 0;
  return brandHit ? 0.4 + 0.6 * ratio : 0.8 * ratio;
}

const MATCH_THRESHOLD = 0.75;

export function analyzeAnswer(product, text) {
  const list = parseRankedList(text);
  let best = null;
  for (const item of list) {
    const score = matchScore(product, item.name);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) best = { ...item, score };
  }
  const brandRe = new RegExp(`\\b${normalize(product.brand).replace(/ /g, '\\s+')}\\b`);
  const brandMentioned = brandRe.test(normalize(text));

  return {
    mentioned: Boolean(best),
    rank: best?.rank ?? null,
    matchedAs: best?.name ?? null,
    brandMentioned,
    listLength: list.length,
    competitors: list
      .filter((it) => it.rank !== best?.rank && !brandRe.test(normalize(it.name)))
      .map(({ rank, name }) => ({ rank, name })),
  };
}
