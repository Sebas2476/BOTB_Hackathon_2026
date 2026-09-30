import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import ProductsPage from './pages/ProductsPage.jsx'
import RunReportPage from './pages/RunReportPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import ReportDetailPage from './pages/ReportDetailPage.jsx'
import RunAuditPage from './pages/RunAuditPage.jsx'

const NAV = [
  { to: '/products', step: 1, label: 'Products' },
  { to: '/run', step: 2, label: 'Run report' },
  { to: '/audit', step: 3, label: 'Audit accuracy' },
  { to: '/reports', step: 4, label: 'Reports' },
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
        <div className="sidebar-foot">See how your products rank when shoppers ask Claude, ChatGPT, Gemini, and Copilot, and whether what they say is accurate.</div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/products" replace />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/run" element={<RunReportPage />} />
          <Route path="/audit" element={<RunAuditPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:id" element={<ReportDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}
