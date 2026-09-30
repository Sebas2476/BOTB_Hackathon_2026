import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { ModelPicker, ProductPicker } from '../components/Pickers.jsx'

export default function RunReportPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [providers, setProviders] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [models, setModels] = useState(new Set(['claude', 'chatgpt', 'gemini', 'copilot']))
  const [promptCount, setPromptCount] = useState(3)
  const [custom, setCustom] = useState('')
  const [crawl, setCrawl] = useState(true)
  const [siteUrl, setSiteUrl] = useState(`${window.location.origin}/store/`)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    api.products().then(setProducts).catch((e) => setError(e.message))
    api.providers().then(setProviders).catch((e) => setError(e.message))
  }, [])

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
        siteUrl: crawl ? siteUrl.trim() : '',
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
          <h1>Run a report</h1>
          <p className="muted">
            One report, three phases: where AI assistants rank your products, whether what they say about them is
            accurate, and how your website presents them, with Maat's AEO &amp; GEO recommendations.
          </p>
        </div>
      </div>

      <ProductPicker products={products} selected={selected} onChange={setSelected} />

      <div className="grid-2" style={{ marginTop: 16 }}>
        <ModelPicker providers={providers} selected={models} onChange={setModels} />

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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>4. Client website</h2>
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={crawl} onChange={(e) => setCrawl(e.target.checked)} style={{ width: 'auto' }} />
            Crawl the website
          </label>
        </div>
        <label className="field">
          Website address
          <input value={siteUrl} disabled={!crawl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://www.example.com/" />
        </label>
        <p className="muted small" style={{ marginTop: 8 }}>
          The crawler follows Googlebot's robots.txt rules, reads each page's text and structured data, and asks Google
          PageSpeed Insights for its view. Maat checks the findings against the AEO/GEO rulebook and your product database.
        </p>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

      <div className="card run-bar">
        <span className="muted">
          <strong style={{ color: 'var(--text-primary)' }}>{selected.size}</strong> product(s) ×{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{models.size}</strong> model(s) = {totalQueries + selected.size * models.size} AI queries
          {crawl && siteUrl.trim() ? ' + website crawl' : ''}
        </span>
        <button className="btn btn-primary btn-lg" disabled={!selected.size || !models.size || !totalQueries || running} onClick={run}>
          {running ? 'Starting…' : 'Run report →'}
        </button>
      </div>
    </>
  )
}
