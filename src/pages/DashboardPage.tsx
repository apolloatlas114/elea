import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCountdown } from '../hooks/useCountdown'
import { useStress } from '../hooks/useStress'
import { useAuth } from '../context/AuthContext'
import type {
  AssessmentResult,
  BookingEntry,
  DeadlineLogEntry,
  Plan,
  Profile,
  SchoolProgress,
  ThesisDocument,
  TodoItem,
} from '../lib/storage'
import { STORAGE_KEYS, TIME_SLOTS, formatCountdown, normalizeTodos, parseJson, todayIso } from '../lib/storage'
import {
  appendDeadlineLog,
  hasPaidCoachingPlan,
  loadAssessment,
  loadBookings,
  loadPlan,
  loadProfile,
  loadSchoolProgress,
  loadThesisDocuments,
  loadTodos,
  saveAssessment,
  saveBooking,
  savePlan,
  saveProfile,
} from '../lib/supabaseData'

const initialProfile: Profile = {
  studiengang: '',
  hochschule: '',
  abgabedatum: todayIso(),
  status: '0',
  zielnote: '1,3',
}

const stressWarningThreshold = 50
const weekdayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

type AssessmentOption = {
  id: string
  label: string
  support: number
}

type AssessmentQuestion = {
  id: string
  title: string
  options: AssessmentOption[]
}

const assessmentQuestions: AssessmentQuestion[] = [
  {
    id: 'topic',
    title: 'Hast du bereits ein festes Thema?',
    options: [
      { id: 'topic_fixed', label: 'Ja, Thema ist fix', support: 0 },
      { id: 'topic_ideas', label: 'Ideen, aber nicht final', support: 1 },
      { id: 'topic_none', label: 'Noch kein Thema', support: 2 },
    ],
  },
  {
    id: 'expose',
    title: 'Expose / Gliederung vorhanden?',
    options: [
      { id: 'expose_done', label: 'Expose fertig', support: 0 },
      { id: 'expose_draft', label: 'Entwurf vorhanden', support: 1 },
      { id: 'expose_none', label: 'Noch nichts', support: 2 },
    ],
  },
  {
    id: 'method',
    title: 'Methodik geklaert?',
    options: [
      { id: 'method_clear', label: 'Ja, klar', support: 0 },
      { id: 'method_partial', label: 'Teilweise', support: 1 },
      { id: 'method_unclear', label: 'Noch unklar', support: 2 },
    ],
  },
  {
    id: 'writing',
    title: 'Schreibfortschritt?',
    options: [
      { id: 'writing_30', label: 'Mehr als 30%', support: 0 },
      { id: 'writing_start', label: '1-30%', support: 1 },
      { id: 'writing_none', label: 'Noch nicht gestartet', support: 2 },
    ],
  },
  {
    id: 'deadline',
    title: 'Zeit bis Abgabe?',
    options: [
      { id: 'deadline_long', label: 'Mehr als 6 Monate', support: 0 },
      { id: 'deadline_mid', label: '3-6 Monate', support: 1 },
      { id: 'deadline_short', label: 'Unter 3 Monate', support: 2 },
    ],
  },
]

const buildAssessmentResult = (answers: Record<string, string>): AssessmentResult => {
  let score = 0

  assessmentQuestions.forEach((question) => {
    const option = question.options.find((item) => item.id === answers[question.id])
    if (!option) return
    score += option.support
  })

  const recommendedPlan: Plan = score >= 8 ? 'pro' : score >= 4 ? 'basic' : 'free'
  const recommendationCopy: Record<Plan, string[]> = {
    free: ['Starker Start im Selbstlernmodus', 'Struktur durch Videos + Checklisten', 'Upgrade jederzeit moeglich'],
    basic: ['Mehr Struktur im Wochenrhythmus', 'Feedback spart Zeit bei Korrekturen', 'Support fuer offene Fragen'],
    pro: ['Maximale Begleitung bis zur Abgabe', 'Intensives Feedback senkt Risiko', 'Prioritaet im Support'],
  }

  return {
    answers,
    score,
    recommendedPlan,
    reasons: recommendationCopy[recommendedPlan],
    completedAt: new Date().toISOString(),
  }
}

const dateKey = (offsetDays: number) => {
  const date = new Date()
  date.setDate(date.getDate() - offsetDays)
  return date.toISOString().slice(0, 10)
}

