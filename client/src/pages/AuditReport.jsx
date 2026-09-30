import { useState } from 'react'
import { Link } from 'react-router-dom'
import { pct } from '../api.js'
import AuditSection from '../components/AuditSection.jsx'

export default function AuditReport({ report }) {
  const [active, setActive] = useState(0)
  const summaries = report.summary.products
  const s = summaries[Math.min(active, summaries.length - 1)]
  const models = report.config.models
  const labels = Object.fromEntries(models.map((m) => [m, s.byModel[m].label]))

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small"><Link to="/reports">Reports</Link> / #{report.id}</p>
          <h1 style={{ marginTop: 4 }}>AI accuracy audit</h1>
          <p className="muted">
            {new Date(report.created_at + 'Z').toLocaleString()} · {models.map((m) => labels[m]).join(', ')}
          </p>
        </div>
        <Link to="/audit" className="btn">Run another</Link>
      </div>

      {summaries.length > 1 && (
        <div className="tabs" role="tablist">
          {summaries.map((p, i) => (
            <button key={p.product.id} role="tab" aria-selected={i === active}
              className={`tab${i === active ? ' active' : ''}`} onClick={() => setActive(i)}>
              {p.product.name} <span className="muted small">· {pct(p.accuracyScore)}</span>
            </button>
          ))}
        </div>
      )}

      <AuditSection key={s.product.id} s={s} models={models} labels={labels}
        results={report.results.filter((r) => r.productId === s.product.id)} />
    </>
  )
}
