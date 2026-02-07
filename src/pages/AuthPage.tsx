import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const AuthPage = () => {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    setLoading(true)
    setError(null)
    try {
      await register(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page auth-page">
      <div className="page-card auth-card">
        <h1>Willkommen bei ELEA</h1>
        <p>Registriere dich in 60 Sekunden und starte mit deinem persönlichen Betreuungssystem.</p>
        <div className="form-grid">
          <label>
            E-Mail
            <input type="email" placeholder="name@uni.de" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Passwort
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mind. 8 Zeichen"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M3 3l18 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M10.6 10.6a3 3 0 0 0 4.2 4.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M6.8 6.8C4.3 8.3 2.6 10.5 2 12c1.5 3.5 5.4 6 10 6 1.5 0 2.9-.3 4.2-.8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M9.9 4.2A10.7 10.7 0 0 1 12 4c4.6 0 8.5 2.5 10 6-0.7 1.6-1.7 3-3 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M2 12c1.5-3.5 5.4-6 10-6s8.5 2.5 10 6c-1.5 3.5-5.4 6-10 6s-8.5-2.5-10-6z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                )}
              </button>
            </div>
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="page-actions">
          <button className="primary" onClick={handleRegister} disabled={loading}>
            Registrieren
          </button>
          <button className="ghost" onClick={handleLogin} disabled={loading}>
            Login
          </button>
        </div>
        <div className="muted">Mit dem Login startest du im FREE-Bereich.</div>
      </div>
      <div className="page-card auth-card">
        <h2>Das bekommst du sofort</h2>
        <ul className="plain-list">
          <li>Online School mit 15–25 Kapiteln</li>
          <li>Checklisten & Roadmap</li>
          <li>Countdown & Risiko-Level</li>
        </ul>
      </div>
    </div>
  )
}

export default AuthPage
