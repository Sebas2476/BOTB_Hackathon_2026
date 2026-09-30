import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, pct } from '../api.js'
import RankingSection from '../components/RankingSection.jsx'
import AuditReport from './AuditReport.jsx'
import FullReport from './FullReport.jsx'

export default function ReportDetailPage() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let timer
    let cancelled = false
    const poll = async () => {
      try {
        const r = await api.report(id)
        if (cancelled) return
        setReport(r)
        if (r.status === 'running') timer = setTimeout(poll, 1000)
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }
    poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [id])

  if (error) return <div className="alert alert-error">{error}</div>
  if (!report) return <p className="muted">Loading…</p>

  if (report.status === 'running') {
    const frac = report.progress_total ? report.progress_done / report.progress_total : 0
    return (
      <div className="card" style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>
        <h2>{report.phase ?? 'Querying AI models…'}</h2>
        <p className="muted" style={{ margin: '8px 0 18px' }}>
          {report.config.models.length} models · {report.config.productNames.join(', ')}
          {report.config.siteUrl && <><br />Website: {report.config.siteUrl}</>}
        </p>
        <div className="progress"><div style={{ width: `${frac * 100}%` }} /></div>
        <p className="muted small" style={{ marginTop: 10 }}>{Math.round(frac * 100)}% complete</p>
      </div>
    )
  }

  if (report.status === 'failed') {
    return <div className="alert alert-error">Report failed: {report.error}</div>
  }

  if (report.type === 'full') return <FullReport report={report} />
  if (report.type === 'audit') return <AuditReport report={report} />

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
          <h1 style={{ marginTop: 4 }}>AI visibility report</h1>
          <p className="muted">
            {new Date(report.created_at + 'Z').toLocaleString()} · {models.map((m) => labels[m]).join(', ')}
            {anySimulated && <span className="badge badge-sim" style={{ marginLeft: 8 }}>includes simulated models</span>}
          </p>
        </div>
        <Link to="/run" className="btn">Run another</Link>
      </div>

      {summaries.length > 1 && (
        <div className="tabs" role="tablist">
          {summaries.map((p, i) => (
            <button key={p.product.id} role="tab" aria-selected={i === active}
              className={`tab${i === active ? ' active' : ''}`} onClick={() => setActive(i)}>
              {p.product.name} <span className="muted small">· {pct(p.visibilityScore)}</span>
            </button>
          ))}
        </div>
      )}

      <RankingSection key={s.product.id} s={s} models={models} labels={labels} results={report.results.filter((r) => r.productId === s.product.id)} />
    </>
  )
}
