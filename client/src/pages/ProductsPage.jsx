import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'

const EMPTY = {
  name: '', brand: '', category: '', price: '', rating: '', review_count: '',
  target_audience: '', url: '', description: '', features: '',
}

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [message, setMessage] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef()

  const load = () => api.products().then(setProducts).catch((e) => setMessage({ type: 'error', text: e.message }))
  useEffect(() => { load() }, [])

  const report = (res) => {
    const errs = res.errors?.length ? `\n${res.errors.map((e) => `Row ${e.row}: ${e.error}`).join('\n')}` : ''
    setMessage({ type: res.errors?.length ? 'error' : 'ok', text: `Added ${res.inserted.length} product(s).${errs}` })
    load()
  }

  const handleFile = async (file) => {
    if (!file) return
    setMessage(null)
    try {
      const text = await file.text()
      const res = file.name.toLowerCase().endsWith('.json')
        ? await api.uploadJson(JSON.parse(text))
        : await api.uploadCsv(text)
      report(res)
    } catch (e) {
      setMessage({ type: 'error', text: e.message })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const submitForm = async (e) => {
    e.preventDefault()
    try {
      report(await api.addProduct(form))
      setForm(EMPTY)
      setShowForm(false)
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const loadHome = async () => {
    setMessage(null)
    try {
      const { inserted, skipped } = await api.loadHomeDatabase()
      setMessage({ type: 'ok', text: `Loaded ${inserted.length} product(s) from the home database${skipped ? `; ${skipped} already present` : ''}.` })
      load()
    } catch (e) {
      setMessage({ type: 'error', text: e.message })
    }
  }

  const remove = async (id) => {
    await api.deleteProduct(id)
    load()
  }

  const field = (key, label, props = {}) => (
    <label className={`field ${props.wide ? 'span-3' : ''}`}>
      {label}
      {props.textarea
        ? <textarea rows={2} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        : <input value={form[key]} required={props.required} type={props.type || 'text'} step="any"
            onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={props.placeholder} />}
    </label>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Product catalog</h1>
          <p className="muted">Upload the products you want to track in AI assistant recommendations.</p>
        </div>
        {products.length > 0 && <Link to="/run" className="btn btn-primary">Select products to test →</Link>}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Upload products</h2>
            <span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <button className="btn btn-ghost small" onClick={loadHome}>Load home database</button>
              <a href="/api/sample.csv" className="small">Download CSV</a>
            </span>
          </div>
          <div
            className={`dropzone${drag ? ' drag' : ''}`}
            onClick={() => fileRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
            </svg>
            <p style={{ marginTop: 8, fontWeight: 600 }}>Drop a CSV or JSON file, or click to browse</p>
            <p className="muted small" style={{ marginTop: 4 }}>
              Required: name (or model), brand, category. Recommended: price, rating, review_count, target_audience, url,
              description, features. Extra spec columns (ram_gb, battery_hours, availability…) are kept for accuracy audits.
            </p>
            <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => handleFile(e.target.files[0])} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Add a single product</h2>
            <button className="btn btn-ghost" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Add manually'}</button>
          </div>
          {showForm ? (
            <form onSubmit={submitForm} className="form-grid">
              {field('name', 'Product name *', { required: true, placeholder: 'Nimbus Air 14' })}
              {field('brand', 'Brand *', { required: true, placeholder: 'Nimbus' })}
              {field('category', 'Category *', { required: true, placeholder: 'laptops' })}
              {field('price', 'Price ($)', { type: 'number' })}
              {field('rating', 'Avg rating (0–5)', { type: 'number' })}
              {field('review_count', 'Review count', { type: 'number' })}
              {field('target_audience', 'Target audience', { placeholder: 'students' })}
              {field('url', 'Product URL', { wide: false })}
              <span />
              {field('description', 'Description', { textarea: true, wide: true })}
              {field('features', 'Key features (separate with ;)', { textarea: true, wide: true })}
              <div className="span-3"><button className="btn btn-primary" type="submit">Save product</button></div>
            </form>
          ) : (
            <p className="muted small">
              Category and target audience determine the test prompts, e.g. <em>“What are the top 5 laptops for students?”</em>.
              Reviews, rating, and description quality drive the optimization recommendations.
            </p>
          )}
        </div>
      </div>

      {message && <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-ok'}`} style={{ marginTop: 16 }}>{message.text}</div>}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Products in database</h2>
          <span className="muted small">{products.length} total</span>
        </div>
        {products.length === 0 ? (
          <div className="empty">
            <h2>No products yet</h2>
            <p>Upload a CSV above, or <button className="btn btn-ghost" onClick={loadHome}>load the home database</button></p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th><th>Category</th><th>Audience</th>
                  <th className="num">Price</th><th className="num">Rating</th><th className="num">Reviews</th><th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong><div className="muted small">{p.brand}{p.sku ? ` · ${p.sku}` : ''}</div></td>
                    <td>{p.category}</td>
                    <td>{p.target_audience || <span className="muted">—</span>}</td>
                    <td className="num">{p.price != null ? `$${p.price.toLocaleString()}` : '—'}</td>
                    <td className="num">{p.rating ?? '—'}</td>
                    <td className="num">{p.review_count?.toLocaleString() ?? '—'}</td>
                    <td className="num"><button className="btn btn-ghost small" onClick={() => remove(p.id)}>Remove</button></td>
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
