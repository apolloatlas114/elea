import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const AuthPage = () => {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
            <input
              type="password"
              placeholder="Mind. 8 Zeichen"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
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
