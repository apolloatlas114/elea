import DailyIframe, { type DailyCall } from '@daily-co/daily-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getDailyMissingConfigMessage, getDailyRoomUrl, hasDailyRoomUrl, type DailySessionType } from '../lib/daily'
import { hasPaidCoachingPlan, loadBookings, loadPlan } from '../lib/supabaseData'
import type { BookingEntry, Plan } from '../lib/storage'
import { parseJson, STORAGE_KEYS } from '../lib/storage'

const CoachingPage = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [plan, setPlan] = useState<Plan>(() => parseJson(localStorage.getItem(STORAGE_KEYS.plan), 'free'))
  const [coachingPaid, setCoachingPaid] = useState(false)
  const [coachingGateNoticeOpen, setCoachingGateNoticeOpen] = useState(false)
  const [activeSession, setActiveSession] = useState<DailySessionType>('group')
  const [callState, setCallState] = useState<'idle' | 'joining' | 'joined' | 'left' | 'error'>('idle')
  const [callError, setCallError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<BookingEntry[]>([])
  const frameHostRef = useRef<HTMLDivElement | null>(null)
  const callFrameRef = useRef<DailyCall | null>(null)

  const coachingPlanEligible = plan === 'basic' || plan === 'pro'
  const hasCoachingAccess = coachingPlanEligible && coachingPaid

  useEffect(() => {
    let active = true
    if (!user) {
      setBookings([])
      return () => {}
    }
    loadBookings(user.id).then((remote) => {
      if (!active) return
      setBookings(remote)
    })
    return () => {
      active = false
    }
  }, [user?.id])

  useEffect(() => {
    let active = true
    if (!user) return () => {}
    loadPlan(user.id).then((remotePlan) => {
      if (!active || !remotePlan) return
      setPlan(remotePlan)
    })
    return () => {
      active = false
    }
  }, [user?.id])

  useEffect(() => {
    let active = true
    if (!user || !coachingPlanEligible) {
      setCoachingPaid(false)
      return () => {}
    }
    hasPaidCoachingPlan(user.id, plan).then((paid) => {
      if (!active) return
      setCoachingPaid(paid)
    })
    return () => {
      active = false
    }
  }, [coachingPlanEligible, plan, user?.id])

  useEffect(() => {
    if (!coachingGateNoticeOpen) return
    const timer = window.setTimeout(() => setCoachingGateNoticeOpen(false), 4200)
    return () => window.clearTimeout(timer)
  }, [coachingGateNoticeOpen])

  const destroyCallFrame = useCallback(async (leaveMeeting: boolean) => {
    const frame = callFrameRef.current
    if (!frame) return
    callFrameRef.current = null
    try {
      if (leaveMeeting) {
        await frame.leave()
      }
    } catch {
      // ignore: frame may already be disconnected
    }
    try {
      frame.destroy()
    } catch {
      // ignore: best-effort cleanup
    }
  }, [])

  useEffect(() => {
    return () => {
      void destroyCallFrame(true)
    }
  }, [destroyCallFrame])

  useEffect(() => {
    setCallError(null)
    setCallState('idle')
    void destroyCallFrame(true)
  }, [activeSession, destroyCallFrame])

  const activeRoomUrl = getDailyRoomUrl(activeSession)
  const activeRoomConfigured = hasDailyRoomUrl(activeSession)

  const callStateLabel = useMemo(() => {
    if (callState === 'joining') return 'Verbindung wird aufgebaut …'
    if (callState === 'joined') return 'Live verbunden'
    if (callState === 'left') return 'Call beendet'
    if (callState === 'error') return 'Verbindung fehlgeschlagen'
    return 'Bereit'
  }, [callState])

  const activeSessionMeta = useMemo(() => {
    if (activeSession === 'group') {
      return {
        title: 'Gruppen-Call',
        sub: 'Samstags 11:00 Uhr · moderiert durch Anna',
        button: 'Gruppen-Call starten',
      }
    }
    return {
      title: '1zu1 Call',
      sub: 'Persönliche Thesis-Betreuung mit Anna',
      button: '1zu1 Call starten',
    }
  }, [activeSession])

  const handleJoinCall = async () => {
    if (!hasCoachingAccess) {
      setCoachingGateNoticeOpen(true)
      return
    }
    if (!frameHostRef.current) {
      setCallState('error')
      setCallError('Callfläche konnte nicht initialisiert werden.')
      return
    }
    if (!activeRoomConfigured) {
      setCallState('error')
      setCallError(getDailyMissingConfigMessage(activeSession))
      return
    }

    setCallError(null)
    setCallState('joining')
    await destroyCallFrame(true)

    const frame = DailyIframe.createFrame(frameHostRef.current, {
      showLeaveButton: true,
      iframeStyle: {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        border: '0',
        borderRadius: '18px',
        backgroundColor: '#eef7f7',
      },
    })

    const frameWithTheme = frame as DailyCall & { setTheme?: (theme: unknown) => void }
    if (typeof frameWithTheme.setTheme === 'function') {
      frameWithTheme.setTheme({
        colors: {
          accent: '#6ecfc3',
          accentText: '#0e2a2f',
          background: '#eef7f7',
          baseText: '#1d2a31',
        },
      })
    }

    callFrameRef.current = frame
    frame.on('joined-meeting', () => {
      setCallState('joined')
    })
    frame.on('left-meeting', () => {
      setCallState('left')
    })
    frame.on('error', (event) => {
      const message =
        typeof event?.errorMsg === 'string' && event.errorMsg.length > 0
          ? event.errorMsg
          : 'Daily Verbindung fehlgeschlagen.'
      setCallState('error')
      setCallError(message)
    })

    try {
      await frame.join({
        url: activeRoomUrl,
        userName: user?.email?.split('@')[0] ?? 'elea Student',
        startAudioOff: true,
      })
    } catch (error) {
      setCallState('error')
      setCallError(error instanceof Error ? error.message : 'Call konnte nicht gestartet werden.')
      await destroyCallFrame(false)
    }
  }

  const handleLeaveCall = async () => {
    await destroyCallFrame(true)
    setCallState('left')
  }

  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
  }, [bookings])

  return (
    <div className="page coaching-page">
      <div className="page-card">
        <h1>Coaching</h1>
        <p>Gruppen-Calls und 1zu1 laufen direkt in elea über Daily - ohne Plattformwechsel.</p>
        <div className="coaching-top-meta">
          <div className="pill">Plan: {plan.toUpperCase()}</div>
          <div className={`pill ${hasCoachingAccess ? 'is-on' : 'is-off'}`}>
            {hasCoachingAccess ? 'Betreuung aktiv' : 'Betreuung gesperrt'}
          </div>
        </div>
      </div>

      <div className="page-card coaching-live-card">
        <div className="coaching-live-head">
          <div>
            <h2>Live-Call Bereich</h2>
            <p>{activeSessionMeta.sub}</p>
          </div>
          <div className={`coaching-live-state is-${callState}`}>{callStateLabel}</div>
        </div>

        <div className="coaching-session-switch" role="tablist" aria-label="Call Typ">
          <button
            type="button"
            className={activeSession === 'group' ? 'active' : ''}
            onClick={() => setActiveSession('group')}
          >
            Gruppen-Call
          </button>
          <button
            type="button"
            className={activeSession === 'oneToOne' ? 'active' : ''}
            onClick={() => setActiveSession('oneToOne')}
          >
            1zu1 Call
          </button>
        </div>

        <div className="coaching-call-shell">
          <div ref={frameHostRef} className="coaching-daily-frame" />
          {(!hasCoachingAccess || !activeRoomConfigured) && (
            <div className="coaching-call-overlay">
              <strong>{activeSessionMeta.title}</strong>
              <p>
                {!hasCoachingAccess
                  ? 'Für Gruppen-Calls und 1zu1 brauchst du einen bezahlten BASIC- oder PRO-Plan.'
                  : getDailyMissingConfigMessage(activeSession)}
              </p>
            </div>
          )}
        </div>

        <div className="coaching-live-actions">
          <button className="primary" type="button" onClick={handleJoinCall} disabled={callState === 'joining'}>
            {activeSessionMeta.button}
          </button>
          <button className="ghost" type="button" onClick={handleLeaveCall} disabled={callState !== 'joined'}>
            Call verlassen
          </button>
        </div>

        {callError && <p className="coaching-live-error">{callError}</p>}

        {coachingGateNoticeOpen && (
          <div className="plan-gate-tooltip">
            <h4>Betreuung nur mit aktivem BASIC/PRO</h4>
            <p>Du brauchst einen bezahlten BASIC oder PRO Plan, um am Gruppen-Call und an 1zu1 Calls teilzunehmen.</p>
            <div className="referral-cta">
              <button className="plan-gate-link" type="button" onClick={() => navigate('/payments')}>
                Plan aktivieren
              </button>
            </div>
            <span className="plan-gate-tip" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="page-card">
        <h2>Deine Termine</h2>
        {sortedBookings.length === 0 ? (
          <div className="muted">Noch keine Termine gebucht.</div>
        ) : (
          <div className="feed">
            {sortedBookings.map((booking) => (
              <div key={`${booking.date}-${booking.time}`} className="plan-item">
                <div>
                  <div className="plan-title">1:1 PhD Call</div>
                  <div className="plan-sub">{booking.date} - {booking.time}</div>
                </div>
                <span className="pill">Fix</span>
              </div>
            ))}
          </div>
        )}
        <div className="plan-item">
          <div>
            <div className="plan-title">Gruppen Call</div>
            <div className="plan-sub">Jeden Samstag - 11:00</div>
          </div>
          <div className="checkbox-wrapper-5 plan-fix-toggle">
            <div className="check">
              <input id="group-call-fix-coaching" type="checkbox" checked readOnly />
              <label htmlFor="group-call-fix-coaching" aria-label="Gruppen Call fix" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CoachingPage
