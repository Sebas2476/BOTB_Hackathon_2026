const PRIORITY = {
  high: { label: 'High', color: 'var(--status-critical)', icon: 'M8 3v6M8 12v.5' },
  medium: { label: 'Medium', color: 'var(--status-warning)', icon: 'M4 8h8' },
  low: { label: 'Low', color: 'var(--text-muted)', icon: 'M8 7.5v4M8 4.5v.5' },
}

export default function Recommendations({ items }) {
  return (
    <div>
      {items.map((r, i) => {
        const p = PRIORITY[r.priority]
        return (
          <div className="rec" key={i}>
            <span className="prio">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="7" fill={p.color} />
                <path d={p.icon} stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
              {p.label}
            </span>
            <div>
              <div className="rec-cat">{r.category}</div>
              <h3>{r.title}</h3>
              <p className="muted small" style={{ marginTop: 4 }}>{r.detail}</p>
              {r.evidence && <div className="rec-evidence">Signal: {r.evidence}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
