import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useState } from 'react'
import { useCountdown } from './hooks/useCountdown'
import { useStoredProfile } from './hooks/useStoredProfile'
import { useStress } from './hooks/useStress'
import { formatCountdown, todayIso } from './lib/storage'
import { PanicModal } from './components/PanicModal'
import DashboardPage from './pages/DashboardPage'
import AuthPage from './pages/AuthPage'
import MyThesisPage from './pages/MyThesisPage'
import SchoolPage from './pages/SchoolPage'
import CoachingPage from './pages/CoachingPage'
import CommunityPage from './pages/CommunityPage'
import PaymentsPage from './pages/PaymentsPage'
import ProfilePage from './pages/ProfilePage'
import { useAuth } from './context/AuthContext'

export const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/my-thesis" element={<MyThesisPage />} />
          <Route path="/school" element={<SchoolPage />} />
          <Route path="/coaching" element={<CoachingPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

const AppLayout = () => {
  const profile = useStoredProfile()
  const [panicOpen, setPanicOpen] = useState(false)
  const countdownTarget = profile?.abgabedatum ?? todayIso()
  const countdown = useCountdown(countdownTarget)
  const stress = useStress()

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⚕</span>
          <div>
            <div className="brand-name">ELEA</div>
            <div className="brand-sub">Betreuungssystem für Abschlussarbeiten</div>
          </div>
        </div>

        <nav className="nav">
          <NavLink className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`} to="/dashboard">
            Dashboard
          </NavLink>
          <NavLink className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`} to="/my-thesis">
            My Thesis
          </NavLink>
          <NavLink className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`} to="/school">
            School
          </NavLink>
          <NavLink className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`} to="/coaching">
            Coaching
          </NavLink>
          <NavLink className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`} to="/community">
            Community
          </NavLink>
          <NavLink className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`} to="/payments">
            Payments
          </NavLink>
          <NavLink className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`} to="/profile">
            Profil
          </NavLink>
        </nav>

        <div className="top-actions">
          <div className="countdown-mini">
            {formatCountdown(countdown.days, countdown.hours, countdown.minutes, countdown.seconds)}
          </div>
          <div className="stress-mini">
            <span>Stress</span>
            <input
              type="range"
              min={0}
              max={100}
              value={stress.value}
              onChange={(event) => stress.setValue(Number(event.target.value))}
            />
            <span className="stress-mini-value">{stress.value}</span>
            <button className="ghost" onClick={stress.save}>
              Speichern
            </button>
          </div>
          <button className="panic-button" onClick={() => setPanicOpen(true)}>
            🚨 Panic Button
          </button>
          <div className="avatar">AN</div>
        </div>
      </header>

      <Outlet />

      {panicOpen && <PanicModal onClose={() => setPanicOpen(false)} />}
    </div>
  )
}

const ProtectedRoute = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="page">
        <div className="page-card">Lade Session…</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  return <AppLayout />
}
