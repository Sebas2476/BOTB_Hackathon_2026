# BOTB_Hackathon_2026: MAAT Intelligence

**See whether your products show up when shoppers ask AI assistants for recommendations.**

A business picks products from its catalog and runs **one report with three phases**:

1. **Ranking results**: realistic shopper prompts (e.g. *"What are the top 5 laptops for students?"*) go to
   **Claude, ChatGPT, Gemini, and Copilot**; each ranked answer is parsed to see whether the product (and brand)
   made the list and at what position.
2. **Accuracy audit**: each assistant is asked about each product, the way a shopper would, and every claim
   (price, availability, condition, specs, features, rating) is cross-referenced against the product database.
   Missing and inaccurate facts are flagged with an AEO explanation.
3. **Website crawl & Maat**: the client's website is crawled following Googlebot's robots.txt rules, and Google
   PageSpeed Insights (Lighthouse) supplies Google's rendered view. **Maat**, MAAT's AEO & GEO expert, checks the
   crawl against the 48-rule AEO/GEO rulebook (`server/sample-data/aeo_geo_rulebook.csv`) using the product
   database as the manufacturer's truth, links site problems to what the assistants got wrong in phases 1–2, and
   recommends prioritized fixes.