const averageValue = (values: number[]) => {
  if (values.length === 0) return null
  const sum = values.reduce((total, value) => total + value, 0)
  return Math.round(sum / values.length)
}

const formatDocDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--'
  return parsed.toLocaleDateString()
}

const isWeekday = (isoDate: string) => {
  if (!isoDate) return false
  const date = new Date(`${isoDate}T00:00:00`)
  const day = date.getDay()
  return day >= 1 && day <= 5
}

const pad2 = (value: number) => value.toString().padStart(2, '0')

const getEasterSunday = (year: number) => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const holidayCache = new Map<number, Set<string>>()

const getHolidaySet = (year: number) => {
  const cached = holidayCache.get(year)
  if (cached) return cached
  const set = new Set<string>()
  const addFixed = (month: number, day: number) => {
    set.add(`${year}-${pad2(month)}-${pad2(day)}`)
  }

  addFixed(1, 1)
  addFixed(5, 1)
  addFixed(10, 3)
  addFixed(12, 25)
  addFixed(12, 26)

  const easter = getEasterSunday(year)
  const addOffset = (offset: number) => {
    const date = new Date(easter)
    date.setDate(date.getDate() + offset)
    set.add(`${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`)
  }

  addOffset(-2)
  addOffset(1)
  addOffset(39)
  addOffset(50)

  holidayCache.set(year, set)
  return set
}

const isHoliday = (isoDate: string) => {
  if (!isoDate) return false
  const year = Number(isoDate.slice(0, 4))
  if (Number.isNaN(year)) return false
  return getHolidaySet(year).has(isoDate)
}

const WEEKDAY_AVAILABILITY: Record<number, { start: string; end: string }[]> = {
  1: [{ start: '09:00', end: '18:00' }],
  2: [{ start: '09:00', end: '18:00' }],
  3: [{ start: '09:00', end: '18:00' }],
  4: [{ start: '09:00', end: '18:00' }],
  5: [{ start: '09:00', end: '18:00' }],
}

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map((value) => Number(value))
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0
  return hours * 60 + minutes
}

const minutesToTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${pad2(hours)}:${pad2(mins)}`
}

const buildSlots = (start: string, end: string, stepMinutes: number) => {
  const startMin = timeToMinutes(start)
  const endMin = timeToMinutes(end)
  const slots: string[] = []
  for (let cursor = startMin; cursor + stepMinutes <= endMin; cursor += stepMinutes) {
    slots.push(minutesToTime(cursor))
  }
  return slots
}

const DashboardPage = () => {
  const [profile, setProfile] = useState<Profile | null>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.profile), null)
  )
  const [plan, setPlan] = useState<Plan>(() => parseJson(localStorage.getItem(STORAGE_KEYS.plan), 'free'))
  const [assessment, setAssessment] = useState<AssessmentResult | null>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.assessment), null)
  )
  const [, setSchoolProgress] = useState<SchoolProgress | null>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.schoolProgress), null)
  )
  const [documents, setDocuments] = useState<ThesisDocument[]>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.thesisDocuments), [])
  )
  const [todos, setTodos] = useState<TodoItem[]>(() =>
    normalizeTodos(parseJson(localStorage.getItem(STORAGE_KEYS.todos), []))
  )
  const [bookingLog, setBookingLog] = useState<BookingEntry[]>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.phdBookings), [])
  )
  const [bookingBlackouts] = useState<string[]>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.phdBlackouts), [])
  )
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingDate, setBookingDate] = useState(todayIso())
  const [bookingTime, setBookingTime] = useState('11:00')
  const [groupCallFixed, setGroupCallFixed] = useState(false)
  const [coachingPaid, setCoachingPaid] = useState(false)
  const [coachingGateNoticeOpen, setCoachingGateNoticeOpen] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [activeDate, setActiveDate] = useState(() => todayIso())
  const [supportDraft, setSupportDraft] = useState('')
  const [supportNotice, setSupportNotice] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null)
  const [commitmentSeen, setCommitmentSeen] = useState<boolean>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.commitmentSeen), false)
  )
  const navigate = useNavigate()
  const { user } = useAuth()
  const stress = useStress(user?.id)
  const deadlineCountdown = useCountdown(profile?.abgabedatum ?? todayIso())
  const coachingPlanEligible = plan === 'basic' || plan === 'pro'
  const hasCoachingAccess = coachingPlanEligible && coachingPaid

  const bookingAvailability = useMemo(() => {
    if (!bookingDate) {
      return { times: [], message: 'Bitte ein Datum waehlen.', valid: false }
    }
    if (isHoliday(bookingDate)) {
      return { times: [], message: 'Feiertag - keine Termine verfuegbar.', valid: false }
    }
    if (!isWeekday(bookingDate)) {
      return { times: [], message: 'Nur Mo-Fr buchbar.', valid: false }
    }
    if (bookingBlackouts.includes(bookingDate)) {
      return { times: [], message: 'An diesem Tag sind wir nicht verfuegbar.', valid: false }
    }
    const date = new Date(`${bookingDate}T00:00:00`)
    const weekday = date.getDay()
    const windows = WEEKDAY_AVAILABILITY[weekday] ?? []
    const baseSlots = windows.flatMap((window) => buildSlots(window.start, window.end, 30))
    const bookedTimes = new Set(
      bookingLog.filter((entry) => entry.date === bookingDate).map((entry) => entry.time)
    )
    const availableTimes = baseSlots.filter((time) => !bookedTimes.has(time))
    if (availableTimes.length === 0) {
      return { times: [], message: 'Alle Slots sind belegt.', valid: false }
    }
    return { times: availableTimes, message: '', valid: true }
  }, [bookingDate, bookingBlackouts, bookingLog])

  useEffect(() => {
    let active = true
    if (!user) return () => {}
    loadProfile(user.id).then((remote) => {
      if (!active || !remote) return
      setProfile(remote)
    })
    loadAssessment(user.id).then((remote) => {
      if (!active || !remote) return
      setAssessment(remote)
    })
    loadPlan(user.id).then((remotePlan) => {
      if (!active || !remotePlan) return
      setPlan(remotePlan)
    })
    loadSchoolProgress(user.id).then((remoteProgress) => {
      if (!active || !remoteProgress) return
      setSchoolProgress(remoteProgress)
    })
    loadTodos(user.id).then((remoteTodos) => {
      if (!active || remoteTodos.length === 0) return
      setTodos(normalizeTodos(remoteTodos))
    })
    loadThesisDocuments(user.id).then((remoteDocs) => {
      if (!active || remoteDocs.length === 0) return
      setDocuments(remoteDocs)
    })
    loadBookings(user.id).then((remote) => {
      if (!active || remote.length === 0) return
      setBookingLog(remote)
    })
    return () => {
      active = false
    }
  }, [user?.id])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile))
    if (user && profile) {
      saveProfile(user.id, profile).catch((error) => {
        console.error('Profil speichern fehlgeschlagen', error)
      })
    }
  }, [profile, user])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.assessment, JSON.stringify(assessment))
    if (user && assessment) {
      saveAssessment(user.id, assessment).catch((error) => {
        console.error('Assessment speichern fehlgeschlagen', error)
      })
    }
  }, [assessment, user])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(plan))
    if (user) {
      savePlan(user.id, plan).catch((error) => {
        console.error('Plan speichern fehlgeschlagen', error)
      })
    }
  }, [plan, user])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.todos, JSON.stringify(todos))
  }, [todos])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.thesisDocuments, JSON.stringify(documents))
  }, [documents])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.commitmentSeen, JSON.stringify(commitmentSeen))
  }, [commitmentSeen])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.phdBookings, JSON.stringify(bookingLog))
  }, [bookingLog])

  useEffect(() => {
    if (bookingAvailability.times.length === 0) {
      if (bookingTime !== '') setBookingTime('')
      return
    }
    if (!bookingAvailability.times.includes(bookingTime)) {
      setBookingTime(bookingAvailability.times[0])
    }
  }, [bookingAvailability.times, bookingTime])

  useEffect(() => {
    if (!supportNotice) return
    const timer = window.setTimeout(() => setSupportNotice(null), 3000)
    return () => window.clearTimeout(timer)
  }, [supportNotice])

  useEffect(() => {
    if (!coachingGateNoticeOpen) return
    const timer = window.setTimeout(() => setCoachingGateNoticeOpen(false), 4200)
    return () => window.clearTimeout(timer)
  }, [coachingGateNoticeOpen])

  useEffect(() => {
    if (!profile?.abgabedatum) return
    const log = parseJson<DeadlineLogEntry[]>(localStorage.getItem(STORAGE_KEYS.deadlineLog), [])
    const last = log[log.length - 1]
    if (last?.date === profile.abgabedatum) return
    const nextLog = [...log, { date: profile.abgabedatum, recordedAt: new Date().toISOString() }]
    localStorage.setItem(STORAGE_KEYS.deadlineLog, JSON.stringify(nextLog))
    if (user) {
      const entry = nextLog[nextLog.length - 1]
      appendDeadlineLog(user.id, entry).catch((error) => {
        console.error('Deadline-Log speichern fehlgeschlagen', error)
      })
    }
  }, [profile?.abgabedatum, user])

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
    if (hasCoachingAccess) return
    setBookingOpen(false)
    setGroupCallFixed(false)
  }, [hasCoachingAccess])

  const showOnboarding = profile === null
  const showAssessment = profile !== null && assessment === null
  const showCommitment = profile !== null && !commitmentSeen && assessment !== null
  const recommendedPlan = assessment?.recommendedPlan ?? 'basic'
  const recommendationReasons =
    assessment?.reasons ?? ['Bitte den Einstufungstest ausfuellen, damit wir deinen Plan empfehlen koennen.']
  const latestBooking = bookingLog[bookingLog.length - 1]
  const bookingLabel = latestBooking ? `${latestBooking.date} ${latestBooking.time}` : null

  const confirmBooking = () => {
    if (!hasCoachingAccess) {
      setCoachingGateNoticeOpen(true)
      return
    }
    if (!bookingDate || !bookingTime) return
    if (!bookingAvailability.valid) return
    if (!bookingAvailability.times.includes(bookingTime)) return
    const entry = { date: bookingDate, time: bookingTime, createdAt: new Date().toISOString() }
    setBookingLog((prev) => [...prev, entry])
    if (user) {
      saveBooking(user.id, entry).catch((error) => {
        console.error('Buchung speichern fehlgeschlagen', error)
      })
    }
    setBookingOpen(false)
  }

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

  const riskLabel = riskLevel === 'hoch' ? 'Hoch' : riskLevel === 'mittel' ? 'Mittel' : 'Niedrig'

  const { mentalHealthAvg, mentalHealthTrend } = useMemo(() => {
    const last7Dates = new Set(Array.from({ length: 7 }, (_, index) => dateKey(index)))
    const prev7Dates = new Set(Array.from({ length: 7 }, (_, index) => dateKey(index + 7)))
    const last7Values = stress.log.filter((entry) => last7Dates.has(entry.date)).map((entry) => entry.value)
    const prev7Values = stress.log.filter((entry) => prev7Dates.has(entry.date)).map((entry) => entry.value)
    const avgLast7 = averageValue(last7Values) ?? stress.value
    const avgPrev7 = averageValue(prev7Values)

    let trend: 'up' | 'down' | 'flat' = 'flat'
    if (avgPrev7 !== null) {
      if (avgLast7 > avgPrev7 + 1) trend = 'up'
      if (avgLast7 < avgPrev7 - 1) trend = 'down'
    }

    return { mentalHealthAvg: avgLast7, mentalHealthTrend: trend }
  }, [stress.log, stress.value])

  const hasStressWarning = useMemo(() => {
    const dayKeys = [dateKey(0), dateKey(1)]
    const buckets = new Map<string, number[]>()
    stress.log.forEach((entry) => {
      if (!dayKeys.includes(entry.date)) return
      if (!buckets.has(entry.date)) buckets.set(entry.date, [])
      buckets.get(entry.date)?.push(entry.value)
    })
    return dayKeys.every((key) => {
      const values = buckets.get(key)
      if (!values || values.length === 0) return false
      const avg = averageValue(values)
      return avg !== null && avg > stressWarningThreshold
    })
  }, [stress.log])

  const latestDocs = useMemo(() => documents.slice(0, 2), [documents])
  const showDocs = latestDocs.length > 0

  const weekDays = useMemo(() => {
    const base = new Date()
    base.setDate(base.getDate() + weekOffset * 7)
    const day = base.getDay()
    const mondayOffset = (day + 6) % 7
    const monday = new Date(base)
    monday.setDate(base.getDate() - mondayOffset)
    monday.setHours(0, 0, 0, 0)

    return weekdayLabels.map((label, index) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + index)
      return { label, iso: date.toISOString().slice(0, 10), day: date.getDate() }
    })
  }, [weekOffset])

  useEffect(() => {
    if (weekDays.length === 0) return
    const inWeek = weekDays.some((day) => day.iso === activeDate)
    if (!inWeek) setActiveDate(weekDays[0].iso)
  }, [activeDate, weekDays])

  const todosForDay = useMemo(() => todos.filter((todo) => todo.date === activeDate), [activeDate, todos])

  const getTodoInitials = (title: string) => {
    const cleaned = title.trim()
    if (!cleaned) return 'TD'
    const parts = cleaned.split(/\s+/)
    const letters = parts.map((part) => part[0]).join('').slice(0, 2)
    return letters.toUpperCase()
  }

  const getSlotDisplay = (slotIndex: number) => {
    const assigned = todosForDay[slotIndex]
    if (!assigned) {
      return {
        avatar: 'TD',
        title: 'Noch keine Aufgabe',
        sub: 'In My Thesis',
      }
    }
    const title = assigned.title.trim().length > 0 ? assigned.title : 'Aufgabe ohne Titel'
    let sub = assigned.detail.trim().length > 0 ? assigned.detail : 'Details hinzufuegen'
    const remaining = Math.max(todosForDay.length - TIME_SLOTS.length, 0)
    if (slotIndex === TIME_SLOTS.length - 1 && remaining > 0) {
      sub = `${sub} - +${remaining} weitere`
    }
    return {
      avatar: getTodoInitials(title),
      title,
      sub,
    }
  }

  const insertSupportTag = (tag: string) => {
    setSupportDraft((prev) => {
      const spacer = prev.trim().length === 0 ? '' : ' '
      return `${prev.trimEnd()}${spacer}#${tag}`.trimStart()
    })
  }

  const submitSupportMessage = () => {
    const message = supportDraft.trim()
    if (message.length === 0) {
      setSupportNotice({ type: 'warn', text: 'Bitte gib zuerst eine Nachricht ein.' })
      return
    }
    if (plan === 'free') {
      setSupportNotice({
        type: 'warn',
        text: 'Waehle min. BASIC Plan aus fuer super schnellen Direkt-Betreuungssupport.',
      })
      return
    }
    setSupportNotice({
      type: 'ok',
      text: 'Nachricht gesendet. Unser Team meldet sich schnell bei dir.',
    })
    setSupportDraft('')
  }

  const showCoachingGateNotice = () => {
    setCoachingGateNoticeOpen(true)
  }

  const handleGroupCallToggle = (checked: boolean) => {
    if (!hasCoachingAccess) {
      showCoachingGateNotice()
      return
    }
    setGroupCallFixed(checked)
  }

  const handleBookingToggle = () => {
    if (!hasCoachingAccess) {
      showCoachingGateNotice()
      return
    }
    setBookingOpen((prev) => !prev)
  }

  return (
    <>
      <main className="dashboard">
        <aside className="panel left-panel">
          <div className="panel-card timetable-card">
            <div className="panel-head">
              <div className="timetable-head-copy">
                <h3>Dein Zeitplan</h3>
                <div className="timetable-deadline-mini">
                  {formatCountdown(
                    deadlineCountdown.days,
                    deadlineCountdown.hours,
                    deadlineCountdown.minutes,
                    deadlineCountdown.seconds
                  )}
                </div>
              </div>
              <div className="nav-arrows">
                <button className="icon-button" type="button" onClick={() => setWeekOffset((prev) => prev - 1)}>
                  &lt;
                </button>
                <button className="icon-button" type="button" onClick={() => setWeekOffset((prev) => prev + 1)}>
                  &gt;
                </button>
              </div>
            </div>
            <div className="calendar">
              {weekDays.map((day) => (
                <button
                  key={day.iso}
                  className={`calendar-day ${day.iso === activeDate ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveDate(day.iso)}
                >
                  <span>{day.label}</span>
                  <strong>{day.day}</strong>
                </button>
              ))}
            </div>
            {TIME_SLOTS.map((slot, index) => {
              const display = getSlotDisplay(index)
              return (
                <div key={slot.id} className="timetable-slot">
                  <div className="slot-time">{slot.label}</div>
                  <div className="slot-card">
                    <div className="slot-avatar">{display.avatar}</div>
                    <div className="slot-body">
                      <div className="slot-title">{display.title}</div>
                      <div className="slot-sub">{display.sub}</div>
                    </div>
                    <button
                      className="slot-action"
                      type="button"
                      title="In My Thesis bearbeiten"
                      aria-label="Aufgabe zuweisen"
                      onClick={() => navigate('/my-thesis')}
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        <section className="panel hero-panel">
          <div className="hero-card">
            <div className={`hero-visual ${showDocs ? '' : 'single'}`}>
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
                    <span>Mental Health 7T</span>
                    <strong>
                      {mentalHealthAvg}/100
                      <span className={`trend ${mentalHealthTrend}`}>
                        {mentalHealthTrend === 'up' ? '^' : mentalHealthTrend === 'down' ? 'v' : '-'}
                      </span>
                    </strong>
                  </div>
                  <div className="metric floating">
                    <span>Zielnote</span>
                    <strong>{profile?.zielnote ?? '1,3'}</strong>
                  </div>
                </div>
              </div>
              {showDocs && (
                <div className="hero-visual-card doc-card">
                  <h4>Dokumente</h4>
                  <div className="doc-list compact">
                    {latestDocs.map((doc) => (
                      <div key={doc.id} className="doc-item">
                        <div>
                          <div className="doc-title">{doc.name}</div>
                          <div className="doc-sub">{formatDocDate(doc.uploadedAt)}</div>
                        </div>
                        <span className="doc-icon">DOC</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className={`hero-bottom ${hasStressWarning ? 'with-warning' : ''}`}>
              {hasStressWarning && (
                <div className="stress-warning compact hero-warning">
                  Dein Stress ist erhoeht. Wir empfehlen persoenliche Betreuung.
                </div>
              )}
              <div className={`hero-actions ${hasStressWarning ? 'with-warning' : ''}`}>
              <div className="panel-card support-card">
                <div className="container_chat_bot">
                  <div className="container-chat-options">
                    {supportNotice && <div className={`support-notice support-notice-inline ${supportNotice.type}`}>{supportNotice.text}</div>}
                    <div className="chat">
                      <div className="chat-bot">
                        <textarea
                          value={supportDraft}
                          onChange={(event) => {
                            setSupportDraft(event.target.value)
                            if (supportNotice) setSupportNotice(null)
                          }}
                          placeholder="Schreibe uns kurz dein Thema, Problem oder Deadline-Frage..."
                        />
                      </div>
                      <div className="options">
                        <div className="btns-add">
                          <button type="button" onClick={() => insertSupportTag('Methodik')}>
                            + Methodik
                          </button>
                          <button type="button" onClick={() => insertSupportTag('Deadline')}>
                            + Deadline
                          </button>
                        </div>
                        <button className="btn-submit" type="button" onClick={submitSupportMessage}>
                          <span>↗</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="tags">
                    <span onClick={() => insertSupportTag('Feedback')}>Feedback</span>
                    <span onClick={() => insertSupportTag('Struktur')}>Struktur</span>
                    <span onClick={() => insertSupportTag('Buchung')}>Buchung</span>
                  </div>
                </div>
                {plan === 'free' && (
                  <div className="support-plan-hint">Support-Chat ist ab BASIC und PRO direkt verfuegbar.</div>
                )}
              </div>
              <div className="plan-recommend-card equal-card">
                <h4>Plan Empfehlung</h4>
                <div className="plan-recommend-top">
                  <div className="plan-recommend-name">{recommendedPlan.toUpperCase()}</div>
                  <button className="cssbuttons-io plan-inline-action" onClick={() => navigate('/payments')}>
                    <span>Mehr dazu</span>
                  </button>
                </div>
                <div className="muted">Aus dem Einstufungstest</div>
                <ul className="plain-list">
                  {recommendationReasons.map((reason, index) => (
                    <li key={`${reason}-${index}`}>{reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          </div>

        </section>

        <aside className="panel right-panel">
          <div className="panel-card">
            <div className="panel-head">
              <h3>Betreuungsplan</h3>
            </div>
            <div className="plan-item">
              <div className="plan-main">
                <div className="plan-avatar">
                  <img src="/bert.png" alt="Gruppen Call" />
                </div>
                <div>
                  <div className="plan-title">Gruppen Call</div>
                  <div className="plan-sub">Jeden Samstag - 11:00</div>
                </div>
              </div>
              <div className="checkbox-wrapper-5 plan-fix-toggle">
                <div className="check">
                  <input
                    id="group-call-fix-dashboard"
                    type="checkbox"
                    checked={groupCallFixed}
                    onChange={(event) => handleGroupCallToggle(event.target.checked)}
                  />
                  <label htmlFor="group-call-fix-dashboard" aria-label="Gruppen Call fix" />
                </div>
              </div>
            </div>
            <div className="plan-item">
              <div className="plan-main">
                <div className="plan-avatar">
                  <img src="/anna.jpg" alt="Dr. Anna Horrer" />
                </div>
                <div>
                  <div className="plan-title plan-title-secondary">
                    <span className="plan-call-strong">1zu1 Call</span>{' '}
                    <span className="plan-call-name">Dr. Anna Horrer</span>
                  </div>
                  {bookingLabel && <div className="plan-sub">Naechster Termin: {bookingLabel}</div>}
                </div>
              </div>
              <button className="cssbuttons-io plan-book" type="button" onClick={handleBookingToggle}>
                <span>Buchen</span>
              </button>
            </div>
            {coachingGateNoticeOpen && (
              <div className="plan-gate-tooltip" role="note">
                <h4>Betreuung nur mit aktivem BASIC/PRO</h4>
                <p>Du brauchst einen bezahlten BASIC oder PRO Plan, um am Gruppen-Call und an 1zu1 Buchungen teilzunehmen.</p>
                <div className="referral-cta">
                  <span aria-hidden="true">{'->'}</span>
                  <button className="plan-gate-link" type="button" onClick={() => navigate('/payments')}>
                    Plan aktivieren
                  </button>
                </div>
                <span className="plan-gate-tip" aria-hidden="true" />
              </div>
            )}
            {bookingOpen && (
              <div className="booking-popover">
                <div className="booking-grid">
                  <label>
                    Tag
                    <input
                      type="date"
                      value={bookingDate}
                      onChange={(event) => setBookingDate(event.target.value)}
                      min={todayIso()}
                    />
                  </label>
                  <label>
                    Uhrzeit
                    <select
                      value={bookingTime}
                      onChange={(event) => setBookingTime(event.target.value)}
                      disabled={bookingAvailability.times.length === 0}
                    >
                      {bookingAvailability.times.length === 0 ? (
                        <option value="">--</option>
                      ) : (
                        bookingAvailability.times.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>
                <div className="booking-note">Mo-Fr 09:00-18:00, Feiertage gesperrt.</div>
                {!bookingAvailability.valid && (
                  <div className="booking-error">{bookingAvailability.message}</div>
                )}
                <button
                  className="primary"
                  type="button"
                  onClick={confirmBooking}
                  disabled={!bookingAvailability.valid}
                >
                  Bestaetigen
                </button>
              </div>
            )}
          </div>
          <div className="panel-card tools-folder-card">
            <section className="tools-folder-section" aria-label="Elea Academia Download">
              <div className="tools-folder-file">
                <div className="work-5" />
                <div className="work-4" />
                <div className="work-3" />
                <div className="work-2" />
                <div className="work-1" />
              </div>
              <button className="tools-folder-download" type="button" title="Elea Academia herunterladen">
                <span>Elea Academia</span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            </section>
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

      {showAssessment && (
        <AssessmentModal
          onComplete={(result) => {
            setAssessment(result)
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

const AssessmentModal = ({ onComplete }: { onComplete: (result: AssessmentResult) => void }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const allAnswered = assessmentQuestions.every((question) => Boolean(answers[question.id]))

  return (
    <div className="modal-backdrop">
      <div className="modal assessment-modal">
        <h2>Einstufungstest</h2>
        <p>Beantworte die Fragen, damit wir deinen Plan empfehlen koennen.</p>
        <div className="assessment-grid">
          {assessmentQuestions.map((question) => (
            <div key={question.id} className="question-card">
              <div className="question-title">{question.title}</div>
              <div className="answer-grid">
                {question.options.map((option) => {
                  const isActive = answers[question.id] === option.id
                  return (
                    <label key={option.id} className={`answer-option ${isActive ? 'active' : ''}`}>
                      <span className="uiverse-checkbox">
                        <input
                          type="radio"
                          name={question.id}
                          value={option.id}
                          checked={isActive}
                          onChange={() => {
                            setAnswers((prev) => ({ ...prev, [question.id]: option.id }))
                          }}
                        />
                        <span className="checkmark" />
                      </span>
                      <span className="answer-text">{option.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button
            className="primary"
            disabled={!allAnswered}
            onClick={() => {
              if (!allAnswered) return
              onComplete(buildAssessmentResult(answers))
            }}
          >
            Ergebnis anzeigen
          </button>
        </div>
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
            <div className="commitment-signature">Anna Neuhaus - PhD</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
