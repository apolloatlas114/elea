import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { PanicModal } from './components/PanicModal'
import { useAuth } from './context/AuthContext'
import { useStress } from './hooks/useStress'
import AuthPage from './pages/AuthPage'
import CoachingPage from './pages/CoachingPage'
import CommunityPage from './pages/CommunityPage'
import DashboardPage from './pages/DashboardPage'
import MyThesisPage from './pages/MyThesisPage'
import PaymentsPage from './pages/PaymentsPage'
import ProfilePage from './pages/ProfilePage'
import SchoolPage from './pages/SchoolPage'

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
  const { user } = useAuth()
  const location = useLocation()
  const [panicOpen, setPanicOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [stressSaved, setStressSaved] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const stress = useStress(user?.id)
  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: 'home' },
    { to: '/my-thesis', label: 'My Thesis', icon: 'messages' },
    { to: '/school', label: 'School', icon: 'users' },
    { to: '/coaching', label: 'Coaching', icon: 'settings' },
    { to: '/community', label: 'Community', icon: 'community' },
  ]

  const userInitials = useMemo(() => {
    const email = user?.email ?? ''
    if (!email) return 'U'
    const [local] = email.split('@')
    const parts = local.split(/[._-]+/).filter(Boolean)
    const first = parts[0]?.[0] ?? local[0] ?? 'U'
    const second = parts[1]?.[0] ?? local[1] ?? ''
    return `${first}${second}`.toUpperCase()
  }, [user?.email])

  useEffect(() => {
    setMenuOpen(false)
    setUserMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const query = window.matchMedia('(min-width: 64rem)')
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false)
    }
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    const previous = document.body.style.overflow
    if (menuOpen) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (!userMenuRef.current?.contains(target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  useEffect(() => {
    if (!stressSaved) return
    const timer = window.setTimeout(() => setStressSaved(false), 1400)
    return () => window.clearTimeout(timer)
  }, [stressSaved])

  const handleStressSave = () => {
    const saved = stress.save()
    if (saved) setStressSaved(true)
  }

  const renderNavIcon = (icon: string) => {
    if (icon === 'home') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="28" width="28">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            d="M9 22V12H15V22M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
          />
        </svg>
      )
    }
    if (icon === 'messages') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="26" width="26">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0035 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.90003C9.87812 3.30496 11.1801 2.99659 12.5 3.00003H13C15.0843 3.11502 17.053 3.99479 18.5291 5.47089C20.0052 6.94699 20.885 8.91568 21 11V11.5Z"
          />
        </svg>
      )
    }
    if (icon === 'users') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="26" width="26">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 17.5523C21.6184 16.8519 20.8581 16.3516 20 16.13M16 4.13C16.8604 4.3503 17.623 4.8507 18.1676 5.55231C18.7122 6.25392 19.0078 7.11683 19.0078 8.005C19.0078 8.89317 18.7122 9.75608 18.1676 10.4577C17.623 11.1593 16.8604 11.6597 16 11.88M13 8C13 10.2091 11.2091 12 9 12C6.79086 12 5 10.2091 5 8C5 5.79086 6.79086 4 9 4C11.2091 4 13 5.79086 13 8Z"
          />
        </svg>
      )
    }
    if (icon === 'settings') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="26" width="26">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
          />
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C20.165 17.255 20.3757 17.7636 20.3757 18.294C20.3757 18.8243 20.165 19.333 19.79 19.708L19.71 19.79C19.335 20.165 18.8263 20.3757 18.296 20.3757C17.7656 20.3757 17.257 20.165 16.882 19.79L16.82 19.73C16.5843 19.4995 16.285 19.3448 15.9606 19.286C15.6362 19.2272 15.3016 19.2669 15 19.4C14.7042 19.5268 14.452 19.7372 14.2743 20.0055C14.0966 20.2738 14.0013 20.5882 14 20.91V21C14 21.5304 13.7893 22.0391 13.4142 22.4142C13.0391 22.7893 12.5304 23 12 23C11.4696 23 10.9609 22.7893 10.5858 22.4142C10.2107 22.0391 10 21.5304 10 21V20.83C9.99872 20.5082 9.90337 20.1938 9.72569 19.9255C9.54802 19.6572 9.29577 19.4468 9 19.32C8.69838 19.1869 8.36381 19.1472 8.03941 19.206C7.71502 19.2648 7.41568 19.4195 7.18 19.65L7.12 19.71C6.74502 20.085 6.23637 20.2957 5.706 20.2957C5.17563 20.2957 4.66698 20.085 4.292 19.71L4.21 19.63C3.83502 19.255 3.62431 18.7463 3.62431 18.216C3.62431 17.6856 3.83502 17.177 4.21 16.802L4.27 16.74C4.50054 16.5043 4.65519 16.205 4.714 15.8806C4.77282 15.5562 4.73312 15.2216 4.6 14.92C4.47324 14.6242 4.26276 14.372 3.99447 14.1943C3.72618 14.0166 3.41179 13.9213 3.09 13.92H3C2.46957 13.92 1.96086 13.7093 1.58579 13.3342C1.21071 12.9591 1 12.4504 1 11.92C1 11.3896 1.21071 10.8809 1.58579 10.5058C1.96086 10.1307 2.46957 9.92 3 9.92H3.17C3.49179 9.91872 3.80618 9.82337 4.07447 9.64569C4.34276 9.46802 4.55324 9.21577 4.68 8.92C4.81312 8.61838 4.85282 8.28381 4.794 7.95941C4.73519 7.63502 4.58054 7.33568 4.35 7.1L4.29 7.04C3.91502 6.66502 3.70431 6.15637 3.70431 5.626C3.70431 5.09563 3.91502 4.58698 4.29 4.212L4.37 4.13C4.74502 3.75502 5.25367 3.54431 5.784 3.54431C6.31437 3.54431 6.82302 3.75502 7.198 4.13L7.26 4.19C7.49568 4.42054 7.79502 4.57519 8.11941 4.634C8.44381 4.69282 8.77838 4.65312 9.08 4.52C9.37577 4.39324 9.62802 4.18276 9.80569 3.91447C9.98337 3.64618 10.0787 3.33179 10.08 3.01V3C10.08 2.46957 10.2907 1.96086 10.6658 1.58579C11.0409 1.21071 11.5496 1 12.08 1C12.6104 1 13.1191 1.21071 13.4942 1.58579C13.8693 1.96086 14.08 2.46957 14.08 3V3.09C14.0813 3.41179 14.1766 3.72618 14.3543 3.99447C14.532 4.26276 14.7842 4.47324 15.08 4.6C15.3816 4.73312 15.7162 4.77282 16.0406 4.714C16.365 4.65519 16.6643 4.50054 16.9 4.27L16.96 4.21C17.335 3.83502 17.8436 3.62431 18.374 3.62431C18.9043 3.62431 19.413 3.83502 19.788 4.21L19.87 4.29C20.245 4.66502 20.4557 5.17367 20.4557 5.704C20.4557 6.23437 20.245 6.74302 19.87 7.118L19.81 7.18C19.5795 7.41568 19.4248 7.71502 19.366 8.03941C19.3072 8.36381 19.3469 8.69838 19.48 9C19.6068 9.29577 19.8172 9.54802 20.0855 9.72569C20.3538 9.90337 20.6682 9.99872 20.99 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.83C20.5082 14.0013 20.1938 14.0966 19.9255 14.2743C19.6572 14.452 19.4468 14.7042 19.32 15H19.4Z"
          />
        </svg>
      )
    }
    return (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="26" width="26">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
          d="M6 8a4 4 0 014-4h9a4 4 0 014 4v5a4 4 0 01-4 4h-6l-4 4v-4H10a4 4 0 01-4-4V8Z"
        />
        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" d="M4 6H3a2 2 0 00-2 2v7a2 2 0 002 2h1" />
      </svg>
    )
  }

  return (
    <div className="app">
      <header className={`topbar ${menuOpen ? 'menu-open' : ''}`}>
        <div className="brand">
          <img className="brand-logo" src="/elealogo.png" alt="ELEA" />
        </div>

        <nav id="primary-nav" className={`nav ${menuOpen ? 'open' : ''}`}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}
              to={item.to}
              title={item.label}
              aria-label={item.label}
              onClick={() => setMenuOpen(false)}
            >
              <span className="nav-icon" aria-hidden="true">
                {renderNavIcon(item.icon)}
              </span>
              <span className="nav-tooltip">{item.label}</span>
              <span className="nav-sr">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="top-actions">
          <button
            className={`menu-toggle ${menuOpen ? 'active' : ''}`}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            aria-label={menuOpen ? 'Navigation schliessen' : 'Navigation oeffnen'}
            onClick={() => {
              setMenuOpen((prev) => !prev)
              setUserMenuOpen(false)
            }}
          >
            <span />
            <span />
            <span />
          </button>

          <div className={`stress-mini ${stressSaved ? 'saved' : ''}`}>
            <span>Mental Health</span>
            <input
              type="range"
              min={0}
              max={100}
              value={stress.value}
              onChange={(event) => stress.setValue(Number(event.target.value))}
            />
            <span className="stress-mini-value">{stress.value}</span>
            <button
              className={`save-icon-button ${stressSaved ? 'saved' : ''}`}
              onClick={handleStressSave}
              disabled={!stress.canSave}
              aria-label="Mental Health speichern"
              title="Mental Health speichern"
            >
              💾
            </button>
            <span className={`stress-save-ok ${stressSaved ? 'show' : ''}`}>✓</span>
            {!stress.canSave && <span className="limit-note">{stress.dailyLimit}/Tag erreicht</span>}
          </div>

          <button
            className="panic-button"
            onClick={() => setPanicOpen(true)}
            aria-label="Panic Button"
            title="Panic Button"
          >
            <img src="/panicbutton.png" alt="Panic Button" />
          </button>

          <div ref={userMenuRef} className={`user-menu ${userMenuOpen ? 'open' : ''}`}>
            <button
              className="avatar-toggle"
              type="button"
              aria-label="User-Menue"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((prev) => !prev)}
            >
              <div className="avatar">{userInitials}</div>
            </button>
            <div className="user-dropdown">
              <NavLink
                className={({ isActive }) => `user-link ${isActive ? 'active' : ''}`}
                to="/profile"
                onClick={() => setUserMenuOpen(false)}
              >
                Profil
              </NavLink>
              <NavLink
                className={({ isActive }) => `user-link ${isActive ? 'active' : ''}`}
                to="/payments"
                onClick={() => setUserMenuOpen(false)}
              >
                Payments
              </NavLink>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <button className="nav-backdrop" type="button" aria-label="Menue schliessen" onClick={() => setMenuOpen(false)} />
      )}

      <Outlet />

      <div className="floating-help" aria-label="Hilfe und Empfehlungsaktionen">
        <button className="faq-button floating-faq" type="button" aria-label="FAQ">
          <span className="faq-question" aria-hidden="true">
            ?
          </span>
          <span className="tooltip">FAQ</span>
        </button>

        <div className="referral-wrap">
          <button className="referral-button" type="button" aria-label="20 Prozent Rabatt">
            <span className="referral-button-glow" aria-hidden="true" />
            <span className="referral-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 9h.01M11 12h1v4m9-4a9 9 0 11-18 0 9 9 0 0118 0z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
              <span>20% Rabatt</span>
            </span>
          </button>

          <div className="referral-tooltip" role="note">
            <h3>Empfehlen und sparen</h3>
            <p>
              wenn du uns weiterempfiehlst und dein freund sich basic oder pro sichert erhälst du 15% und dein freund 15% Rabatt
              auf basic oder pro!
            </p>
            <div className="referral-cta">
              <span aria-hidden="true">➜</span>
              <span>Jetzt sparen</span>
            </div>
            <span className="referral-tip" aria-hidden="true" />
          </div>
        </div>
      </div>

      {panicOpen && <PanicModal onClose={() => setPanicOpen(false)} />}
    </div>
  )
}

const ProtectedRoute = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="page">
        <div className="page-card">Lade Session...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  return <AppLayout />
}
