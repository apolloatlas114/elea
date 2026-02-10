import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LoadingTicker from '../components/LoadingTicker'
import { useAuth } from '../context/AuthContext'
import { captureReferralCodeFromSearch, claimPendingReferral, getPendingReferralCode, type ReferralClaimResult } from '../lib/referrals'
import { STORAGE_KEYS } from '../lib/storage'

const AuthPage = () => {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rememberUser, setRememberUser] = useState(false)
  const [referralNotice, setReferralNotice] = useState<string | null>(null)
  const [registrationPendingEmail, setRegistrationPendingEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const captured = captureReferralCodeFromSearch(location.search)
    const pending = captured ?? getPendingReferralCode()
    if (!pending) return
    setReferralNotice(`Einladungs-Code ${pending} erkannt. Der 10%-Vorteil wird nach deinem Login vorgemerkt.`)
  }, [location.search])

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.rememberedEmail)
    if (saved) {
      setEmail(saved)
      setRememberUser(true)
    }
  }, [])

  const applyClaimNotice = (result: ReferralClaimResult) => {
    if (result.status === 'claimed') {
      setReferralNotice('Referral erfolgreich verknüpft. Dein 10%-Vorteil wird vor dem Checkout reserviert.')
      return
    }
    if (result.status === 'already_claimed') {
      setReferralNotice('Referral ist bereits mit deinem Account verknüpft.')
      return
    }
    if (result.status === 'self_referral') {
      setReferralNotice('Eigene Referral-Links können nicht selbst eingelöst werden.')
      return
    }
    if (result.status === 'invalid_code') {
      setReferralNotice('Referral-Code nicht gefunden oder abgelaufen.')
    }
  }

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const currentUser = await login(email, password)
      const claimResult = await claimPendingReferral(currentUser.id)
      applyClaimNotice(claimResult)
      if (rememberUser) {
        localStorage.setItem(STORAGE_KEYS.rememberedEmail, email)
      } else {
        localStorage.removeItem(STORAGE_KEYS.rememberedEmail)
      }
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
      const result = await register(email, password)

      if (result.user) {
        const claimResult = await claimPendingReferral(result.user.id)
        applyClaimNotice(claimResult)
      }

      if (result.needsEmailConfirmation) {
        setRegistrationPendingEmail(result.email)
        setMode('login')
        setShowPassword(false)
        setPassword('')
        setConfirmPassword('')
        if (getPendingReferralCode()) {
          setReferralNotice('Referral gespeichert. Nach E-Mail-Bestätigung und Login wird er automatisch verknüpft.')
        }
        return
      }

      setRegistrationPendingEmail(null)
      navigate('/dashboard')
    } catch (err) {
      setRegistrationPendingEmail(null)
      setError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await handleLogin()
  }

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Bitte wähle ein Passwort mit mindestens 8 Zeichen.')
      return
    }

    if (password !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.')
      return
    }

    await handleRegister()
  }

  const switchToLogin = () => {
    setMode('login')
    setError(null)
  }

  const switchToRegister = () => {
    setMode('register')
    setError(null)
  }

  return (
    <div className="auth-v0-page">
      <div className="auth-v0-wrap auth-v0-wrap-single">
        <section className="auth-v0-card auth-v0-main" aria-busy={loading}>
          <header className="auth-v0-header">
            <img className="auth-v0-logo" src="/elealogoneu.png" alt="elea" />
            <h1>{mode === 'login' ? 'Willkommen zurück' : 'Konto erstellen'}</h1>
            <p>
              {mode === 'login'
                ? 'Logge dich ein und arbeite direkt in deinem Thesis-System weiter.'
                : 'Nutze das Registrierungsformular und starte sofort in dein persönliches Thesis-System.'}
            </p>
          </header>

          {referralNotice && <div className="auth-v0-notice">{referralNotice}</div>}

          {mode === 'login' ? (
            <form className="auth-v0-form" onSubmit={handleSubmit}>
              {registrationPendingEmail && (
                <div className="auth-v0-notice" role="status">
                  Registrierung erfolgreich. Bitte bestätige jetzt deine E-Mail-Adresse:
                  <strong>{registrationPendingEmail}</strong>
                </div>
              )}

              <label className="auth-v0-field">
                <span>E-Mail</span>
                <input
                  type="email"
                  placeholder="name@uni.de"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <label className="auth-v0-field">
                <div className="auth-v0-password-row">
                  <span>Passwort</span>
                  <button
                    className="auth-v0-link"
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  >
                    {showPassword ? 'Ausblenden' : 'Anzeigen'}
                  </button>
                </div>

                <div className="auth-v0-password">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mind. 8 Zeichen"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    className="auth-v0-password-toggle"
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
                        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>

              <label className="auth-v0-field auth-v0-field-checkbox">
                <input
                  type="checkbox"
                  checked={rememberUser}
                  onChange={(event) => setRememberUser(event.target.checked)}
                />
                <span>Benutzer auf diesem Gerät merken</span>
              </label>

              {error && <div className="auth-v0-error">{error}</div>}

              <button className="auth-v0-primary" type="submit" disabled={loading}>
                {loading ? <LoadingTicker variant="inline" prefix="Lade" words={['Login', 'Session', 'Profil', 'Sicherheit', 'Start']} /> : 'Login'}
              </button>
            </form>
          ) : (
            <form className="auth-v0-form auth-v0-form-register" onSubmit={handleRegisterSubmit}>
              <label className="auth-v0-field">
                <span>Full Name</span>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </label>

              <label className="auth-v0-field">
                <span>Email</span>
                <input
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
                <small className="auth-v0-help">
                  We&apos;ll use this to contact you. We will not share your email with anyone else.
                </small>
              </label>

              <label className="auth-v0-field">
                <div className="auth-v0-password-row">
                  <span>Password</span>
                  <button
                    className="auth-v0-link"
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  >
                    {showPassword ? 'Ausblenden' : 'Anzeigen'}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <small className="auth-v0-help">Must be at least 8 characters long.</small>
              </label>

              <label className="auth-v0-field">
                <span>Confirm Password</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <small className="auth-v0-help">Please confirm your password.</small>
              </label>

              {error && <div className="auth-v0-error">{error}</div>}

              <button className="auth-v0-primary" type="submit" disabled={loading}>
                {loading ? <LoadingTicker variant="inline" prefix="Lade" words={['Konto', 'Daten', 'Profil', 'Zugang', 'Start']} /> : 'Create Account'}
              </button>
            </form>
          )}

          <div className="auth-v0-separator">
            <span>oder</span>
          </div>

          <button
            className="auth-v0-secondary"
            type="button"
            onClick={mode === 'login' ? switchToRegister : switchToLogin}
            disabled={loading}
          >
            {mode === 'login' ? 'Noch kein Login? Jetzt registrieren' : 'Bereits registriert? Zum Login'}
          </button>

          <p className="auth-v0-muted">
            {mode === 'login'
              ? 'Mit dem Login startest du direkt im FREE-Bereich.'
              : 'Nach der Registrierung prüfen wir ggf. zuerst deine E-Mail-Bestätigung.'}
          </p>
        </section>
      </div>
    </div>
  )
}

export default AuthPage

