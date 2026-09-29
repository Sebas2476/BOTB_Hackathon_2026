import { useTooltip } from './Tooltip.jsx'

// Prompt x model heatmap. Darker = higher rank (#1 strongest); gray = not in the list.
export default function RankMatrix({ byPrompt, models, labels }) {
  const { bind, node } = useTooltip()
  const cols = `minmax(180px, 2.4fr) repeat(${models.length}, minmax(64px, 1fr))`
  return (
    <>
      <div className="table-wrap">
        <div className="matrix" style={{ gridTemplateColumns: cols, minWidth: 180 + models.length * 70 }}>
          <div className="matrix-head" style={{ textAlign: 'left', paddingLeft: 0 }}>Prompt</div>
          {models.map((m) => <div className="matrix-head" key={m}>{labels[m]}</div>)}
          {byPrompt.map((p) => (
            <Row key={p.promptId} p={p} models={models} labels={labels} bind={bind} />
          ))}
        </div>
      </div>
      <div className="legend">
        <span>Rank:</span>
        {[1, 2, 3, 4, 5].map((r) => (
          <span key={r}><i className="legend-swatch" style={{ background: `var(--rank-${r})` }} />#{r}</span>
        ))}
        <span><i className="legend-swatch" style={{ background: 'var(--neutral-cell)' }} />Not ranked</span>
      </div>
      {node}
    </>
  )
}

function Row({ p, models, labels, bind }) {
  return (
    <>
      <div className="matrix-prompt">{p.text}</div>
      {models.map((m) => {
        const r = p.ranks[m]
        if (r === 'error') {
          return <div key={m} className="cell err" {...bind(<><strong>{labels[m]}</strong>Request failed</>)}>error</div>
        }
        if (r == null) {
          return (
            <div key={m} className="cell miss" {...bind(<><strong>{labels[m]}</strong>Not in the top list for “{p.text}”</>)}>
              —
            </div>
          )
        }
        const step = Math.min(5, Math.max(1, r))
        return (
          <div
            key={m}
            className="cell"
            style={{ background: `var(--rank-${step})`, color: `var(--rank-${step}-ink)` }}
            {...bind(<><strong>{labels[m]} · ranked #{r}</strong>“{p.text}”</>)}
          >
            #{r}
          </div>
        )
      })}
    </>
  )
}
