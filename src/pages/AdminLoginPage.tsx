import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isAdminEmail } from '../lib/admin'

const AdminLoginPage = () => {
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const fromForbidden = params.get('forbidden') === '1'

  if (user && isAdminEmail(user.email)) {
    return <Navigate to="/admin" replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate('/admin', { replace: true })
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Admin Login fehlgeschlagen'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <div className="admin-login-head">
          <div className="admin-login-icon" aria-hidden="true">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="admin-login-kicker">ELEA CONTROL</p>
            <h1>Admin Login</h1>
          </div>
        </div>

        {fromForbidden && (
          <div className="admin-login-alert">
            Dieses Konto hat keinen Admin-Zugriff. Bitte mit einem freigeschalteten Admin-Konto anmelden.
          </div>
        )}

        {user && !isAdminEmail(user.email) && (
          <div className="admin-login-alert">
            Du bist aktuell als `{user.email}` eingeloggt. Das ist kein Admin-Konto.
            <button type="button" className="admin-login-switch" onClick={() => logout()}>
              Mit anderem Konto anmelden
            </button>
          </div>
        )}

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label>
            <span>E-Mail</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            <span>Passwort</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error && <p className="admin-login-error">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Anmeldung...' : 'In Admin einloggen'}
          </button>
        </form>

        <Link to="/auth" className="admin-login-back">
          Zum normalen User-Login
        </Link>
      </section>
    </main>
  )
}

export default AdminLoginPage
