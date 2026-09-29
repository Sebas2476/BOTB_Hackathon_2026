import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'

export default function RunReportPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [providers, setProviders] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [models, setModels] = useState(new Set(['claude', 'chatgpt', 'gemini', 'copilot']))
  const [promptCount, setPromptCount] = useState(3)
  const [custom, setCustom] = useState('')
  const [filter, setFilter] = useState('')
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    api.products().then(setProducts).catch((e) => setError(e.message))
    api.providers().then(setProviders).catch((e) => setError(e.message))
  }, [])

  const toggle = (set, setter, id) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setter(next)
  }

  const visible = products.filter((p) =>
    `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(filter.toLowerCase()))

  const customPrompts = custom.split('\n').map((s) => s.trim()).filter(Boolean)
  const totalQueries = useMemo(
    () => selected.size * models.size * (promptCount + customPrompts.length),
    [selected.size, models.size, promptCount, customPrompts.length],
  )

  const run = async () => {
    setError(null)
    setRunning(true)
    try {
      const { id } = await api.runReport({
        productIds: [...selected],
        models: [...models],
        promptsPerProduct: promptCount,
        customPrompts,
      })
      navigate(`/reports/${id}`)
    } catch (e) {
      setError(e.message)
      setRunning(false)
    }
  }

  if (!products.length) {
    return (
      <div className="card empty">
        <h2>No products to test</h2>
        <p>Add products to the catalog first. <Link to="/products">Go to products →</Link></p>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Run a visibility report</h1>
          <p className="muted">Pick products and AI models. We ask each model real shopper questions and check where your product ranks.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>1. Select products</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }} />
            <button className="btn btn-ghost" onClick={() => setSelected(new Set(visible.map((p) => p.id)))}>Select all</button>
            <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
        <div className="select-grid">
          {visible.map((p) => (
            <label key={p.id} className={`select-card${selected.has(p.id) ? ' selected' : ''}`}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(selected, setSelected, p.id)} />
              <strong>{p.name}</strong>
              <div className="meta">{p.brand} · {p.category}{p.target_audience ? ` · for ${p.target_audience}` : ''}</div>
              <div className="meta">
                {p.rating ? `${p.rating}★` : 'no rating'} · {(p.review_count ?? 0).toLocaleString()} reviews
                {p.price != null && ` · $${p.price.toLocaleString()}`}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head"><h2>2. Choose AI models</h2></div>
          <div className="chip-row">
            {providers.map((p) => (
              <label key={p.id} className={`chip${models.has(p.id) ? ' selected' : ''}`}>
                <input type="checkbox" checked={models.has(p.id)} onChange={() => toggle(models, setModels, p.id)} />
                {p.label}
                <span className={`badge ${p.live ? 'badge-live' : 'badge-sim'}`} title={p.live ? p.model : 'No API key configured; answers are simulated'}>
                  {p.live ? 'live' : 'simulated'}
                </span>
              </label>
            ))}
          </div>
          {providers.some((p) => !p.live) && (
            <p className="muted small" style={{ marginTop: 12 }}>
              Simulated models return realistic demo answers. Add API keys in <code>server/.env</code> to query the real models.
            </p>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h2>3. Test prompts</h2></div>
          <label className="field">
            Auto-generated prompts per product: {promptCount}
            <input type="range" min="0" max="5" value={promptCount} onChange={(e) => setPromptCount(Number(e.target.value))} style={{ padding: 0 }} />
          </label>
          <p className="muted small" style={{ margin: '6px 0 12px' }}>
            e.g. “What are the top 5 {'{category}'} for {'{audience}'}?”, “best {'{category}'} under $X”, “most reliable {'{category}'}”
          </p>
          <label className="field">
            Custom prompts (one per line; {'{category}'}, {'{audience}'}, and {'{year}'} are filled in)
            <textarea rows={3} value={custom} onChange={(e) => setCustom(e.target.value)}
              placeholder="What {category} would you recommend for a college freshman?" />
          </label>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

      <div className="card run-bar">
        <span className="muted">
          <strong style={{ color: 'var(--text-primary)' }}>{selected.size}</strong> product(s) ×{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{models.size}</strong> model(s) = {totalQueries} AI queries
        </span>
        <button className="btn btn-primary btn-lg" disabled={!selected.size || !models.size || !totalQueries || running} onClick={run}>
          {running ? 'Starting…' : 'Run report →'}
        </button>
      </div>
    </>
  )
}
