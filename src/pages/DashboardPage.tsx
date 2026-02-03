import { useEffect, useMemo, useState } from 'react'
import { useCountdown } from '../hooks/useCountdown'
import { useStress } from '../hooks/useStress'
import type { Plan, Profile } from '../lib/storage'
import { STORAGE_KEYS, formatCountdown, parseJson, todayIso } from '../lib/storage'

const initialProfile: Profile = {
  studiengang: '',
  hochschule: '',
  abgabedatum: todayIso(),
  status: '0',
  zielnote: '1,3',
}

const stressWarningThreshold = 50

const DashboardPage = () => {
  const [profile, setProfile] = useState<Profile | null>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.profile), null)
  )
  const [plan, setPlan] = useState<Plan>(() => parseJson(localStorage.getItem(STORAGE_KEYS.plan), 'free'))
  const [commitmentSeen, setCommitmentSeen] = useState<boolean>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.commitmentSeen), false)
  )
  const stress = useStress()
  const countdownTarget = profile?.abgabedatum ?? todayIso()
  const countdown = useCountdown(countdownTarget)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile))
  }, [profile])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(plan))
  }, [plan])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.commitmentSeen, JSON.stringify(commitmentSeen))
  }, [commitmentSeen])

  const showOnboarding = profile === null
  const showCommitment = profile !== null && !commitmentSeen
  const showCommitmentBanner = profile?.zielnote === '0,7' || profile?.zielnote === '1,0' || profile?.zielnote === '1,3'

  const progressValue = useMemo(() => {
    const video = 30
    const checklist = 30
    const uploads = 20
    const coaching = plan === 'free' ? 0 : 20
    const base = (Number(profile?.status ?? '0') / 100) * (video + checklist + uploads)
    return Math.min(Math.round(base + coaching), 100)
  }, [plan, profile?.status])

  const riskLevel = useMemo(() => {
    const progress = Number(profile?.status ?? '0')
    const days = Math.max(
      Math.floor((new Date(profile?.abgabedatum ?? todayIso()).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      0
    )
    const stressValue = stress.value
    const coaching = plan !== 'free'

    let riskScore = 0
    if (progress < 30) riskScore += 1
    if (days < 90) riskScore += 1
    if (stressValue > 60) riskScore += 1
    if (!coaching) riskScore += 1

    if (riskScore >= 3) return 'hoch'
    if (riskScore === 2) return 'mittel'
    return 'niedrig'
  }, [plan, profile?.abgabedatum, profile?.status, stress.value])

  const riskLabel = riskLevel === 'hoch' ? '🔴 Hoch' : riskLevel === 'mittel' ? '🟡 Mittel' : '🟢 Niedrig'

  const hasStressWarning = useMemo(() => {
    const lastTwoDays = stress.log.slice(-2)
    if (lastTwoDays.length < 2) return false
    return lastTwoDays.every((entry) => entry.value > stressWarningThreshold)
  }, [stress.log])

  return (
    <>
      <main className="dashboard">
        <aside className="panel left-panel">
          <div className="panel-card countdown-card">
            <h3>Deadline-Timer</h3>
            <div className="countdown-inline">
              {formatCountdown(countdown.days, countdown.hours, countdown.minutes, countdown.seconds)}
            </div>
          </div>
          <div className="panel-card timetable-card">
            <div className="panel-head">
              <h3>Dein Zeitplan</h3>
              <div className="nav-arrows">
                <button className="icon-button">‹</button>
                <button className="icon-button">›</button>
              </div>
            </div>
            <div className="calendar">
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day, index) => (
                <div key={day} className={`calendar-day ${index === 3 ? 'active' : ''}`}>
                  <span>{day}</span>
                  <strong>{index + 3}</strong>
                </div>
              ))}
            </div>
            <div className="timetable-slot">
              <div className="slot-time">13:00 – 14:00</div>
              <div className="slot-card">
                <div className="slot-avatar">AN</div>
                <div>
                  <div className="slot-title">Dr. Anna Neuhaus</div>
                  <div className="slot-sub">Methodik · 1:1 Coaching</div>
                </div>
                <button className="slot-action">▶</button>
              </div>
            </div>
            <div className="timetable-slot">
              <div className="slot-time">16:30 – 17:15</div>
              <div className="slot-card">
                <div className="slot-avatar">QA</div>
                <div>
                  <div className="slot-title">Community Live</div>
                  <div className="slot-sub">Struktur · Q&A</div>
                </div>
                <button className="slot-action">▶</button>
              </div>
            </div>
          </div>
        </aside>

        <section className="panel hero-panel">
          <div className="hero-card">
            <div className="hero-visual">
              <div className="hero-visual-card brain-card">
                <img className="brain-image" src="/brain-hero.png" alt="Gehirn" />
                <div className="hero-float left">
                  <div className="metric floating">
                    <span>Fortschritt</span>
                    <strong>{progressValue}%</strong>
                  </div>
                  <div className="metric floating">
                    <span>Risiko-Level</span>
                    <strong>{riskLabel}</strong>
                  </div>
                </div>
                <div className="hero-float right">
                  <div className="metric floating">
                    <span>Stress heute</span>
                    <strong>{stress.value}/100</strong>
                  </div>
                  <div className="metric floating">
                    <span>Zielnote</span>
                    <strong>{profile?.zielnote ?? '1,3'}</strong>
                  </div>
                </div>
              </div>
              <div className="hero-visual-card doc-card">
                <h4>Dokumente</h4>
                <div className="doc-list compact">
                  <div className="doc-item">
                    <div>
                      <div className="doc-title">Betreuungsplan</div>
                      <div className="doc-sub">28 Feb 2026</div>
                    </div>
                    <span className="doc-icon">DOC</span>
                  </div>
                  <div className="doc-item">
                    <div>
                      <div className="doc-title">Methodik-Notiz</div>
                      <div className="doc-sub">24 Feb 2026</div>
                    </div>
                    <span className="doc-icon">DOC</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="hero-actions three">
              <div className="score-card">
                <h4>Quality Score™</h4>
                <div className="score-value">{plan === 'pro' ? '67 → Ziel 85' : 'Nur PRO'}</div>
                <div className="score-bar">
                  <div className="score-fill" style={{ width: plan === 'pro' ? '67%' : '25%' }}></div>
                </div>
              </div>
              <div className="recommendations">
                <h4>Empfehlungen</h4>
                <ul>
                  <li>Exposé-Deadline setzen</li>
                  <li>Methodik-Kapitel strukturieren</li>
                  <li>Coaching-Slot buchen</li>
                </ul>
                {showCommitmentBanner && (
                  <div className="commitment-note">
                    Hohe Ziele brauchen Struktur. Deine Erfolgsquote steigt mit Coaching um 42%.
                  </div>
                )}
              </div>
              <div className="plan-select-card">
                <h4>Plan wählen</h4>
                <div className="plan-switch">
                  {(['free', 'basic', 'pro'] as Plan[]).map((item) => (
                    <button
                      key={item}
                      className={`plan-button ${plan === item ? 'active' : ''}`}
                      onClick={() => setPlan(item)}
                    >
                      {item.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="plan-details">
                  {plan === 'free' && (
                    <ul>
                      <li>Videos + Checklisten</li>
                      <li>Countdown & Basis-Dashboard</li>
                      <li>Kein Feedback</li>
                    </ul>
                  )}
                  {plan === 'basic' && (
                    <ul>
                      <li>1× Coaching/Woche</li>
                      <li>Formatvorlagen + E-Mail Support</li>
                      <li>Psychology Mode</li>
                    </ul>
                  )}
                  {plan === 'pro' && (
                    <ul>
                      <li>2× Coaching/Woche</li>
                      <li>Exposé- & Gliederungsfeedback</li>
                      <li>Quality Score™ + Rescue</li>
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          {hasStressWarning && (
            <div className="stress-warning compact">
              Dein Stress ist erhöht. Wir empfehlen persönliche Betreuung.
            </div>
          )}

        </section>

        <aside className="panel right-panel">
          <div className="panel-card">
            <div className="panel-head">
              <h3>Betreuungsplan</h3>
              <button className="icon-button">↗</button>
            </div>
            <div className="plan-item">
              <div>
                <div className="plan-title">Diagnose</div>
                <div className="plan-sub">Temporale Belastung · {riskLabel}</div>
              </div>
              <span className="pill">Heute</span>
            </div>
            <div className="plan-item">
              <div>
                <div className="plan-title">Nächstes Coaching</div>
                <div className="plan-sub">Methode & Struktur</div>
              </div>
              <span className="pill">13:30</span>
            </div>
            <div className="plan-item">
              <div>
                <div className="plan-title">Deep-Work-Block</div>
                <div className="plan-sub">Schreiben · 90 Minuten</div>
              </div>
              <span className="pill">16:00</span>
            </div>
          </div>
          <div className="panel-card tools-inline">
            <div className="panel-head">
              <h3>Meine Tools</h3>
              <div className="nav-arrows">
                <button className="icon-button">‹</button>
                <button className="icon-button">›</button>
              </div>
            </div>
            <div className="cards-grid compact tools-row">
              <div className="mini-card">
                <div className="mini-index">01</div>
                <div className="mini-title">Online School</div>
                <div className="mini-sub">Video-Kapitel</div>
              </div>
              <div className="mini-card">
                <div className="mini-index">02</div>
                <div className="mini-title">Abgabe-Dossier</div>
                <div className="mini-sub">PDF</div>
              </div>
              <div className="mini-card">
                <div className="mini-index">03</div>
                <div className="mini-title">Formatvorlage</div>
                <div className="mini-sub">Word & LaTeX</div>
              </div>
              <div className="mini-card">
                <div className="mini-index">04</div>
                <div className="mini-title">Beispielarbeit 1,3</div>
                <div className="mini-sub">PRO</div>
              </div>
            </div>
          </div>

        </aside>
      </main>

      {showOnboarding && (
        <OnboardingModal
          initialProfile={initialProfile}
          onSubmit={(data) => {
            setProfile(data)
          }}
        />
      )}

      {showCommitment && profile && (
        <CommitmentModal profile={profile} onClose={() => setCommitmentSeen(true)} />
      )}
    </>
  )
}

const OnboardingModal = ({
  initialProfile,
  onSubmit,
}: {
  initialProfile: Profile
  onSubmit: (profile: Profile) => void
}) => {
  const [form, setForm] = useState<Profile>(initialProfile)

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Profil-Wizard</h2>
        <p>Pflichtfelder, damit dein System perfekt plant.</p>
        <div className="form-grid">
          <label>
            Studiengang*
            <input
              value={form.studiengang}
              onChange={(event) => setForm({ ...form, studiengang: event.target.value })}
              placeholder="z. B. Psychologie B.Sc."
            />
          </label>
          <label>
            Hochschule/Uni
            <input
              value={form.hochschule ?? ''}
              onChange={(event) => setForm({ ...form, hochschule: event.target.value })}
              placeholder="optional"
            />
          </label>
          <label>
            Abgabedatum*
            <input
              type="date"
              value={form.abgabedatum}
              onChange={(event) => setForm({ ...form, abgabedatum: event.target.value })}
            />
          </label>
          <label>
            Status*
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value as Profile['status'] })}
            >
              <option value="0">0%</option>
              <option value="30">30%</option>
              <option value="50">50%</option>
              <option value="80">80%</option>
            </select>
          </label>
          <label>
            Zielnote*
            <select
              value={form.zielnote}
              onChange={(event) => setForm({ ...form, zielnote: event.target.value as Profile['zielnote'] })}
            >
              {['0,7', '1,0', '1,3', '1,7', '2,0', '2,3', '2,7', '3,0'].map((note) => (
                <option key={note} value={note}>
                  {note}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="primary full"
          onClick={() => {
            if (form.studiengang.trim().length === 0) return
            onSubmit(form)
          }}
        >
          Weiter zum Dashboard
        </button>
      </div>
    </div>
  )
}

const CommitmentModal = ({ profile, onClose }: { profile: Profile; onClose: () => void }) => {
  return (
    <div className="modal-backdrop">
      <div className="modal commitment">
        <div className="commitment-content">
          <div>
            <h2>Dein Commitment</h2>
            <p>
              Zielnote: <strong>{profile.zielnote}</strong>
              <br />
              Deadline: <strong>{profile.abgabedatum}</strong>
            </p>
            <p>Wir begleiten dich. Strukturiert, stressfrei, mit System.</p>
            <button className="primary" onClick={onClose}>
              Verstanden
            </button>
          </div>
          <div className="commitment-visual">
            <div className="commitment-photo">ANNA</div>
            <div className="commitment-signature">Anna Neuhaus · PhD</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
