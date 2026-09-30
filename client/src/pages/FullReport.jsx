import { useState } from 'react'
import { Link } from 'react-router-dom'
import { pct } from '../api.js'
import RankingSection from '../components/RankingSection.jsx'
import AuditSection from '../components/AuditSection.jsx'
import SiteSection from '../components/SiteSection.jsx'

const SECTIONS = [
  { id: 'ranking', n: 1, title: 'Ranking results', sub: 'Where each AI assistant ranks the product for real shopper questions' },
  { id: 'accuracy', n: 2, title: 'Accuracy audit', sub: 'What each assistant says about the product, checked against your product database' },
  { id: 'website', n: 3, title: "Website crawl & Maat's recommendations", sub: 'How your website presents the product, checked against the AEO/GEO rulebook' },
]

// The single MAAT report: ranking, then accuracy audit, then website crawl + Maat.
export default function FullReport({ report }) {
  const [active, setActive] = useState(0)
  const entries = report.summary.products
  const entry = entries[Math.min(active, entries.length - 1)]
  const models = report.config.models
  const labels = Object.fromEntries(models.map((m) => [m, entry.ranking.byModel[m].label]))
  const site = report.summary.site

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small"><Link to="/reports">Reports</Link> / #{report.id}</p>
          <h1 style={{ marginTop: 4 }}>MAAT report</h1>
          <p className="muted">
            {new Date(report.created_at + 'Z').toLocaleString()} · {models.map((m) => labels[m]).join(', ')}
            {report.config.siteUrl && <> · <a href={report.config.siteUrl} target="_blank" rel="noreferrer">{report.config.siteUrl}</a></>}
          </p>
        </div>
        <Link to="/run" className="btn">Run another</Link>
      </div>

      <nav className="section-nav" aria-label="Report sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}><span className="nav-step">{s.n}</span>{s.title}</a>
        ))}
      </nav>

      {entries.length > 1 && (
        <div className="tabs" role="tablist">
          {entries.map((p, i) => (
            <button key={p.product.id} role="tab" aria-selected={i === active}
              className={`tab${i === active ? ' active' : ''}`} onClick={() => setActive(i)}>
              {p.product.name}
              <span className="muted small"> · {pct(p.ranking.visibilityScore)} visible · {pct(p.audit.accuracyScore)} accurate</span>
            </button>
          ))}
        </div>
      )}

      <Section {...SECTIONS[0]}>
        <RankingSection key={`r${entry.product.id}`} s={entry.ranking} models={models} labels={labels}
          results={report.results.ranking.filter((r) => r.productId === entry.product.id)} />
      </Section>

      <Section {...SECTIONS[1]}>
        <AuditSection key={`a${entry.product.id}`} s={entry.audit} models={models} labels={labels}
          results={report.results.audit.filter((r) => r.productId === entry.product.id)} />
      </Section>

      <Section {...SECTIONS[2]}>
        <SiteSection site={site} product={entry.product} />
      </Section>
    </>
  )
}

function Section({ id, n, title, sub, children }) {
  return (
    <section id={id} className="report-section">
      <div className="section-title">
        <span className="section-num">{n}</span>
        <div>
          <h2>{title}</h2>
          <p className="muted small">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
