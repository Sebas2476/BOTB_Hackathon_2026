import { useState } from 'react'
import { Link } from 'react-router-dom'
import { pct } from '../api.js'
import StatTile from '../components/StatTile.jsx'
import BarList from '../components/BarList.jsx'
import AuditMatrix from '../components/AuditMatrix.jsx'
import Recommendations from '../components/Recommendations.jsx'

export default function AuditReport({ report }) {
  const [active, setActive] = useState(0)
  const summaries = report.summary.products
  const s = summaries[Math.min(active, summaries.length - 1)]
  const models = report.config.models
  const labels = Object.fromEntries(models.map((m) => [m, s.byModel[m].label]))
  const anySimulated = models.some((m) => !s.byModel[m].live)

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small"><Link to="/reports">Reports</Link> / #{report.id}</p>
          <h1 style={{ marginTop: 4 }}>AI accuracy audit</h1>
          <p className="muted">
            {new Date(report.created_at + 'Z').toLocaleString()} · {models.map((m) => labels[m]).join(', ')}
            {anySimulated && <span className="badge badge-sim" style={{ marginLeft: 8 }}>includes simulated models</span>}
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

      <ProductAudit key={s.product.id} s={s} models={models} labels={labels}
        results={report.results.filter((r) => r.productId === s.product.id)} />
    </>
  )
}

function ProductAudit({ s, models, labels, results }) {
  const [modelFilter, setModelFilter] = useState('all')
  const shown = results.filter((r) => modelFilter === 'all' || r.model === modelFilter)

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ marginBottom: 8 }}>
          <h2>AI overview</h2>
          <span className="muted small">{s.overviewBy === 'claude' ? 'written by Claude' : 'auto-generated summary'}</span>
        </div>
        <p style={{ whiteSpace: 'pre-line' }}>{s.overview}</p>
      </div>

      <div className="tiles">
        <StatTile label="Accuracy score" value={pct(s.accuracyScore)} sub={`${s.accurate} of ${s.checks} facts correct`} />
        <StatTile label="Inaccurate" value={s.inaccurate} sub="facts stated wrong" />
        <StatTile label="Missing or incomplete" value={s.missing} sub="facts the models didn't give" />
        <StatTile label="Recognized by" value={`${s.recognizedBy} / ${s.modelsChecked}`} sub="models that know the product" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>Accuracy by model</h2>
          <span className="muted small">share of {s.fieldsAudited} facts stated correctly</span>
        </div>
        <BarList
          rows={models.map((m) => {
            const bm = s.byModel[m]
            return {
              key: m,
              label: bm.label,
              value: bm.accuracy ?? 0,
              display: bm.error ? 'error' : pct(bm.accuracy),
              badge: !bm.live && <span className="badge badge-sim" title="Simulated">sim</span>,
              tip: (
                <>
                  <strong>{bm.label}</strong>
                  {bm.error ? `Request failed: ${bm.error}` : (
                    <>
                      {bm.recognized ? 'Recognized the product' : "Didn't recognize the product"}<br />
                      Answered {pct(bm.coverage)} of fields · {bm.inaccurate} wrong · {bm.missing} missing
                    </>
                  )}
                </>
              ),
            }
          })}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Fact check: our database vs. each model</h2>
          <span className="muted small">hover a cell for details</span>
        </div>
        <AuditMatrix matrix={s.matrix} models={models} labels={labels} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Why these were flagged (AEO)</h2>
          <span className="muted small">{s.flags.length} flags, highest priority first</span>
        </div>
        {s.flags.length
          ? <Recommendations items={s.flags} />
          : <p className="muted">No flags: every model stated every checked fact correctly.</p>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Raw AI responses</h2>
          <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} style={{ width: 160 }}>
            <option value="all">All models</option>
            {models.map((m) => <option key={m} value={m}>{labels[m]}</option>)}
          </select>
        </div>
        {shown.map((r, i) => (
          <details className="response" key={i}>
            <summary>
              <strong>{labels[r.model]}</strong>
              <span className="muted">Tell me about the {s.product.name}</span>
              <span className="badge" style={{ marginLeft: 'auto' }}>
                {r.error ? 'error' : `${pct(r.accuracy)} accurate`}
              </span>
            </summary>
            <pre>{r.error ?? r.response}</pre>
          </details>
        ))}
      </div>
    </>
  )
}
