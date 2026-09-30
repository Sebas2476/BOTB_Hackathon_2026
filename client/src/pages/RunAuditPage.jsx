import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { ModelPicker, ProductPicker } from '../components/Pickers.jsx'

// Fields the audit can check; mirrors AUDIT_FIELDS on the server.
const AUDIT_KEYS = [
  'availability', 'condition', 'warranty_months', 'return_window_days', 'processor', 'ram_gb', 'storage_gb',
  'operating_system', 'screen_inches', 'display_resolution', 'battery_hours', 'weight_kg', 'connectivity',
  'ports', 'noise_cancellation', 'water_resistance',
]
const auditableCount = (p) =>
  [p.price, p.rating, p.review_count].filter((v) => v != null).length +
  AUDIT_KEYS.filter((k) => p.specs?.[k] && !/^not_applicable/.test(p.specs[k])).length

export default function RunAuditPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [providers, setProviders] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [models, setModels] = useState(new Set(['claude', 'chatgpt', 'gemini', 'copilot']))
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    api.products().then(setProducts).catch((e) => setError(e.message))
    api.providers().then(setProviders).catch((e) => setError(e.message))
  }, [])

  const chosen = products.filter((p) => selected.has(p.id))
  const checks = chosen.reduce((n, p) => n + auditableCount(p), 0) * models.size

  const run = async () => {
    setError(null)
    setRunning(true)
    try {
      const { id } = await api.runAudit({ productIds: [...selected], models: [...models] })
      navigate(`/reports/${id}`)
    } catch (e) {
      setError(e.message)
      setRunning(false)
    }
  }

  if (!products.length) {
    return (
      <div className="card empty">
        <h2>No products to audit</h2>
        <p>Load the home database or upload products first. <Link to="/products">Go to products →</Link></p>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit AI accuracy</h1>
          <p className="muted">
            Ask each AI model what it knows about your products, then cross-reference every claim against your
            database. Missing and inaccurate facts are flagged, with an AEO explanation of why and how to fix it.
          </p>
        </div>
      </div>

      <ProductPicker products={products} selected={selected} onChange={setSelected} />

      <div className="grid-2" style={{ marginTop: 16 }}>
        <ModelPicker providers={providers} selected={models} onChange={setModels} />
        <div className="card">
          <div className="card-head"><h2>3. What gets checked</h2></div>
          <p className="muted small">
            Offer details (price, availability, condition, warranty, returns), reputation (rating, review count),
            specs (processor, RAM, storage, OS, screen, resolution, battery, weight) and features (connectivity,
            ports, noise cancellation, water resistance). Only fields your database has a value for are checked.
          </p>
          <p className="muted small" style={{ marginTop: 8 }}>
            Each check is marked <strong>accurate</strong>, <strong>inaccurate</strong> (the model states a wrong
            value), <strong>missing</strong> (the model doesn't know it), or <strong>incomplete</strong> (a list with
            items left out).
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

      <div className="card run-bar">
        <span className="muted">
          <strong style={{ color: 'var(--text-primary)' }}>{selected.size}</strong> product(s) ×{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{models.size}</strong> model(s) ={' '}
          {selected.size * models.size} AI queries · {checks} fact checks
        </span>
        <button className="btn btn-primary btn-lg" disabled={!selected.size || !models.size || running} onClick={run}>
          {running ? 'Starting…' : 'Run audit →'}
        </button>
      </div>
    </>
  )
}
