import { useState } from 'react'

function toggleIn(set, id) {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function ProductPicker({ products, selected, onChange, title = '1. Select products' }) {
  const [filter, setFilter] = useState('')
  const visible = products.filter((p) =>
    `${p.name} ${p.brand} ${p.category} ${p.sku ?? ''}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }} />
          <button className="btn btn-ghost" onClick={() => onChange(new Set(visible.map((p) => p.id)))}>Select all</button>
          <button className="btn btn-ghost" onClick={() => onChange(new Set())}>Clear</button>
        </div>
      </div>
      <div className="select-grid">
        {visible.map((p) => (
          <label key={p.id} className={`select-card${selected.has(p.id) ? ' selected' : ''}`}>
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => onChange(toggleIn(selected, p.id))} />
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
  )
}

export function ModelPicker({ providers, selected, onChange, title = '2. Choose AI models' }) {
  return (
    <div className="card">
      <div className="card-head"><h2>{title}</h2></div>
      <div className="chip-row">
        {providers.map((p) => (
          <label key={p.id} className={`chip${selected.has(p.id) ? ' selected' : ''}`}>
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => onChange(toggleIn(selected, p.id))} />
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
  )
}
