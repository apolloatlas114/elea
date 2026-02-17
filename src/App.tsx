import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import LoadingTicker from './components/LoadingTicker'
import { EleaFeatureOrbit } from './components/EleaFeatureOrbit'
import { PanicModal } from './components/PanicModal'
import { useAuth } from './context/AuthContext'
import { recordSecurityEvent, trackActivityEvent } from './lib/adminData'
import { recordMentalCheckerOpen, recordMentalCheckerSave, recordMentalClickSpeed, recordMentalPattern } from './lib/productivity'
import { buildReferralShareLink, captureReferralCodeFromSearch, claimPendingReferral, copyTextToClipboard, ensureOwnReferralCode } from './lib/referrals'
import { useStress } from './hooks/useStress'
import { isAdminEmail } from './lib/admin'
import { STORAGE_KEYS, parseJson, toLocalIsoDate, type MentalMood, type TodoItem } from './lib/storage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AdminLoginPage from './pages/AdminLoginPage'
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
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminRoute />} />
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

const moodOptions: Array<{ id: MentalMood; label: string; group: 'bad' | 'ok' | 'good' }> = [
  { id: 'focused', label: 'Fokussiert', group: 'ok' },
  { id: 'overwhelmed', label: 'Überfordert', group: 'bad' },
  { id: 'happy', label: 'Glücklich', group: 'good' },
  { id: 'depressed', label: 'Depressiv', group: 'bad' },
  { id: 'motivated', label: 'Motiviert', group: 'good' },
]

const moodScoreMap: Record<MentalMood, number> = {
  focused: 62,
  overwhelmed: 20,
  happy: 86,
  depressed: 10,
  motivated: 78,
}

const faqOnboardingVideoEmbedUrl =
  (import.meta.env.VITE_ELEA_ONBOARDING_VIDEO_EMBED as string | undefined) || 'https://www.youtube.com/embed/Q33KBiDriJY'

const platformFaqItems: Array<{ question: string; answer: string }> = [
  {
    question: 'Wie starte ich in elea am schnellsten richtig?',
    answer:
      'Setze zuerst deine Deadline, mache den Status Check und plane dann deine erste Woche im Zeitplan. So priorisiert elea deine Aufgaben direkt sinnvoll statt nur To-dos zu sammeln.',
  },
  {
    question: 'Wofür nutze ich den elea Feature Orbit konkret?',
    answer:
      'Der Orbit ist deine Funktionslandkarte: Klicke ein Feature an und du bekommst sofort die Kurz-Erklärung. Damit findest du ohne Suchen direkt das richtige Tool für dein aktuelles Problem.',
  },
  {
    question: 'Wie hilft mir der Zeitplan im Alltag?',
    answer:
      'Der Zeitplan verbindet deine Lernblöcke mit Deadline-Logik und Fokuszeiten. Du siehst auf einen Blick, was heute kritisch ist, was warten kann und wo freie Slots für wichtige Aufgaben liegen.',
  },
  {
    question: 'Was bringt mir der Panic Button in Stressphasen?',
    answer:
      'Der Panic Button reduziert akuten Druck in Sekunden: kurze Check-Fragen, klare Priorität und eine direkt ausführbare Mikro-Aktion. Ziel ist Handlungsfähigkeit statt Überforderung.',
  },
  {
    question: 'Wann sollte ich Frag elea und das Lernlabor einsetzen?',
    answer:
      'Frag elea nutzt du für schnelle Erklärungen und nächste Schritte. Das Lernlabor nutzt du anschließend zum strukturierten Üben mit Quiz-Leveln, Timer und Feedback auf Basis deiner Inhalte.',
  },
  {
    question: 'Wie arbeite ich mit Upload, Notehub und Smartsearch zusammen?',
    answer:
      'Lade Dokumente hoch, verknüpfe Notizen und Aufgaben in Notehub und finde alles über Smartsearch wieder. So bleibt dein gesamter Workflow zentral, statt über mehrere Tools verteilt zu sein.',
  },
  {
    question: 'Woran erkenne ich, ob ich auf Kurs bin?',
    answer:
      'Nutze Fortschrittsanzeige, Risiko Checker und Mental-Health-Status zusammen. Diese drei Werte zeigen dir, ob dein Tempo, dein Belastungsniveau und dein Abgabe-Risiko im grünen Bereich liegen.',
  },
  {
    question: 'Wie bekomme ich Hilfe, wenn ich feststecke?',
    answer:
      'Nutze Chat Support für konkrete Fragen, Interactive Help Sessions für häufige Themen und 1:1 Betreuung mit Anna für kritische Phasen. So bekommst du je nach Situation die passende Tiefe.',
  },
]

