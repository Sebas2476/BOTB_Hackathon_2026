import { useState } from 'react'
import { pct, rankLabel } from '../api.js'
import StatTile from './StatTile.jsx'
import BarList from './BarList.jsx'
import RankMatrix from './RankMatrix.jsx'
import Recommendations from './Recommendations.jsx'

function Headline({ s }) {
  const { product, runs, visibilityScore, brandMentionRate, avgRank } = s
  const hits = Math.round(visibilityScore * runs)
  if (hits === 0) {
    return (
      <p>
        <strong>{product.name}</strong> did not appear in any of the {runs} AI answers.
        {brandMentionRate > 0
          ? ` ${product.brand} was mentioned in ${pct(brandMentionRate)} of answers, but not this product.`
          : ` ${product.brand} was not mentioned either.`}
      </p>
    )
  }
  return (
    <p>
      <strong>{product.name}</strong> appeared in <strong>{hits} of {runs}</strong> AI answers
      with an average position of <strong>{rankLabel(avgRank)}</strong>.
      {' '}{product.brand} was mentioned in {pct(brandMentionRate)} of answers.
    </p>
  )
}

export default function RankingSection({ s, models, labels, results }) {
  const [modelFilter, setModelFilter] = useState('all')
  const shown = results.filter((r) => modelFilter === 'all' || r.model === modelFilter)

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}><Headline s={s} /></div>

      <div className="tiles">
        <StatTile label="Visibility score" value={pct(s.visibilityScore)} sub="answers that ranked the product" />
        <StatTile label="Average rank" value={rankLabel(s.avgRank)} sub="when it was ranked" />
        <StatTile label="Best rank" value={rankLabel(s.bestRank)} sub="across all models" />
        <StatTile label="Brand mentioned" value={pct(s.brandMentionRate)} sub={`${s.product.brand} anywhere in the answer`} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Product mention rate by model</h2>
            <span className="muted small">share of prompts</span>
          </div>
          <BarList
            rows={models.map((m) => {
              const bm = s.byModel[m]
              return {
                key: m,
                label: bm.label,
                value: bm.mentionRate,
                display: pct(bm.mentionRate),
                tip: (
                  <>
                    <strong>{bm.label}</strong>
                    Ranked in {bm.mentions} of {bm.runs} prompts<br />
                    Avg rank {rankLabel(bm.avgRank)} · best {rankLabel(bm.bestRank)}<br />
                    Brand mentioned {pct(bm.brandMentionRate)}
                  </>
                ),
              }
            })}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Competitors ranking instead</h2>
            <span className="muted small">times listed, of {s.runs} answers</span>
          </div>
          {s.topCompetitors.length === 0 ? <p className="muted">No competitors found.</p> : (
            <BarList
              max={s.runs}
              labelWidth={210}
              ticks={['0', String(Math.round(s.runs / 2)), String(s.runs)]}
              rows={s.topCompetitors.slice(0, 6).map((c) => ({
                key: c.name,
                label: c.name,
                value: c.mentions,
                display: String(c.mentions),
                tip: <><strong>{c.name}</strong>Listed in {c.mentions} of {s.runs} answers · avg rank {rankLabel(c.avgRank)}</>,
              }))}
            />
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Rank by prompt and model</h2>
          <span className="muted small">position in each model's top list</span>
        </div>
        <RankMatrix byPrompt={s.byPrompt} models={models} labels={labels} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>How to rank higher</h2>
          <span className="muted small">{s.recommendations.length} recommendations, highest priority first</span>
        </div>
        <Recommendations items={s.recommendations} />
        {s.aiInsights && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <h3>Claude's strategy notes</h3>
            <p className="muted small" style={{ whiteSpace: 'pre-line', marginTop: 6 }}>{s.aiInsights}</p>
          </div>
        )}
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
              <span className="muted">{r.prompt}</span>
              <span className="badge" style={{ marginLeft: 'auto' }}>
                {r.error ? 'error' : r.mentioned ? `ranked #${r.rank}` : 'not ranked'}
              </span>
            </summary>
            <pre>{r.error ?? r.response}</pre>
          </details>
        ))}
      </div>
    </>
  )
}
