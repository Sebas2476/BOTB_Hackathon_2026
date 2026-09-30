import { useState } from 'react'
import { Link } from 'react-router-dom'
import StatTile from './StatTile.jsx'
import Recommendations from './Recommendations.jsx'

const RESULT_CLASS = {
  Fail: 'res-fail', 'Needs verification': 'res-verify', Opportunity: 'res-opp',
  Pass: 'res-pass', 'Not applicable': 'res-na', 'Not assessed': 'res-na',
}
const FACT_CLASS = { match: 'audit-accurate', mismatch: 'audit-inaccurate', missing: 'audit-missing' }
const FACT_LABEL = { match: '✓', mismatch: '✕', missing: '—' }

export function ResultBadge({ result }) {
  return <span className={`res-badge ${RESULT_CLASS[result]}`}>{result}</span>
}

// Phase 3: Maat's analysis, this product's page vs the database, rulebook results,
// Google's rendered view, and the crawl log.
export default function SiteSection({ site, product }) {
  if (!site) {
    return (
      <div className="card empty" style={{ padding: 28 }}>
        <h2>No website was crawled for this report</h2>
        <p>Add the client's website on the <Link to="/run">run page</Link> to include the crawl and Maat's recommendations.</p>
      </div>
    )
  }
  if (site.error) return <div className="alert alert-error">The website crawl of {site.startUrl} failed: {site.error}</div>

  const maat = site.maat
  const page = site.products[product.id]
  const recs = maat.recommendations.map((r) => ({
    priority: r.priority.toLowerCase(),
    category: [r.ruleIds.join(', '), r.evidenceClass, r.confidence && `${r.confidence} confidence`].filter(Boolean).join(' · '),
    title: r.title,
    detail: r.why,
    fix: r.action,
    evidence: r.affected?.length ? `Affects: ${r.affected.join(', ')}` : null,
    links: r.crossPhase,
    benefit: r.benefit,
  }))

  return (
    <>
      <div className="card maat-card">
        <div className="maat-head">
          <img src="/logo-wings.png" alt="" className="maat-avatar" />
          <div>
            <h2>Maat</h2>
            <p className="muted small">AEO &amp; GEO expert</p>
          </div>
        </div>
        <p style={{ marginTop: 12 }}>{maat.overview}</p>
        {maat.note && <p className="muted small" style={{ marginTop: 8 }}>{maat.note}</p>}
      </div>

      <div className="tiles" style={{ marginTop: 16 }}>
        <StatTile label="Rules failed" value={site.counts.Fail} sub={`of ${site.rules.length} in the rulebook`} />
        <StatTile label="Needs verification" value={site.counts['Needs verification']} sub="unresolved intent or context" />
        <StatTile label="Rules passed" value={site.counts.Pass} sub="within the assessed scope" />
        <StatTile label="Pages crawled" value={site.pagesCrawled} sub={`${site.productsFound} of ${site.productsInDb} products found`} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Maat's recommendations</h2>
          <span className="muted small">{recs.length} actions, highest priority first</span>
        </div>
        {recs.length ? <Recommendations items={recs} /> : <p className="muted">No failing rules within the assessed scope.</p>}
      </div>

      <ProductPage page={page} product={product} site={site} />

      <RuleResults rules={site.rules} />

      <GoogleView google={site.google} />

      <CrawlLog site={site} />
    </>
  )
}

