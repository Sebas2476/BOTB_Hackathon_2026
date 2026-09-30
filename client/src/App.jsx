import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import ProductsPage from './pages/ProductsPage.jsx'
import RunReportPage from './pages/RunReportPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import ReportDetailPage from './pages/ReportDetailPage.jsx'

const NAV = [
  { to: '/products', step: 1, label: 'Products' },
  { to: '/run', step: 2, label: 'Run report' },
  { to: '/reports', step: 3, label: 'Reports' },
]

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.png" alt="" />
          MAAT Intelligence
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span className="nav-step">{n.step}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">See how AI assistants rank and describe your products, and what your website should change so they get it right.</div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/products" replace />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/run" element={<RunReportPage />} />
          <Route path="/audit" element={<Navigate to="/run" replace />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:id" element={<ReportDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}
