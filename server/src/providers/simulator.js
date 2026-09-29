// Simulated AI answers for providers without an API key.
//
// Output is deterministic per (model, prompt, product) and driven by the same
// signals our recommendation engine checks — review volume, rating, content
// depth, an indexable URL, audience fit — so demo reports behave plausibly:
// well-documented, well-reviewed products surface more often and rank higher.

const POOLS = [
  {
    match: /laptop|notebook|chromebook/i,
    items: [
      'Apple MacBook Air 13 (M4)', 'Dell XPS 13', 'Lenovo ThinkPad X1 Carbon', 'ASUS Zenbook 14 OLED',
      'HP Spectre x360 14', 'Acer Swift Go 14', 'Microsoft Surface Laptop 7', 'Lenovo IdeaPad Slim 5',
      'Framework Laptop 13',
    ],
  },
  {
    match: /earbud|headphone|earphone/i,
    items: [
      'Apple AirPods Pro 2', 'Sony WF-1000XM5', 'Bose QuietComfort Ultra Earbuds', 'Samsung Galaxy Buds3 Pro',
      'Jabra Elite 10', 'Anker Soundcore Liberty 4 NC', 'Nothing Ear',
    ],
  },
  {
    match: /coffee|espresso/i,
    items: [
      'Breville Bambino Plus', 'Nespresso Vertuo Next', 'Keurig K-Supreme', 'Technivorm Moccamaster KBGV',
      'Ninja Specialty Coffee Maker', 'OXO Brew 8-Cup',
    ],
  },
  {
    match: /phone/i,
    items: ['Apple iPhone 16', 'Samsung Galaxy S25', 'Google Pixel 9', 'OnePlus 13', 'Motorola Edge 2025', 'Nothing Phone (3)'],
  },
];

const GENERIC_BRANDS = ['Summit', 'Vertex', 'Orion', 'Apex', 'Lumen', 'Keystone', 'Northwind'];
const REASONS = [
  'consistently praised in reviews for build quality and reliability',
  'excellent value with strong performance for the price',
  'widely recommended by reviewers and owners alike',
  'standout battery life and well-rounded feature set',
  'a popular, proven choice with thousands of positive reviews',
  'strong specs and a reputation for long-term durability',
];

// Each model leans on slightly different evidence (loosely based on how they source answers).
const MODEL_AFFINITY = {
  claude: { reviews: 0.30, rating: 0.20, content: 0.35, url: 0.15 },
  chatgpt: { reviews: 0.40, rating: 0.25, content: 0.20, url: 0.15 },
  gemini: { reviews: 0.25, rating: 0.20, content: 0.25, url: 0.30 },
  copilot: { reviews: 0.35, rating: 0.30, content: 0.15, url: 0.20 },
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function pickCompetitors(category, rand) {
  const pool = POOLS.find((p) => p.match.test(category))?.items
    ?? GENERIC_BRANDS.map((b, i) => `${b} ${category.replace(/s$/, '')} ${['Pro', 'X', '2', 'Plus', 'One', 'Max', 'Air'][i]}`);
  return [...pool].sort(() => rand() - 0.5);
}

export function productStrength(product, modelId) {
  const w = MODEL_AFFINITY[modelId] ?? MODEL_AFFINITY.claude;
  const reviews = Math.min(1, Math.log10((product.review_count ?? 0) + 1) / 3.7); // ~5k reviews => 1
  const rating = product.rating ? Math.max(0, Math.min(1, (product.rating - 3.5) / 1.3)) : 0.2;
  const contentLen = (product.description?.length ?? 0) + (product.features?.length ?? 0);
  const content = Math.min(1, contentLen / 250);
  const url = product.url ? 1 : 0;
  return w.reviews * reviews + w.rating * rating + w.content * content + w.url * url;
}

export function simulateAnswer(modelId, prompt, product) {
  const rand = rng(hash(`${modelId}|${prompt}|${product.id}`));
  let strength = productStrength(product, modelId);
  if (product.target_audience && prompt.toLowerCase().includes(product.target_audience.toLowerCase())) {
    strength += 0.1;
  }

  const list = pickCompetitors(product.category, rand).slice(0, 5)
    .map((name) => `${name} - ${REASONS[Math.floor(rand() * REASONS.length)]}.`);

  const included = rand() < strength * 1.1;
  if (included) {
    const slot = Math.min(4, Math.floor(rand() * (1 + (1 - strength) * 5)));
    const brandPrefix = new RegExp(`^${product.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
    const displayName = `${product.brand} ${product.name.replace(brandPrefix, '')}`;
    list.splice(slot, 0, `${displayName} - ${REASONS[Math.floor(rand() * REASONS.length)]}.`);
    list.length = 5;
  }

  let text = `Here are my top picks:\n\n${list.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
  if (!included && rand() < strength * 0.5) {
    text += `\n\nHonorable mention: ${product.brand} also makes ${product.category} worth a look, though they have fewer reviews than the picks above.`;
  }
  return text;
}