const renderMoodGlyph = (mood: MentalMood) => {
  if (mood === 'focused') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#E7FBF8" stroke="#129689" strokeWidth="1.4" />
        <circle cx="12" cy="12" r="4.6" fill="none" stroke="#0D6F75" strokeWidth="1.3" />
        <circle cx="12" cy="12" r="1.6" fill="#0D6F75" />
        <path d="M12 5.7v2.1M12 16.2v2.1M5.7 12h2.1M16.2 12h2.1" stroke="#0D6F75" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (mood === 'overwhelmed') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#FFF4E8" stroke="#D98C3B" strokeWidth="1.4" />
        <path d="M8.1 10.1l2-1.4M15.9 10.1l-2-1.4" stroke="#A45E18" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M7.8 15.8c1.2-.9 2.6-1.3 4.2-1.3s3 .4 4.2 1.3" stroke="#A45E18" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        <path d="M6.6 7.7c.6-.5 1.3-.8 2.1-.9M17.4 7.7c-.6-.5-1.3-.8-2.1-.9" stroke="#D98C3B" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  if (mood === 'happy') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#EAFCEE" stroke="#3B9D69" strokeWidth="1.4" />
        <circle cx="9" cy="10" r="1.15" fill="#286948" />
        <circle cx="15" cy="10" r="1.15" fill="#286948" />
        <path d="M8.1 14.4c1 1.8 2.3 2.7 3.9 2.7s2.9-.9 3.9-2.7" stroke="#286948" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </svg>
    )
  }
  if (mood === 'depressed') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#EEF4F8" stroke="#6A8498" strokeWidth="1.4" />
        <circle cx="9" cy="10.5" r="1.05" fill="#4F6475" />
        <circle cx="15" cy="10.5" r="1.05" fill="#4F6475" />
        <path d="M8.2 16.4c1.1-1.2 2.3-1.8 3.8-1.8s2.7.6 3.8 1.8" stroke="#4F6475" strokeWidth="1.35" strokeLinecap="round" fill="none" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#EAF8FF" stroke="#2F8CB9" strokeWidth="1.4" />
      <path d="M12 16.4V7.8M8.6 11.2 12 7.8l3.4 3.4" stroke="#1C688F" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="12" cy="16.4" r="1.35" fill="#1C688F" />
    </svg>
  )
}

