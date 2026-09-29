import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, pct, rankLabel } from '../api.js'

export default function ReportsPage() {
  const [reports, setReports] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api.reports().then(setReports).catch((e) => setError(e.message)) }, [])

  if (error) return <div className="alert alert-error">{error}</div>
  if (!reports) return <p className="muted">Loading…</p>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="muted">Every visibility report you've run, newest first.</p>
        </div>
        <Link to="/run" className="btn btn-primary">New report</Link>
      </div>
      <div className="card">
        {reports.length === 0 ? (
          <div className="empty"><h2>No reports yet</h2><p><Link to="/run">Run your first report →</Link></p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Report</th><th>Products</th><th>Models</th><th className="num">Visibility</th><th className="num">Avg rank</th><th>Status</th></tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/reports/${r.id}`}><strong>#{r.id}</strong></Link><div className="muted small">{new Date(r.created_at + 'Z').toLocaleString()}</div></td>
                    <td>{r.config.productNames.join(', ')}</td>
                    <td className="small">{r.config.models.length} models</td>
                    <td className="num">{r.products.map((p) => pct(p.visibilityScore)).join(' / ') || '—'}</td>
                    <td className="num">{r.products.map((p) => rankLabel(p.avgRank)).join(' / ') || '—'}</td>
                    <td><span className="badge">{r.status === 'running' ? `running ${r.progress_done}/${r.progress_total}` : r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
