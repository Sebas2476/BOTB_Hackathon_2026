// Builds the consumer-style test prompts our agent sends to each AI model.
// These mirror how real shoppers phrase questions to assistants.

function priceCeiling(price) {
  if (!price) return null;
  const steps = [50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];
  return steps.find((s) => s >= price * 1.05) ?? Math.ceil(price / 1000) * 1000;
}

export function buildPrompts(product, count = 3, customPrompts = []) {
  const { category, target_audience: audience } = product;
  const year = new Date().getFullYear();
  const ceiling = priceCeiling(product.price);

  const templates = [
    audience && { id: 'audience', text: `What are the top 5 ${category} for ${audience}?` },
    { id: 'best', text: `What are the best ${category} in ${year}? Give me your top 5.` },
    ceiling && { id: 'budget', text: `What are the top 5 ${category} under $${ceiling}?` },
    { id: 'value', text: `Which ${category} offer the best value for money right now? List your top 5.` },
    { id: 'reliable', text: `What are the most reliable, highly reviewed ${category}? Top 5 please.` },
  ].filter(Boolean);

  const generated = templates.slice(0, Math.max(0, count));
  const custom = customPrompts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i) => ({
      id: `custom-${i + 1}`,
      text: t
        .replaceAll('{category}', category)
        .replaceAll('{audience}', audience || 'everyday users')
        .replaceAll('{year}', String(year)),
    }));
  return [...generated, ...custom];
}

// Appended to every prompt so answers come back in a parseable ranked list,
// without naming or hinting at the product under test.
export const FORMAT_INSTRUCTION =
  'Answer as a numbered list (1., 2., 3., ...) where each line starts with the specific brand and model name, ' +
  'followed by " - " and a one-sentence reason.';
