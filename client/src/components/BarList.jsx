import { useTooltip } from './Tooltip.jsx'

// Horizontal single-series bar chart. rows: [{ key, label, value (0..max), display, tip, badge }]
export default function BarList({ rows, max = 1, ticks = ['0%', '25%', '50%', '75%', '100%'], labelWidth = 150 }) {
  const { bind, node } = useTooltip()
  return (
    <div className="bar-list" style={{ '--label-w': `${labelWidth}px` }}>
      {rows.map((r) => (
        <div className="bar-row" key={r.key}>
          <div className="bar-row-label">
            <span className="name" title={r.label}>{r.label}</span>
            {r.badge}
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(1, r.value / max)) * 100}%` }} />
          </div>
          <div className="bar-value">{r.display}</div>
          <div className="bar-hit" {...bind(r.tip)} />
        </div>
      ))}
      {ticks && (
        <div className="axis-row">
          <span />
          <div className="axis-ticks">{ticks.map((t) => <span key={t}>{t}</span>)}</div>
          <span />
        </div>
      )}
      {node}
    </div>
  )
}
