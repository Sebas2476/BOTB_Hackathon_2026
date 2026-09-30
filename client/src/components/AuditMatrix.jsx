import { useTooltip } from './Tooltip.jsx'

const STATUS = {
  accurate: { label: 'Accurate', glyph: '✓' },
  inaccurate: { label: 'Inaccurate', glyph: '✕' },
  incomplete: { label: 'Incomplete', glyph: '◐' },
  missing: { label: 'Missing', glyph: '—' },
  error: { label: 'Request failed', glyph: '!' },
}

// Field x model grid: our value on the left, what each model said in each cell.
export default function AuditMatrix({ matrix, models, labels }) {
  const { bind, node } = useTooltip()
  const cols = `minmax(130px, 1.1fr) minmax(110px, 1fr) repeat(${models.length}, minmax(96px, 1fr))`
  return (
    <>
      <div className="table-wrap">
        <div className="matrix" style={{ gridTemplateColumns: cols, minWidth: 250 + models.length * 100 }}>
          <div className="matrix-head" style={{ textAlign: 'left', paddingLeft: 0 }}>Field</div>
          <div className="matrix-head" style={{ textAlign: 'left' }}>Our database</div>
          {models.map((m) => <div className="matrix-head" key={m}>{labels[m]}</div>)}
          {matrix.map((row) => (
            <Row key={row.key} row={row} models={models} labels={labels} bind={bind} />
          ))}
        </div>
      </div>
      <div className="legend">
        {['accurate', 'inaccurate', 'incomplete', 'missing'].map((s) => (
          <span key={s}><i className={`legend-swatch audit-${s}`} />{STATUS[s].label}</span>
        ))}
      </div>
      {node}
    </>
  )
}

function Row({ row, models, labels, bind }) {
  return (
    <>
      <div className="matrix-prompt">{row.label}</div>
      <div className="matrix-prompt audit-ours">{row.ours}</div>
      {models.map((m) => {
        const c = row.cells[m]
        const st = STATUS[c.status]
        return (
          <div
            key={m}
            className={`cell audit-cell audit-${c.status}`}
            {...bind(
              <>
                <strong>{labels[m]} · {st.label}</strong>
                Ours: {row.ours}<br />
                {labels[m]}: {c.theirs ?? 'no answer'}
                {c.note && c.status !== 'missing' && <><br />{c.note}</>}
              </>,
            )}
          >
            <span className="audit-glyph" aria-hidden="true">{st.glyph}</span>
            <span className="audit-val">{c.status === 'missing' ? 'no answer' : c.status === 'error' ? 'error' : c.theirs}</span>
          </div>
        )
      })}
    </>
  )
}
