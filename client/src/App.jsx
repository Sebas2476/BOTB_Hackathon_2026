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
          <span className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 11l3-3.5 2.5 2L13 3" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          RankSight
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span className="nav-step">{n.step}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">See how your products rank when shoppers ask Claude, ChatGPT, Gemini, and Copilot.</div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/products" replace />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/run" element={<RunReportPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:id" element={<ReportDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}