function ProductPage({ page, product, site }) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h2>{product.name} on the website</h2>
        {page?.found && <a className="small" href={page.url} target="_blank" rel="noreferrer">{page.url.replace(site.startUrl, '/')}</a>}
      </div>
      {!page?.found ? (
        <p className="muted">No page for this product was found in the crawl, so shoppers and answer engines have nothing on the site to read about it.</p>
      ) : (
        <>
          {page.rules.length > 0 && (
            <div className="chip-row" style={{ marginBottom: 14 }}>
              {page.rules.map((r) => <span key={r.id} className={`res-badge ${RESULT_CLASS[r.result]}`}>{r.id} · {r.title}</span>)}
            </div>
          )}
          <div className="table-wrap">
            <table className="fact-table">
              <thead><tr><th>Fact</th><th>Product database</th><th>Website text</th><th>Page markup</th></tr></thead>
              <tbody>
                {page.facts.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    <td><strong>{f.db}</strong></td>
                    <td><span className={`fact ${FACT_CLASS[f.siteStatus]}`}>{FACT_LABEL[f.siteStatus]} {f.site ?? 'not shown'}</span></td>
                    <td>{f.markupStatus
                      ? <span className={`fact ${FACT_CLASS[f.markupStatus]}`}>{FACT_LABEL[f.markupStatus]} {f.markup}</span>
                      : <span className="muted small">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function RuleResults({ rules }) {
  const states = ['Fail', 'Needs verification', 'Opportunity', 'Pass', 'Not applicable', 'Not assessed']
  const [filter, setFilter] = useState('Fail')
  const shown = rules.filter((r) => filter === 'all' || r.result === filter)
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h2>Rulebook results</h2>
        <span className="muted small">AEO &amp; GEO audit rulebook · {rules.length} rules</span>
      </div>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        {[...states, 'all'].map((s) => {
          const n = s === 'all' ? rules.length : rules.filter((r) => r.result === s).length
          return (
            <button key={s} className={`chip${filter === s ? ' selected' : ''}`} onClick={() => setFilter(s)} disabled={!n}>
              {s === 'all' ? 'All' : s} <span className="muted small">{n}</span>
            </button>
          )
        })}
      </div>
      {shown.map((r) => (
        <details key={r.id} className="response rule">
          <summary>
            <ResultBadge result={r.result} />
            <strong>{r.id}</strong>
            <span>{r.title}</span>
            <span className="muted small" style={{ marginLeft: 'auto' }}>
              {r.evidence} · risk {r.risk}{r.scope ? ` · ${r.affected}/${r.scope}` : ''}
            </span>
          </summary>
          <div className="rule-body">
            {r.findings.length > 0 && (
              <ul>
                {r.findings.map((f, i) => (
                  <li key={i}>
                    {f.product && <strong>{f.product.name}: </strong>}{f.detail}
                    {f.url && <span className="rec-evidence"> {f.url}</span>}
                  </li>
                ))}
              </ul>
            )}
            {r.note && <p className="muted small">{r.note}</p>}
            <p className="small"><strong>Fails when:</strong> {r.failWhen}</p>
            <p className="small"><strong>Correction:</strong> {r.correction}</p>
            <p className="small muted"><strong>Exceptions:</strong> {r.exceptions}</p>
            <p className="small muted"><strong>Expected benefit:</strong> {r.benefit}</p>
            <p className="small muted">
              <strong>Platforms:</strong> {r.platforms} · <strong>Checked by:</strong> {r.method}
              {r.sources.length > 0 && <> · <strong>Sources:</strong>{' '}
                {r.sources.map((s, i) => <span key={s.id}>{i > 0 && ', '}<a href={s.url} target="_blank" rel="noreferrer">{s.id} {s.title}</a></span>)}</>}
            </p>
          </div>
        </details>
      ))}
    </div>
  )
}

function GoogleView({ google }) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h2>Google's view</h2>
        <span className="muted small">PageSpeed Insights / Lighthouse SEO audit</span>
      </div>
      {google?.notAssessed ? <p className="muted">{google.notAssessed}</p> : (google?.pages ?? []).map((g) => (
        <div key={g.url} className="google-page">
          <p className="small"><strong>{g.url}</strong>{g.seoScore != null && <> · SEO score <strong>{Math.round(g.seoScore * 100)}</strong></>}</p>
          {g.error ? <p className="muted small">Not assessed: {g.error}</p> : (
            <ul className="small">
              {g.audits.map((a) => (
                <li key={a.id}>
                  <ResultBadge result={a.score === 1 ? 'Pass' : a.score == null ? 'Not applicable' : 'Fail'} /> {a.title}{a.display ? ` (${a.display})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

function CrawlLog({ site }) {
  return (
    <details className="card crawl-log" style={{ marginTop: 16 }}>
      <summary>
        <h2 style={{ display: 'inline' }}>Crawl log</h2>
        <span className="muted small"> · {site.pagesCrawled} pages · robots.txt {site.robots.found ? 'found' : 'not found'} · {site.sitemapUrls} sitemap URLs · {new Date(site.crawledAt).toLocaleString()}</span>
      </summary>
      <p className="muted small" style={{ margin: '10px 0' }}>
        Crawled following Googlebot's robots.txt rules, identifying as: <code>{site.userAgent}</code>
        {site.truncated && ' · stopped at the page limit'}
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>URL</th><th>Status</th><th>Found via</th><th className="num">Links in</th><th>Notes</th></tr></thead>
          <tbody>
            {site.pages.map((p) => (
              <tr key={p.url}>
                <td className="small">{p.url}</td>
                <td>{p.status ?? '—'}</td>
                <td className="small">{p.via}</td>
                <td className="num">{p.inboundLinks ?? '—'}</td>
                <td className="small">{[p.error, p.noindex && 'noindex'].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
