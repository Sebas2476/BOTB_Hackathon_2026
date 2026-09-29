// Rule-based "AI visibility" (generative engine optimization) recommendations.
//
// Each rule reflects a signal AI assistants lean on when composing product rankings:
// review volume and sentiment, detailed/spec-rich content, crawlable product pages with
// structured data, third-party editorial coverage, and clear audience/price positioning.

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// Where each assistant tends to source shopping answers — used for model-specific gaps.
const MODEL_SOURCING = {
  claude: 'Claude leans heavily on its training data and editorial sources: get the product into reputable reviews, comparison articles, and buying guides.',
  chatgpt: 'ChatGPT’s shopping answers draw on Bing-indexed pages and high-authority reviews: verify the product page is indexed in Bing Webmaster Tools and listed in major retailer catalogs.',
  gemini: 'Gemini draws on Google’s index and Shopping Graph: add schema.org Product markup (price, rating, reviewCount) and keep a Google Merchant Center feed live.',
  copilot: 'Copilot grounds answers in Bing search results: submit the sitemap to Bing, list the product in Microsoft Merchant Center, and earn coverage on sites Bing ranks well.',
};

export function buildRecommendations(product, stats) {
  const recs = [];
  const add = (priority, category, title, detail, evidence) =>
    recs.push({ priority, category, title, detail, evidence });

  const reviews = product.review_count ?? 0;
  const contentLen = (product.description?.length ?? 0);
  const featureCount = product.features ? product.features.split(/[;|\n]/).filter((f) => f.trim()).length : 0;

  // --- Product-data signals ---------------------------------------------------
  if (reviews < 100) {
    add('high', 'Reviews', 'Build review volume',
      `This product has ${reviews} reviews. AI assistants favor products with a large, visible body of reviews (typically hundreds to thousands) because it signals real-world validation. It is likely ranking lower than competitors with more reviews.`,
      `review_count = ${reviews}`);
  } else if (reviews < 1000) {
    add('medium', 'Reviews', 'Grow reviews on major retailers',
      `${reviews} reviews is a reasonable base, but category leaders usually have thousands. Post-purchase review requests and syndication to Amazon, Best Buy, and similar retailers make the reviews visible to the sources AI models read.`,
      `review_count = ${reviews}`);
  }

  if (product.rating != null && product.rating < 4.3) {
    add(product.rating < 4.0 ? 'high' : 'medium', 'Reputation', 'Raise the average rating',
      `A ${product.rating}★ average falls below the ~4.3★+ typical of products AI assistants recommend. Analyze negative reviews for recurring issues, fix them, and respond publicly to complaints.`,
      `rating = ${product.rating}`);
  } else if (product.rating == null) {
    add('medium', 'Reputation', 'Publish a rating',
      'No rating is recorded for this product. Without visible ratings, models have no quality signal to cite.',
      'rating missing');
  }

  if (contentLen < 100 || featureCount < 4) {
    add('high', 'Content', 'Publish detailed, spec-rich product content',
      `The description is ${contentLen} characters long and lists ${featureCount} key features. Language models justify their picks with concrete specs (battery life, weight, dimensions, materials) and clear use cases. Thin pages give them nothing to quote.`,
      `description ${contentLen} chars, ${featureCount} features`);
  }

  if (!product.url) {
    add('high', 'Discoverability', 'Give the product a crawlable page',
      'No product URL is on file. Web-grounded assistants (Gemini, ChatGPT search, Copilot) can’t cite a product they can’t find. Publish an indexable page with schema.org Product markup.',
      'url missing');
  }

  // --- Ranking-result signals ------------------------------------------------
  const { visibilityScore, brandMentionRate, avgRank, byModel, byPrompt, topCompetitors } = stats;

  if (visibilityScore === 0 && brandMentionRate === 0) {
    add('high', 'Brand authority', 'Establish brand presence in AI answers',
      `Neither the product nor ${product.brand} appeared in any answer. Build brand authority with earned media (reviews in trusted publications), active community presence (Reddit, forums, YouTube reviews), and inclusion in "best of" roundups, which are the sources models learn from.`,
      '0% product and brand mention rate');
  } else if (visibilityScore === 0 && brandMentionRate > 0) {
    add('high', 'Product association', 'Connect this product to the brand’s recognition',
      `${product.brand} is mentioned in ${Math.round(brandMentionRate * 100)}% of answers, but this specific product never makes the list. Use one consistent product name everywhere and get the product itself into comparisons and roundups.`,
      `brand mentioned ${Math.round(brandMentionRate * 100)}%, product 0%`);
  }

  if (avgRank != null && avgRank > 3) {
    const leaders = topCompetitors.slice(0, 3).map((c) => c.name).join(', ');
    add('medium', 'Positioning', 'Differentiate against the category leaders',
      `The product appears but ranks low (average #${avgRank.toFixed(1)}). The products ranking above it most often are ${leaders}. Publish head-to-head comparison content that states where this product wins on price, specs, or audience fit.`,
      `avg rank ${avgRank.toFixed(1)}`);
  }

  // Model-specific gaps: visible on some models but not others.
  const models = Object.entries(byModel);
  const visibleSomewhere = models.some(([, m]) => m.mentionRate > 0);
  for (const [id, m] of models) {
    if (visibleSomewhere && m.mentionRate === 0) {
      add('medium', 'Model gap', `Close the gap on ${m.label}`,
        `The product appears on other assistants but never on ${m.label}. ${MODEL_SOURCING[id] ?? ''}`,
        `${m.label}: 0/${m.runs} prompts`);
    }
  }

  // Prompt-intent gaps (e.g., audience or budget queries).
  for (const p of byPrompt) {
    if (p.mentionRate === 0 && visibilityScore > 0) {
      if (p.promptId === 'audience' && product.target_audience) {
        add('medium', 'Audience fit', `Strengthen positioning for ${product.target_audience}`,
          `The product doesn’t appear for "${p.text}" even though it shows up for other queries. Create content aimed at ${product.target_audience} (use-case pages, testimonials, partnerships) so models associate the product with that audience.`,
          `0% on audience prompt`);
      } else if (p.promptId === 'budget') {
        add('low', 'Price positioning', 'Make the price-to-value story explicit',
          `The product is missing from budget-focused answers ("${p.text}"). Put price-to-performance claims, spec comparisons at this price point, and current pricing where they're easy to find.`,
          `0% on budget prompt`);
      }
    }
  }

  if (!recs.length) {
    add('low', 'Maintain', 'Maintain current visibility',
      'This product ranks well across the tested models. Keep reviews coming in, update specs and pricing, and re-run this report monthly to catch regressions early.',
      `visibility ${Math.round(visibilityScore * 100)}%`);
  }

  return recs.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
