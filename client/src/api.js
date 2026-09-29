async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, options)
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data.errors?.map((e) => `Row ${e.row}: ${e.error}`).join('\n')
    throw new Error(data.error || detail || `Request failed (${res.status})`)
  }
  return data
}

const json = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  providers: () => request('/providers'),
  products: () => request('/products'),
  addProduct: (product) => request('/products', json('POST', product)),
  uploadCsv: (csv) => request('/products', json('POST', { csv })),
  uploadJson: (rows) => request('/products', json('POST', rows)),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  reports: () => request('/reports'),
  report: (id) => request(`/reports/${id}`),
  runReport: (config) => request('/reports', json('POST', config)),
}

export const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)
export const rankLabel = (r) => (r == null ? '—' : `#${Number.isInteger(r) ? r : r.toFixed(1)}`)