const AppLayout = () => {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [panicOpen, setPanicOpen] = useState(false)
  const [mentalOpen, setMentalOpen] = useState(false)
  const [faqOrbitOpen, setFaqOrbitOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mentalNotice, setMentalNotice] = useState<string | null>(null)
  const [mentalActionText, setMentalActionText] = useState('')
  const [mentalActionDetail, setMentalActionDetail] = useState('')
  const [mentalActionNeedsPlanButton, setMentalActionNeedsPlanButton] = useState(false)
  const [referralLink, setReferralLink] = useState('')
  const [referralFeedback, setReferralFeedback] = useState<string | null>(null)
  const [referralCtaLabel, setReferralCtaLabel] = useState('Jetzt sparen')
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const mentalSessionRef = useRef<{ openedAt: number; lastActionAt: number; saved: boolean } | null>(null)
  const stress = useStress(user?.id)
  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: 'home' },
    { to: '/my-thesis', label: 'Lab', icon: 'lab' },
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

  const todosSnapshot = useMemo(
    () => parseJson<TodoItem[]>(localStorage.getItem(STORAGE_KEYS.todos), []),
    [location.pathname, stress.checkIns.length]
  )

  const mentalStats7d = useMemo(() => {
    const counters = { bad: 0, ok: 0, good: 0 }
    stress.checkIns7d.forEach((entry) => {
      const mood = moodOptions.find((item) => item.id === entry.mood)
      const group = mood?.group ?? 'ok'
      if (group === 'bad') counters.bad += 1
      if (group === 'ok') counters.ok += 1
      if (group === 'good') counters.good += 1
    })
    return counters
  }, [stress.checkIns7d])

  const mentalTrendText = stress.trend7d

  const mentalInsightList = useMemo(() => {
    const items: string[] = []
    const lateChecks = stress.checkIns7d.filter((entry) => {
      const parsed = new Date(entry.createdAt)
      if (Number.isNaN(parsed.getTime())) return false
      return parsed.getHours() >= 22
    }).length
    if (lateChecks >= 4) {
      items.push('Du warst die letzten 7 Tage an 4+ Tagen nach 22 Uhr aktiv - Risiko für schlechteren Schlaf.')
    }

    const scoreByDate = new Map<string, number[]>()
    stress.checkIns7d.forEach((entry) => {
      if (!scoreByDate.has(entry.date)) scoreByDate.set(entry.date, [])
      scoreByDate.get(entry.date)?.push(moodScoreMap[entry.mood])
    })
    const doneByDate = new Map<string, number>()
    todosSnapshot.forEach((todo) => {
      if (!todo.date || !todo.done) return
      doneByDate.set(todo.date, (doneByDate.get(todo.date) ?? 0) + 1)
    })
    const highTaskScores: number[] = []
    const lowTaskScores: number[] = []
    scoreByDate.forEach((scores, date) => {
      const avg = Math.round(scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1))
      if ((doneByDate.get(date) ?? 0) >= 2) highTaskScores.push(avg)
      else lowTaskScores.push(avg)
    })
    if (highTaskScores.length > 0 && lowTaskScores.length > 0) {
      const avgHigh = Math.round(highTaskScores.reduce((sum, score) => sum + score, 0) / highTaskScores.length)
      const avgLow = Math.round(lowTaskScores.reduce((sum, score) => sum + score, 0) / lowTaskScores.length)
      const delta = avgHigh - avgLow
      if (delta >= 8) {
        items.push(`An Tagen mit 2+ erledigten Tasks war dein Mood Ø ${delta} Punkte höher.`)
      }
    }

    const highStressDays = new Set(stress.checkIns7d.filter((entry) => entry.value > 70).map((entry) => entry.date)).size
    if (highStressDays >= 3) {
      items.push('Dein Stress war an 3 Tagen über 70. Rede heute 2 Minuten ehrlich mit einer Person deines Vertrauens.')
    }
    return items.slice(0, 3)
  }, [stress.checkIns7d, todosSnapshot])

  const mentalStreakDays = useMemo(() => {
    if (stress.checkIns.length === 0) return 0
    const uniqueDays = Array.from(new Set(stress.checkIns.map((entry) => entry.date))).sort((a, b) => b.localeCompare(a))
    let streak = 0
    let cursor = new Date()
    for (const date of uniqueDays) {
      const expected = toLocalIsoDate(cursor)
      if (date !== expected) break
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    return streak
  }, [stress.checkIns])

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
    if (!mentalNotice) return
    const timer = window.setTimeout(() => setMentalNotice(null), 2600)
    return () => window.clearTimeout(timer)
  }, [mentalNotice])

  const openMentalModal = () => {
    const now = Date.now()
    mentalSessionRef.current = { openedAt: now, lastActionAt: now, saved: false }
    recordMentalCheckerOpen()
    setMentalOpen(true)
  }

  const markMentalAction = () => {
    const now = Date.now()
    const session = mentalSessionRef.current
    if (!session) return
    const deltaMs = Math.max(0, now - session.lastActionAt)
    recordMentalClickSpeed(deltaMs)
    session.lastActionAt = now
  }

  const closeMentalModal = () => {
    setMentalOpen(false)
  }

  useEffect(() => {
    const captured = captureReferralCodeFromSearch(location.search)
    if (!captured) return
    setReferralFeedback(`Einladungs-Code ${captured} gespeichert.`)
  }, [location.search])

  useEffect(() => {
    if (!user) return
    let active = true

    const syncReferralState = async () => {
      const ownCode = await ensureOwnReferralCode(user.id)
      if (!active) return
      setReferralLink(buildReferralShareLink(ownCode))

      const claim = await claimPendingReferral(user.id)
      if (!active) return

      if (claim.status === 'claimed') {
        setReferralFeedback('Empfehlung verknüpft. 10% Rabatt werden vor dem Checkout vorgemerkt.')
      } else if (claim.status === 'already_claimed') {
        setReferralFeedback('Referral ist bereits mit deinem Account verknüpft.')
      } else if (claim.status === 'self_referral') {
        setReferralFeedback('Eigene Referral-Links können nicht selbst eingelöst werden.')
      } else if (claim.status === 'invalid_code') {
        setReferralFeedback('Referral-Code konnte nicht verknüpft werden.')
      }
    }

    void syncReferralState()

    return () => {
      active = false
    }
  }, [user?.id])

  useEffect(() => {
    if (!referralFeedback) return
    const timer = window.setTimeout(() => setReferralFeedback(null), 4200)
    return () => window.clearTimeout(timer)
  }, [referralFeedback])

  useEffect(() => {
    if (referralCtaLabel === 'Jetzt sparen') return
    const timer = window.setTimeout(() => setReferralCtaLabel('Jetzt sparen'), 1800)
    return () => window.clearTimeout(timer)
  }, [referralCtaLabel])

  useEffect(() => {
    if (!user) return
    void trackActivityEvent({
      eventType: 'page_view',
      userId: user.id,
      email: user.email,
      pagePath: location.pathname,
    })
  }, [location.pathname, user?.id, user?.email])

  useEffect(() => {
    if (!user) return

    const handleError = (event: ErrorEvent) => {
      void recordSecurityEvent({
        severity: 'medium',
        category: 'frontend_error',
        title: event.message || 'Unbekannter Frontend Fehler',
        userId: user.id,
        details: {
          filename: event.filename,
          line: event.lineno,
          col: event.colno,
          path: location.pathname,
        },
      })
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void recordSecurityEvent({
        severity: 'medium',
        category: 'unhandled_rejection',
        title: 'Unhandled Promise Rejection',
        userId: user.id,
        details: {
          reason: String(event.reason ?? 'unknown'),
          path: location.pathname,
        },
      })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [location.pathname, user?.id])

  const handleMentalCheckInSave = () => {
    markMentalAction()
    const entry = stress.saveCheckIn({
      mood: stress.mood,
      value: stress.value,
      energy: stress.energy,
    })
    if (!entry) {
      setMentalNotice(`Heute sind bereits ${stress.dailyLimit} Check-ins gespeichert.`)
      return
    }
    const currentSession = mentalSessionRef.current
    if (currentSession) {
      currentSession.saved = true
    }
    recordMentalCheckerSave()
    recordMentalPattern({ mood: entry.mood, value: entry.value, energy: entry.energy })
    setMentalNotice('Check-in gespeichert.')

    const recentBadDays = new Set(
      stress.checkIns
        .concat(entry)
        .filter((item) => item.value >= 70 && (item.mood === 'overwhelmed' || item.mood === 'depressed'))
        .map((item) => item.date)
    ).size

    if (entry.value >= 70 && entry.energy <= 40) {
      setMentalActionText('5-Min-Reset')
      setMentalActionDetail('Stell Timer 5 Min., Handy weg, atme 4-4-4 und starte dann genau 1 kleine Aufgabe.')
      setMentalActionNeedsPlanButton(false)
      return
    }

    if (entry.value >= 70 && entry.energy > 40) {
      setMentalActionText('Jetzt 20 Minuten fokussiert arbeiten.')
      setMentalActionDetail('Arbeite jetzt 20 Minuten fokussiert. Danach 2 Minuten kurzer Spaziergang.')
      setMentalActionNeedsPlanButton(false)
      return
    }

    if (recentBadDays >= 3) {
      setMentalActionText('Check deinen Wochenplan')
      setMentalActionDetail('Wenn mehrere Tage schwer waren, passe jetzt die nächsten 3 Tage an.')
      setMentalActionNeedsPlanButton(true)
      return
    }

    setMentalActionText('Mikro-Aktion für heute')
    setMentalActionDetail('Wähle jetzt genau eine Aufgabe unter 15 Minuten und starte sofort ohne Perfektionsdruck.')
    setMentalActionNeedsPlanButton(false)
  }

  const handleReferralShare = async () => {
    if (!user) {
      setReferralFeedback('Bitte zuerst einloggen, um deinen Referral-Link zu teilen.')
      return
    }

    const ownCode = await ensureOwnReferralCode(user.id)
    const link = referralLink || buildReferralShareLink(ownCode)
    setReferralLink(link)

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'elea Empfehlung',
          text: 'Starte mit meinem elea Link und sichere dir 10% Rabatt auf BASIC oder PRO.',
          url: link,
        })
        setReferralCtaLabel('Geteilt')
        setReferralFeedback('Referral-Link erfolgreich geteilt.')
        return
      } catch {
        // Fallback to copy on cancelled/failed share
      }
    }

    const copied = await copyTextToClipboard(link)
    if (copied) {
      setReferralCtaLabel('Link kopiert')
      setReferralFeedback('Referral-Link kopiert. Jetzt direkt weiterleiten.')
      return
    }

    setReferralFeedback(`Referral-Link: ${link}`)
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
    if (icon === 'lab') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="26" width="26">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            d="M9 3h6M10 3v4.2l-4.6 7.8A3.2 3.2 0 0 0 8.1 20h7.8a3.2 3.2 0 0 0 2.7-5l-4.6-7.8V3"
          />
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            d="M8 14h8M7.2 16.8h9.6"
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

  const isThesisRoute = location.pathname === '/my-thesis'

  return (
    <div className={`app ${isThesisRoute ? 'app--thesis-fit' : ''}`}>
      <header className={`topbar ${menuOpen ? 'menu-open' : ''}`}>
        <button
          className="brand brand-button"
          type="button"
          onClick={() => navigate('/dashboard')}
          aria-label="Zum Dashboard"
          title="Zum Dashboard"
        >
          <img className="brand-logo" src="/elealogoneu.png" alt="ELEA" />
        </button>

        <div className="mobile-topbar-utils" aria-label="Mobile Schnellaktionen">
          <button
            className="mobile-mental-heart-button"
            type="button"
            onClick={openMentalModal}
            aria-label="Mental Health Check öffnen"
            title="Mental Health Check öffnen"
          >
            <img src="/mental-heart-icon.svg" alt="" />
          </button>
          <button
            className="mobile-panic-button"
            onClick={() => setPanicOpen(true)}
            aria-label="Panic Button"
            title="Panic Button"
          >
            <img src="/panicbutton.png" alt="Panic Button" />
          </button>
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
          <NavLink
            className={({ isActive }) => `nav-pill nav-mobile-extra ${isActive ? 'active' : ''}`}
            to="/profile"
            title="Profil"
            aria-label="Profil"
            onClick={() => setMenuOpen(false)}
          >
            <span className="nav-icon" aria-hidden="true">
              {renderNavIcon('users')}
            </span>
            <span className="nav-tooltip">Profil</span>
            <span className="nav-sr">Profil</span>
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-pill nav-mobile-extra ${isActive ? 'active' : ''}`}
            to="/payments"
            title="Pläne"
            aria-label="Pläne"
            onClick={() => setMenuOpen(false)}
          >
            <span className="nav-icon" aria-hidden="true">
              {renderNavIcon('settings')}
            </span>
            <span className="nav-tooltip">Pläne</span>
            <span className="nav-sr">Pläne</span>
          </NavLink>
        </nav>

        <div className="top-actions">
          <button
            className={`menu-toggle ${menuOpen ? 'active' : ''}`}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            aria-label={menuOpen ? 'Navigation schließen' : 'Navigation öffnen'}
            onClick={() => {
              setMenuOpen((prev) => !prev)
              setUserMenuOpen(false)
            }}
          >
            <span />
            <span />
            <span />
          </button>

          <button
            className="mental-heart-button"
            type="button"
            onClick={openMentalModal}
            aria-label="Mental Health Check öffnen"
            title="Mental Health Check öffnen"
          >
            <img src="/mental-heart-icon.svg" alt="" />
          </button>

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
              aria-label="User-Menü"
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
                Pläne
              </NavLink>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <button className="nav-backdrop" type="button" aria-label="Menü schließen" onClick={() => setMenuOpen(false)} />
      )}

      <Outlet />

      {mentalOpen && (
        <div className="modal-backdrop" onClick={closeMentalModal}>
          <div className="modal mental-check-modal" onClick={(event) => event.stopPropagation()}>
            <div className="mental-check-head">
              <div>
                <h2>Mental Health Check</h2>
                <p>1 bis 3 Check-ins täglich. Kurz, klar, hilfreich.</p>
              </div>
              <button className="ghost" type="button" onClick={closeMentalModal}>
                Schließen
              </button>
            </div>

            <div className="mental-mood-grid" role="radiogroup" aria-label="Aktuelle Stimmung auswählen">
              {moodOptions.map((option) => (
                <button
                  key={option.id}
                  className={`mental-mood-chip ${stress.mood === option.id ? 'active' : ''}`}
                  type="button"
                  role="radio"
                  aria-checked={stress.mood === option.id}
                  onClick={() => {
                    markMentalAction()
                    stress.setMood(option.id)
                  }}
                >
                  <span className="mental-mood-icon">{renderMoodGlyph(option.id)}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            <div className="mental-slider-grid">
              <label className="mental-slider-row">
                <span>Stress</span>
                <input
                  className="mental-range"
                  type="range"
                  min={0}
                  max={100}
                  value={stress.value}
                  onChange={(event) => stress.setValue(Number(event.target.value))}
                />
                <strong>{stress.value}</strong>
              </label>
              <label className="mental-slider-row">
                <span>Energie</span>
                <input
                  className="mental-range"
                  type="range"
                  min={0}
                  max={100}
                  value={stress.energy}
                  onChange={(event) => stress.setEnergy(Number(event.target.value))}
                />
                <strong>{stress.energy}</strong>
              </label>
            </div>

            <div className="mental-check-footer">
              <button className="primary mental-save-button" type="button" onClick={handleMentalCheckInSave}>
                Check-in speichern
              </button>
              <span>{stress.todayCount}/{stress.dailyLimit} heute</span>
            </div>

            {mentalNotice && <div className="mental-notice">{mentalNotice}</div>}

            <div className="mental-detail-stack">
              <div className="mental-stat-card">
                <span className="mental-card-kicker">Mini-Statistik</span>
                <p className="mental-stat-line">
                  Letzte 7 Tage: {mentalStats7d.bad}x überfordert, {mentalStats7d.ok}x ok, {mentalStats7d.good}x gut = Tendenz:{' '}
                  <strong>{mentalTrendText}</strong>.
                </p>
              </div>

              {mentalActionText && (
                <div className="mental-action-box">
                  <span className="mental-card-kicker">Nächste Mikro-Aktion</span>
                  <strong>{mentalActionText}</strong>
                  <p>{mentalActionDetail}</p>
                  {mentalActionNeedsPlanButton && (
                    <button className="ghost mental-action-link" type="button" onClick={() => navigate('/my-thesis')}>
                      Plan für nächste 3 Tage anpassen
                    </button>
                  )}
                </div>
              )}

              <div className="mental-weekly-foot">
                {mentalStreakDays >= 2 && <p>Du hast deine mentale Gesundheit {mentalStreakDays} Tage in Folge bewusst gecheckt. Das ist stark.</p>}
                <p>
                  Wochensicht: <strong>{stress.mentalScore7d}/100</strong> · Trend <strong>{stress.trend7d}</strong>.
                </p>
              </div>
            </div>

            <div className="mental-lower-grid">
              {mentalInsightList.length > 0 && (
                <div className="mental-insight-block">
                  <span className="mental-card-kicker">Smart Insights</span>
                  <ul>
                    {mentalInsightList.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mental-routine-block">
                <div className="mental-routine-card">
                  <strong>Vor-Klausur-Routine (5 Minuten)</strong>
                  <ol>
                    <li>Drei tiefe Atemzüge.</li>
                    <li>Ein Satz: „Heute ist ein Schritt, nicht mein ganzes Leben.“</li>
                    <li>Zwei Minuten Mikroplanung.</li>
                  </ol>
                </div>
                <div className="mental-routine-card">
                  <strong>Abend-Shutdown (3 Minuten)</strong>
                  <ol>
                    <li>Regler ausfüllen.</li>
                    <li>Reflexion: „Was war heute ein kleiner Win?“</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="floating-help" aria-label="Hilfe und Empfehlungsaktionen">
        <button className="faq-button floating-faq" type="button" aria-label="FAQ" onClick={() => setFaqOrbitOpen(true)}>
          <span className="faq-question" aria-hidden="true">
            ?
          </span>
          <span className="tooltip">FAQ</span>
        </button>

        <div className="referral-wrap">
          <button className="referral-button" type="button" aria-label="10 Prozent Rabatt" onClick={() => void handleReferralShare()}>
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
              <span>10% Rabatt</span>
            </span>
          </button>

          <div className="referral-tooltip" role="note">
            <h3>Empfehlen und sparen</h3>
            <p>
              Wenn du elea weiterempfiehlst und dein Freund BASIC oder PRO bucht, erhaltet ihr beide 10 % Rabatt auf
              BASIC oder PRO.
            </p>
            <button className="referral-cta referral-cta-button" type="button" onClick={handleReferralShare}>
              <span aria-hidden="true">➜</span>
              <span>{referralCtaLabel}</span>
            </button>
            {referralFeedback && <div className="referral-feedback">{referralFeedback}</div>}
            <span className="referral-tip" aria-hidden="true" />
          </div>
        </div>
      </div>

      {faqOrbitOpen && (
        <div className="modal-backdrop" onClick={() => setFaqOrbitOpen(false)}>
          <div className="modal faq-orbit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="faq-orbit-modal-head">
              <h2>FAQ</h2>
              <button className="ghost" type="button" onClick={() => setFaqOrbitOpen(false)}>
                Schliessen
              </button>
            </div>
            <p className="faq-orbit-modal-subline">
              Hier findest du die wichtigsten Funktionen und kurze Erklärungen dazu, wie sie dich im Studium konkret
              unterstützen.
            </p>
            <div className="faq-orbit-modal-top-grid">
              <div className="faq-orbit-panel">
                <EleaFeatureOrbit />
              </div>

              <aside className="faq-onboarding-card" aria-label="elea Onboarding">
                <div className="faq-onboarding-head">
                  <h3>elea Onboarding</h3>
                  <p>Kurze Einführung in die Plattform, damit du direkt strukturiert startest.</p>
                </div>
                <div className="player-embed faq-onboarding-media">
                  <iframe
                    src={faqOnboardingVideoEmbedUrl}
                    title="elea Onboarding Video"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
                <ul className="faq-onboarding-points">
                  <li>Setup: Profil, Deadline, Status Check</li>
                  <li>Flow: Orbit, Zeitplan, Fokus-Umsetzung</li>
                  <li>Sicherheit: Risiko erkennen, früh gegensteuern</li>
                </ul>
              </aside>
            </div>

            <section className="faq-platform-section" aria-label="Plattform FAQ">
              <div className="faq-platform-head">
                <h3>Plattform FAQ</h3>
                <p>Alles Wichtige zur Nutzung von elea, klar und schnell auffindbar.</p>
              </div>

              <div className="faq-platform-list">
                {platformFaqItems.map((item, index) => (
                  <details key={item.question} className="faq-platform-item" open={index === 0}>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {panicOpen && <PanicModal onClose={() => setPanicOpen(false)} />}
    </div>
  )
}

const ProtectedRoute = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="page">
        <LoadingTicker
          className="page-loader"
          prefix="Lade"
          words={['Session', 'Zugänge', 'Sicherheit', 'Profil', 'Dashboard']}
        />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  return <AppLayout />
}

const AdminRoute = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="page">
        <LoadingTicker
          className="page-loader"
          prefix="Lade"
          words={['Admin-Daten', 'KPIs', 'Uploads', 'Alerts', 'Berechtigungen']}
        />
      </div>
    )
  }

  if (!user) return <Navigate to="/admin/login" replace />
  if (!isAdminEmail(user.email)) return <Navigate to="/admin/login?forbidden=1" replace />

  return <AdminDashboardPage />
}

