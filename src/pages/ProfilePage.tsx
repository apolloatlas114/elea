import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  computeProductivitySnapshot,
  filterProductivityMetricsByDays,
  loadProductivityMetrics,
  type ProductivityMetrics,
} from '../lib/productivity'
import type { MentalCheckInEntry, Profile, StudyMaterial, TodoItem } from '../lib/storage'
import { STORAGE_KEYS, normalizeStudyMaterials, normalizeTodos, parseJson, toLocalIsoDate } from '../lib/storage'

const DAY_OPTIONS = [7, 14, 30, 90] as const

const toTimestamp = (value: string) => {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const average = (values: number[]) => {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const inWindow = (iso: string, startMs: number, endMs: number) => {
  const ts = toTimestamp(iso)
  return ts >= startMs && ts <= endMs
}

const selectProductivityWindow = (metrics: ProductivityMetrics, startMs: number, endMs: number): ProductivityMetrics => {
  const inRange = (iso: string) => inWindow(iso, startMs, endMs)
  return {
    ...metrics,
    quiz: {
      answerSpeedSeconds: metrics.quiz.answerSpeedSeconds.filter((entry) => inRange(entry.recordedAt)),
      attempts: metrics.quiz.attempts.filter((entry) => inRange(entry.finishedAt)),
    },
    voice: {
      samples: metrics.voice.samples.filter((entry) => inRange(entry.recordedAt)),
    },
    mental: {
      opens: metrics.mental.opens.filter(inRange),
      saves: metrics.mental.saves.filter(inRange),
      clickSpeedMs: metrics.mental.clickSpeedMs.filter((entry) => inRange(entry.recordedAt)),
      checkInSignatures: metrics.mental.checkInSignatures.filter((entry) => inRange(entry.recordedAt)),
    },
  }
}

const ProfilePage = () => {
  const { logout } = useAuth()
  const [windowDays, setWindowDays] = useState<(typeof DAY_OPTIONS)[number]>(30)
  const profile = parseJson<Profile | null>(localStorage.getItem(STORAGE_KEYS.profile), null)
  const todos = normalizeTodos(parseJson<TodoItem[]>(localStorage.getItem(STORAGE_KEYS.todos), []))
  const studyMaterials = normalizeStudyMaterials(parseJson<StudyMaterial[]>(localStorage.getItem(STORAGE_KEYS.studyMaterials), []))
  const mentalCheckIns = parseJson<MentalCheckInEntry[]>(localStorage.getItem(STORAGE_KEYS.mentalCheckIns), []).filter((entry) =>
    typeof entry?.createdAt === 'string' && typeof entry?.value === 'number' && typeof entry?.energy === 'number'
  )
  const allProductivity = loadProductivityMetrics()

  const now = Date.now()
  const startMs = now - windowDays * 24 * 60 * 60 * 1000
  const currentMetrics = filterProductivityMetricsByDays(allProductivity, windowDays)
  const productivity = computeProductivitySnapshot(currentMetrics)

  const quizAttemptsInWindow = useMemo(
    () =>
      studyMaterials
        .flatMap((item) => item.quizHistory ?? [])
        .filter((attempt) => inWindow(attempt.finishedAt, startMs, now)),
    [studyMaterials, startMs, now]
  )

  const learningMinutes = Math.round(quizAttemptsInWindow.reduce((sum, attempt) => sum + Math.max(0, attempt.secondsSpent), 0) / 60)
  const quizAverage = Math.round(average(quizAttemptsInWindow.map((attempt) => attempt.percent)))
  const quizCompletionRate = quizAttemptsInWindow.length
    ? Math.round(
        (quizAttemptsInWindow.filter((attempt) => attempt.questionResults && attempt.questionResults.length >= attempt.total).length /
          quizAttemptsInWindow.length) *
          100
      )
    : 0

  const todosInRange = todos.filter((todo) => typeof todo.date === 'string' && inWindow(`${todo.date}T12:00:00`, startMs, now))
  const taskCompletionRate = todosInRange.length > 0 ? Math.round((todosInRange.filter((todo) => todo.done).length / todosInRange.length) * 100) : 0

  const mentalInRange = mentalCheckIns.filter((entry) => inWindow(entry.createdAt, startMs, now))
  const avgStress = Math.round(average(mentalInRange.map((entry) => entry.value)))
  const avgEnergy = Math.round(average(mentalInRange.map((entry) => entry.energy)))

  const last7Start = now - 7 * 24 * 60 * 60 * 1000
  const prev7Start = now - 14 * 24 * 60 * 60 * 1000
  const previousWeekMetrics = selectProductivityWindow(allProductivity, prev7Start, last7Start)
  const currentWeekMetrics = selectProductivityWindow(allProductivity, last7Start, now)
  const previousWeekSnapshot = computeProductivitySnapshot(previousWeekMetrics)
  const currentWeekSnapshot = computeProductivitySnapshot(currentWeekMetrics)
  const deltaWeekScore = currentWeekSnapshot.score - previousWeekSnapshot.score

  const trendSeries = useMemo(() => {
    const days = Math.min(windowDays, 14)
    const result: Array<{ label: string; score: number | null }> = []

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = new Date()
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - offset)
      const key = toLocalIsoDate(day)
      const nextDay = new Date(day)
      nextDay.setDate(nextDay.getDate() + 1)

      const tasksDay = todos.filter((todo) => todo.date === key)
      const taskScore = tasksDay.length > 0 ? (tasksDay.filter((todo) => todo.done).length / tasksDay.length) * 100 : null

      const quizDay = studyMaterials
        .flatMap((item) => item.quizHistory ?? [])
        .filter((attempt) => inWindow(attempt.finishedAt, day.getTime(), nextDay.getTime()))
      const quizScore = quizDay.length > 0 ? average(quizDay.map((attempt) => attempt.percent)) : null

      const mentalDay = mentalCheckIns.filter((entry) => inWindow(entry.createdAt, day.getTime(), nextDay.getTime()))
      const mentalScore =
        mentalDay.length > 0
          ? Math.round((100 - average(mentalDay.map((entry) => entry.value))) * 0.6 + average(mentalDay.map((entry) => entry.energy)) * 0.4)
          : null

      const components = [taskScore, quizScore, mentalScore].filter((value): value is number => value !== null)
      const score = components.length > 0 ? Math.round(average(components)) : null

      result.push({
        label: day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        score,
      })
    }
    return result
  }, [windowDays, todos, studyMaterials, mentalCheckIns])

  const phaseInsights = useMemo(() => {
    const insights: string[] = []
    if (productivity.quizBlockade) {
      insights.push('Quiz-Blockade erkannt: Mehrere Quiz wurden nicht vollständig beendet. Starte mit kürzeren Lernblöcken von 15 bis 20 Minuten.')
    }
    if (productivity.quizUnsureShare > 35) {
      insights.push('Hohe Unsicherheit im Quiz: Viele Antworten dauern über 20 Sekunden. Wiederhole die Kernkonzepte vor dem nächsten Test.')
    }
    if (productivity.voiceFillerRatio > 15) {
      insights.push('Sprachmuster zeigt Unsicherheit: Der Anteil an Füllwörtern ist erhöht. Definiere vor der Aufnahme zwei bis drei Stichpunkte.')
    }
    if (productivity.mentalSkipRate > 30) {
      insights.push('Mental-Check wird häufig übersprungen. Setze einen festen täglichen Zeitpunkt, damit das Muster stabil wird.')
    }
    if (taskCompletionRate < 55 && todosInRange.length >= 4) {
      insights.push('Niedrige Task-Completion-Rate. Plane pro Tag weniger Aufgaben und priorisiere nur die Top-3.')
    }
    if (quizAverage >= 75 && taskCompletionRate >= 65 && productivity.score >= 65) {
      insights.push('Starke Phase: Quiz-Ergebnisse, Aufgaben-Umsetzung und Produktivität steigen gleichzeitig.')
    }
    if (insights.length === 0) {
      insights.push('Datenlage aktuell stabil. Für präzisere Analysen regelmäßig Quiz abschließen, Voice-Input nutzen und Mental-Check speichern.')
    }
    return insights
  }, [productivity, taskCompletionRate, todosInRange.length, quizAverage])

  return (
    <div className="page profile-page profile-lab-page">
      <section className="page-card profile-summary-card">
        <h1>Profil</h1>
        <p>Deine Stammdaten für Planung und Psychologie.</p>
        {profile ? (
          <div className="profile-grid">
            <div>
              <div className="muted">Studiengang</div>
              <div>{profile.studiengang}</div>
            </div>
            <div>
              <div className="muted">Hochschule</div>
              <div>{profile.hochschule || '—'}</div>
            </div>
            <div>
              <div className="muted">Abgabedatum</div>
              <div>{profile.abgabedatum}</div>
            </div>
            <div>
              <div className="muted">Status</div>
              <div>{profile.status}%</div>
            </div>
            <div>
              <div className="muted">Zielnote</div>
              <div>{profile.zielnote}</div>
            </div>
          </div>
        ) : (
          <div className="muted">Kein Profil vorhanden. Bitte im Dashboard ausfüllen.</div>
        )}
        <div className="page-actions">
          <button className="ghost" onClick={() => logout()}>
            Logout
          </button>
        </div>
      </section>

      <section className="page-card profile-dashboard-card">
        <div className="profile-dashboard-head">
          <div>
            <h2>Analytics Dashboard</h2>
            <p>Persönliche Metriken auf Basis deiner echten Aktivitäten in elea.</p>
          </div>
          <label className="profile-dashboard-range">
            <span>Zeitraum</span>
            <select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value) as (typeof DAY_OPTIONS)[number])}>
              {DAY_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  Letzte {days} Tage
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="profile-dashboard-hero profile-glass-card">
          <div className="profile-dashboard-hero-main">
            <span>Produktivitätsscore</span>
            <strong>{productivity.score}%</strong>
            <small>Flow-Anteil {Math.round(productivity.quizFlowShare)}% · Unsicherheit {Math.round(productivity.quizUnsureShare)}%</small>
          </div>
          <div className="profile-dashboard-hero-compare">
            <span>7 Tage vs. Vorwoche</span>
            <strong className={deltaWeekScore >= 0 ? 'is-up' : 'is-down'}>
              {deltaWeekScore >= 0 ? '+' : ''}
              {deltaWeekScore} Punkte
            </strong>
            <small>
              Aktuell {currentWeekSnapshot.score}% · Vorwoche {previousWeekSnapshot.score}%
            </small>
          </div>
        </div>

        <div className="profile-dashboard-kpi-grid">
          <article className="profile-glass-card profile-kpi-card">
            <span>Lernzeit</span>
            <strong>{learningMinutes} Min</strong>
            <small>aus Quiz- und Lernlabor-Sessions</small>
          </article>
          <article className="profile-glass-card profile-kpi-card">
            <span>Task-Completion-Rate</span>
            <strong>{taskCompletionRate}%</strong>
            <small>{todosInRange.length} Aufgaben im Zeitraum</small>
          </article>
          <article className="profile-glass-card profile-kpi-card">
            <span>Quiz-Performance</span>
            <strong>{quizAverage || 0}%</strong>
            <small>Abschlussquote {quizCompletionRate}%</small>
          </article>
          <article className="profile-glass-card profile-kpi-card">
            <span>Voice-Input</span>
            <strong>{Math.round(productivity.voiceWpm || 0)} WPM</strong>
            <small>Pausen {productivity.voicePauseSeconds || 0}s · Füllwörter {productivity.voiceFillerRatio || 0}%</small>
          </article>
          <article className="profile-glass-card profile-kpi-card">
            <span>Mental Health Muster</span>
            <strong>{Math.round(productivity.mentalPatternRepeatShare || 0)}%</strong>
            <small>Ø Stress {avgStress || 0} · Ø Energie {avgEnergy || 0}</small>
          </article>
        </div>

        <div className="profile-dashboard-deep-grid">
          <article className="profile-glass-card profile-trend-card">
            <h3>Leistungstrend</h3>
            <p>Tagesscore aus Aufgaben, Quiz und Mental-Check.</p>
            <div className="profile-trend-bars">
              {trendSeries.map((entry) => (
                <div key={entry.label} className="profile-trend-col">
                  <div className="profile-trend-track">
                    <i style={{ height: `${entry.score ?? 0}%` }} />
                  </div>
                  <strong>{entry.score ?? 0}</strong>
                  <span>{entry.label}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="profile-glass-card profile-pattern-card">
            <h3>Quiz-Test Patterns</h3>
            <ul>
              <li>Antwortgeschwindigkeit &lt;8s: {Math.round(productivity.quizFlowShare)}% (Flow)</li>
              <li>Antwortgeschwindigkeit &gt;20s: {Math.round(productivity.quizUnsureShare)}% (Unsicherheit)</li>
              <li>Blockade-Status: {productivity.quizBlockade ? 'Ja' : 'Nein'}</li>
            </ul>
          </article>

          <article className="profile-glass-card profile-pattern-card">
            <h3>Voice Input Analysis</h3>
            <ul>
              <li>WPM: {Math.round(productivity.voiceWpm || 0)} ({(productivity.voiceWpm || 0) >= 120 ? 'Flow State' : 'unter Flow'})</li>
              <li>Pausenlänge: {productivity.voicePauseSeconds || 0}s</li>
              <li>Tonlage: {productivity.voiceTone === 'hoch' ? 'hoch (excited)' : 'tief (focused)'}</li>
            </ul>
          </article>

          <article className="profile-glass-card profile-pattern-card">
            <h3>Mental Health Checker Clicks</h3>
            <ul>
              <li>Click-Speed: {productivity.mentalClickSpeedMs || 0}ms</li>
              <li>Pattern Wiederholung: {Math.round(productivity.mentalPatternRepeatShare || 0)}%</li>
              <li>Skip-Rate: {Math.round(productivity.mentalSkipRate || 0)}%</li>
            </ul>
          </article>
        </div>

        <div className="profile-phase-analysis">
          <h3>Phasenanalyse: Warum gut/schlecht und was verbessern</h3>
          {phaseInsights.map((item) => (
            <div key={item} className="profile-glass-card profile-phase-item">
              <p>{item}</p>
            </div>
          ))}
        </div>

        <div className="profile-data-footnote muted">
          Datenbasis: Tasks ({todos.length}), Quiz-Versuche ({quizAttemptsInWindow.length}), Voice-Samples ({currentMetrics.voice.samples.length}),
          Mental-Check-ins ({mentalInRange.length}), Produktivitäts-Events.
        </div>
      </section>
    </div>
  )
}

export default ProfilePage

