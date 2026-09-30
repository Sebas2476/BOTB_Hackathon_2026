// Website crawl for the AEO/GEO phase. Crawls the way Googlebot is permitted to
// (robots.txt evaluated for the Googlebot user agent), records what the rulebook's
// shared detection protocol asks for (GUIDE-04), and asks Google's own PageSpeed
// Insights / Lighthouse service for its rendered SEO view of key pages.
//
// Requests identify honestly as MAAT: spoofing the Googlebot user agent would be
// blocked by many sites and, per the rulebook, proves nothing about real bot access.

import dns from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';

const USER_AGENT = 'Mozilla/5.0 (compatible; MAAT-Audit/1.0; +https://github.com/Sebas2476/BOTB_Hackathon_2026; follows Googlebot robots rules)';
// Crawlers whose access the audit reports on (ACCESS-01). Googlebot also governs what we fetch.
export const AGENTS = { googlebot: 'Googlebot', oaiSearchbot: 'OAI-SearchBot', bingbot: 'Bingbot' };

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;

// --- Safety: only public web addresses (plus this app's own demo store) ------
function isPrivateIp(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith('::ffff:') && isPrivateIp(ip.slice(7));
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export async function checkTarget(rawUrl, allowedHosts = [], allowedLocalPath = null) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('Enter a full website address, e.g. https://example.com'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https websites can be crawled');
  const { address } = await dns.lookup(url.hostname).catch(() => ({ address: null }));
  if (!address) throw new Error(`Could not resolve ${url.hostname}`);
  // This app's own host (the demo store) is always allowed, even when running locally.
  const ownDemo = allowedLocalPath && ['127.0.0.1', '::1'].includes(address) && url.pathname.startsWith(allowedLocalPath);
  if (isPrivateIp(address) && !allowedHosts.includes(url.host) && !ownDemo) throw new Error('Private and local network addresses cannot be crawled');
  return { url, isPrivate: isPrivateIp(address) };
}

// --- Fetching ------------------------------------------------------------------
async function fetchOnce(url, method = 'GET') {
  return fetch(url, {
    method,
    redirect: 'manual',
    headers: { 'user-agent': USER_AGENT, accept: method === 'GET' ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' : '*/*' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

// Follows redirects manually so the chain is recorded (ACCESS-02). Retries one transient failure.
async function fetchPage(url, method = 'GET') {
  const redirects = [];
  let current = url;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const res = await fetchOnce(current, method);
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          const next = new URL(res.headers.get('location'), current).href;
          redirects.push({ from: current, to: next, status: res.status });
          if (redirects.some((r, i) => i < redirects.length - 1 && r.from === next)) return { url, finalUrl: next, status: res.status, redirects, error: 'Redirect loop' };
          current = next;
          continue;
        }
        const body = method === 'GET' ? await res.text() : '';
        if (res.status >= 500 && attempt === 0) break; // retry once
        return {
          url, finalUrl: current, status: res.status, redirects,
          contentType: res.headers.get('content-type') ?? '',
          xRobotsTag: res.headers.get('x-robots-tag') ?? null,
          body,
        };
      }
      if (redirects.length > MAX_REDIRECTS) return { url, finalUrl: current, status: null, redirects, error: `More than ${MAX_REDIRECTS} redirects` };
    } catch (err) {
      if (attempt === 1) return { url, finalUrl: current, status: null, redirects, error: err.name === 'TimeoutError' ? 'Timed out' : err.message };
    }
  }
  return { url, finalUrl: current, status: null, redirects, error: 'Server error after retry' };
}

// --- Extraction ----------------------------------------------------------------
function flattenJsonLd(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => flattenJsonLd(n, out));
  else if (node && typeof node === 'object') {
    if (node['@graph']) flattenJsonLd(node['@graph'], out);
    if (node['@type']) out.push(node);
  }
  return out;
}

function extract(html, pageUrl) {
  const $ = cheerio.load(html);
  const abs = (href) => { try { return new URL(href, pageUrl).href.replace(/#.*$/, ''); } catch { return null; } };

  const jsonLd = [];
  const jsonLdErrors = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try { flattenJsonLd(JSON.parse($(el).text()), jsonLd); } catch (e) { jsonLdErrors.push(e.message); }
  });

  const specs = {};
  $('table tr').each((_, tr) => {
    const k = $(tr).find('th').first().text().trim();
    const v = $(tr).find('td').first().text().trim();
    if (k && v) specs[k] = v;
  });
  $('dl').each((_, dl) => $(dl).find('dt').each((__, dt) => { specs[$(dt).text().trim()] = $(dt).next('dd').text().trim(); }));

  const scriptCount = $('script:not([type="application/ld+json"])').length;
  const $text = cheerio.load(html);
  $text('script, style, noscript, template').remove();
  const text = $text('body').text().replace(/\s+/g, ' ').trim();

  return {
    title: $('title').first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr('content') ?? null,
    metaRobots: $('meta[name="robots"], meta[name="googlebot"]').map((_, el) => $(el).attr('content')).get().join(', ') || null,
    canonical: abs($('link[rel="canonical"]').attr('href') ?? '') || null,
    hreflang: $('link[rel="alternate"][hreflang]').map((_, el) => ({ lang: $(el).attr('hreflang'), href: abs($(el).attr('href')) })).get(),
    lang: $('html').attr('lang') ?? null,
    h1: $('h1').first().text().trim() || null,
    dataNosnippet: $('[data-nosnippet]').length,
    jsonLd,
    jsonLdErrors,
    images: $('img').map((_, el) => ({ src: abs($(el).attr('src') ?? ''), alt: $(el).attr('alt') ?? null })).get().filter((i) => i.src),
    links: [...new Set($('a[href]').map((_, el) => abs($(el).attr('href'))).get().filter(Boolean))],
    specs,
    text: text.slice(0, 20_000),
    textLength: text.length,
    scriptCount,
  };
}

// --- Robots and sitemap ---------------------------------------------------------
async function loadRobots(origin) {
  const url = `${origin}/robots.txt`;
  const res = await fetchPage(url);
  const ok = res.status === 200 && !res.error;
  const text = ok ? res.body : '';
  const robots = robotsParser(url, text);
  return { url, status: res.status, error: res.error ?? null, found: ok, text: text.slice(0, 5000), sitemaps: robots.getSitemaps(), robots };
}

async function loadSitemap(urls) {
  const entries = [];
  const checked = [];
  for (const url of urls.slice(0, 3)) {
    const res = await fetchPage(url);
    checked.push({ url, status: res.status, error: res.error ?? null });
    if (res.status !== 200) continue;
    const $ = cheerio.load(res.body, { xmlMode: true });
    $('url').each((_, el) => entries.push({ loc: $(el).find('loc').text().trim(), lastmod: $(el).find('lastmod').text().trim() || null }));
  }
  return { checked, entries };
}

// --- Google's rendered view -------------------------------------------------------
const LH_AUDITS = ['http-status-code', 'is-crawlable', 'robots-txt', 'canonical', 'hreflang', 'document-title', 'meta-description', 'image-alt', 'link-text', 'crawlable-anchors'];

export async function googleView(url) {
  const qs = new URLSearchParams({ url, category: 'SEO', strategy: 'MOBILE' });
  if (process.env.GOOGLE_API_KEY) qs.set('key', process.env.GOOGLE_API_KEY);
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, { signal: AbortSignal.timeout(90_000) });
    const data = await res.json();
    if (!res.ok) return { url, error: data.error?.message ?? `HTTP ${res.status}` };
    const lh = data.lighthouseResult;
    return {
      url,
      seoScore: lh.categories?.seo?.score ?? null,
      audits: LH_AUDITS.filter((id) => lh.audits?.[id]).map((id) => ({
        id, title: lh.audits[id].title, score: lh.audits[id].score, display: lh.audits[id].displayValue ?? null,
      })),
      finalUrl: lh.finalDisplayedUrl ?? lh.finalUrl ?? url,
    };
  } catch (err) {
    return { url, error: err.name === 'TimeoutError' ? 'Google PageSpeed timed out' : err.message };
  }
}

// --- Crawl ------------------------------------------------------------------------
export async function crawlSite(startUrl, { maxPages = 60, isPrivate = false, onProgress = () => {} } = {}) {
  const start = new URL(startUrl);
  const origin = start.origin;
  const scope = start.pathname.replace(/[^/]*$/, ''); // stay under the start folder
  const inScope = (u) => { try { const x = new URL(u); return x.origin === origin && x.pathname.startsWith(scope); } catch { return false; } };
  const startedAt = new Date().toISOString();

  const robots = await loadRobots(origin);
  const allowed = (u, agent) => (robots.found ? robots.robots.isAllowed(u, agent) !== false : true);
  const sitemap = await loadSitemap(robots.sitemaps.length ? robots.sitemaps : [`${origin}${scope}sitemap.xml`, `${origin}/sitemap.xml`]);
  const sitemapUrls = sitemap.entries.map((e) => e.loc).filter(inScope);

  const pages = new Map();
  const queue = [{ url: start.href, via: 'start' }];
  const queued = new Set([start.href]);
  const inbound = new Map(); // url -> set of pages linking to it
  let sitemapQueued = false;

  while (queue.length && pages.size < maxPages) {
    const { url, via } = queue.shift();
    const access = Object.fromEntries(Object.entries(AGENTS).map(([k, ua]) => [k, allowed(url, ua)]));
    if (!access.googlebot) {
      pages.set(url, { url, via, access, skipped: 'Disallowed for Googlebot by robots.txt' });
    } else {
      const res = await fetchPage(url);
      const page = { url, via, access, finalUrl: res.finalUrl, status: res.status, redirects: res.redirects, error: res.error ?? null, xRobotsTag: res.xRobotsTag ?? null, fetchedAt: new Date().toISOString() };
      if (res.status === 200 && /html/.test(res.contentType ?? '')) {
        Object.assign(page, extract(res.body, res.finalUrl));
        for (const link of page.links) {
          if (!inScope(link)) continue;
          if (!inbound.has(link)) inbound.set(link, new Set());
          inbound.get(link).add(url);
          if (!queued.has(link) && !/\.(jpe?g|png|gif|svg|webp|pdf|xml)$/i.test(link)) { queued.add(link); queue.push({ url: link, via: 'link' }); }
        }
      }
      pages.set(url, page);
    }
    if (!queue.length && !sitemapQueued) {
      sitemapQueued = true;
      for (const u of sitemapUrls) if (!queued.has(u)) { queued.add(u); queue.push({ url: u, via: 'sitemap' }); }
    }
    onProgress(pages.size, Math.min(maxPages, queued.size));
  }

  // Product images and canonical targets outside the crawl are checked lightly.
  const imageChecks = {};
  const productPages = [...pages.values()].filter((p) => p.jsonLd?.some((n) => n['@type'] === 'Product') || p.specs && Object.keys(p.specs).length > 3);
  for (const img of productPages.flatMap((p) => p.images ?? []).slice(0, 60)) {
    if (imageChecks[img.src]) continue;
    const r = await fetchPage(img.src, 'HEAD');
    imageChecks[img.src] = r.status;
  }
  const canonicalChecks = {};
  for (const p of pages.values()) {
    if (p.canonical && !pages.has(p.canonical) && !canonicalChecks[p.canonical] && Object.keys(canonicalChecks).length < 20) {
      const r = await fetchPage(p.canonical);
      canonicalChecks[p.canonical] = { status: r.status, h1: r.status === 200 ? extract(r.body, r.finalUrl).h1 : null };
    }
  }

  // Google's rendered view of the start page and two product pages (public sites only).
  let google;
  if (isPrivate) {
    google = { notAssessed: 'Google PageSpeed Insights can only reach public websites. Run this report on the deployed site to include Google\'s rendered view.' };
  } else {
    const targets = [start.href, ...productPages.slice(0, 2).map((p) => p.url)];
    onProgress(pages.size, pages.size, 'Asking Google PageSpeed for its view');
    google = { pages: await Promise.all(targets.map(googleView)) };
  }

  return {
    startUrl: start.href,
    origin,
    scope,
    startedAt,
    finishedAt: new Date().toISOString(),
    userAgent: USER_AGENT,
    robots: { url: robots.url, status: robots.status, found: robots.found, text: robots.text, sitemaps: robots.sitemaps },
    sitemap: { checked: sitemap.checked, entries: sitemap.entries },
    pages: [...pages.values()].map((p) => ({ ...p, inboundLinks: [...(inbound.get(p.url) ?? [])].length })),
    imageChecks,
    canonicalChecks,
    google,
    limits: { maxPages, truncated: queue.length > 0 },
  };
}
