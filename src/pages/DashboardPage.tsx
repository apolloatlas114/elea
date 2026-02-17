import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCountdown } from '../hooks/useCountdown'
import { useStress } from '../hooks/useStress'
import { useAuth } from '../context/AuthContext'
import { getMicrophoneErrorMessage, startMicrophoneCapture, type MicrophoneCaptureSession } from '../lib/audioCapture'
import { groqChatJsonWithFallback } from '../lib/groq'
import { computeProductivitySnapshot, loadProductivityMetrics } from '../lib/productivity'
import type {
  AssessmentResult,
  BookingEntry,
  DeadlineLogEntry,
  Plan,
  Profile,
  SchoolProgress,
  StudyMaterial,
  StudyQuiz,
  ThesisDocument,
  TodoItem,
} from '../lib/storage'
import { STORAGE_KEYS, formatCountdown, normalizeStudyMaterials, normalizeTodos, parseJson, toLocalIsoDate, todayIso } from '../lib/storage'
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
  replaceStudyMaterials,
  replaceTodos,
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
const plannerStorageKeys = {
  eleaEvents: 'elea_planner_events',
  externalEvents: 'elea_planner_external_events',
  sync: 'elea_planner_sync',
  oauth: 'elea_planner_oauth',
} as const
const plannerOauthPendingKey = 'elea_planner_oauth_pending'
const plannerColorOptions = ['#18b6a4', '#0f998f', '#4f8df5', '#f7b55f', '#a370f5'] as const
const plannerDefaultColor = plannerColorOptions[0]
const plannerReminderOptions: PlannerReminder[] = ['none', '10m', '30m', '60m']
const plannerRepeatOptions: PlannerRepeat[] = ['never', 'daily', 'weekly']
const plannerGoogleScope = 'https://www.googleapis.com/auth/calendar.readonly'
const plannerOutlookScope = 'https://graph.microsoft.com/Calendars.Read'
const plannerOauthClockSkewMs = 60 * 1000
const plannerGoogleClientIdFallback = '756061098880-nia28g8sqf69jsgsdmd3r05foo28cbcu.apps.googleusercontent.com'
const plannerGoogleClientId =
  ((import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) || plannerGoogleClientIdFallback).trim()
const plannerMicrosoftClientId = ((import.meta.env.VITE_MICROSOFT_OAUTH_CLIENT_ID as string | undefined) || '').trim()
const plannerRepeatLabels: Record<PlannerRepeat, string> = {
  never: 'Keine Wiederholung',
  daily: 'Taeglich',
  weekly: 'Woechentlich',
}
const plannerReminderLabels: Record<PlannerReminder, string> = {
  none: 'Keine Erinnerung',
  '10m': '10 Min vorher',
  '30m': '30 Min vorher',
  '60m': '60 Min vorher',
}
const plannerDefaultSyncSettings: PlannerSyncSettings = {
  googleConnected: false,
  outlookConnected: false,
  uniConnected: false,
  uniIcalUrl: '',
  autoSyncMinutes: 15,
  bufferMinutes: 10,
  lastSyncedAt: '',
}

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

type EleaExplainResponse = {
  explanation: string
  examples: string[]
  nextSteps: string[]
}

type EleaQuizQuestion = {
  question: string
  options: string[]
  correct: number
  explanation?: string
  chapterTag?: string
}

type PlannerEventSource = 'elea' | 'external-google' | 'external-outlook' | 'external-uni'
type PlannerOAuthProvider = 'google' | 'outlook'
type PlannerEventKind = 'session' | 'task' | 'external'
type PlannerRepeat = 'never' | 'daily' | 'weekly'
type PlannerReminder = 'none' | '10m' | '30m' | '60m'
type PlannerNotice = { type: 'ok' | 'warn'; text: string } | null

type PlannerEvent = {
  id: string
  source: PlannerEventSource
  kind: PlannerEventKind
  title: string
  detail: string
  date: string
  start: string
  end: string
  allDay: boolean
  repeat: PlannerRepeat
  tags: string[]
  participants: string[]
  location: string
  color: string
  remind: PlannerReminder
  readOnly: boolean
  updatedAt: string
}

type PlannerSyncSettings = {
  googleConnected: boolean
  outlookConnected: boolean
  uniConnected: boolean
  uniIcalUrl: string
  autoSyncMinutes: 15 | 30
  bufferMinutes: 0 | 10 | 15
  lastSyncedAt: string
}

type PlannerOAuthSession = {
  accessToken: string
  refreshToken: string
  expiresAt: string
}

type PlannerOAuthSessions = Partial<Record<PlannerOAuthProvider, PlannerOAuthSession>>

type PlannerOAuthPending = {
  provider: PlannerOAuthProvider
  state: string
  codeVerifier: string
  redirectUri: string
}

type PlannerDraft = {
  id: string | null
  date: string
  kind: 'session' | 'task'
  title: string
  allDay: boolean
  start: string
  end: string
  repeat: PlannerRepeat
  tags: string
  participants: string
  location: string
  color: string
  remind: PlannerReminder
  notes: string
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
    title: 'Methodik geklärt?',
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

  const recommendedPlan: Plan = score >= 8 ? 'pro' : score >= 4 ? 'basic' : 'study'
  const recommendationCopy: Record<Plan, string[]> = {
    free: ['Starker Start im Selbstlernmodus', 'Struktur durch Videos + Checklisten', 'Upgrade jederzeit möglich'],
    study: ['Mehr Tempo im Alltag', 'Unlimited Lern- und Notizmodus', 'Support innerhalb von 72h'],
    basic: ['Mehr Struktur im Wochenrhythmus', 'Feedback spart Zeit bei Korrekturen', 'Support für offene Fragen'],
    pro: ['Maximale Begleitung bis zur Abgabe', 'Intensives Feedback senkt Risiko', 'Priorität im Support'],
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

const createPlannerId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

const normalizeTimeValue = (value: string, fallback: string) => {
  const trimmed = value.trim()
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : fallback
}

const splitList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 10)

const mergeRanges = (ranges: Array<{ start: number; end: number }>) => {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = [{ ...sorted[0] }]
  sorted.slice(1).forEach((range) => {
    const last = merged[merged.length - 1]
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
      return
    }
    merged.push({ ...range })
  })
  return merged
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const sortPlannerEvents = (rows: PlannerEvent[]) =>
  [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    const startDiff = timeToMinutes(a.start) - timeToMinutes(b.start)
    if (startDiff !== 0) return startDiff
    return a.title.localeCompare(b.title)
  })

const encodeBase64Url = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const createRandomToken = (length = 32) => {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return encodeBase64Url(bytes)
}

const createPkceChallenge = async (verifier: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return encodeBase64Url(digest)
}

const parseDateTimeToLocal = (value: string) => {
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return {
      date: toLocalIsoDate(parsed),
      time: `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`,
    }
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (!match) return null
  return {
    date: match[1],
    time: `${match[2]}:${match[3]}`,
  }
}

type ParsedPlannerDateTime =
  | { allDay: true; date: string }
  | { allDay: false; date: string; time: string }

const parseGoogleEventDateTime = (value: unknown): ParsedPlannerDateTime | null => {
  if (!isRecord(value)) return null
  const date = typeof value.date === 'string' ? value.date : ''
  if (date) return { allDay: true, date }
  const dateTime = typeof value.dateTime === 'string' ? value.dateTime : ''
  if (!dateTime) return null
  const parsed = parseDateTimeToLocal(dateTime)
  if (!parsed) return null
  return {
    allDay: false,
    date: parsed.date,
    time: parsed.time,
  }
}

const parseOutlookEventDateTime = (value: unknown): ParsedPlannerDateTime | null => {
  if (!isRecord(value)) return null
  const dateTime = typeof value.dateTime === 'string' ? value.dateTime : ''
  const timeZone = typeof value.timeZone === 'string' ? value.timeZone : ''
  if (!dateTime) return null
  const normalized = timeZone.toUpperCase() === 'UTC' && !dateTime.endsWith('Z') ? `${dateTime}Z` : dateTime
  const parsed = parseDateTimeToLocal(normalized) ?? parseDateTimeToLocal(dateTime)
  if (!parsed) return null
  return {
    allDay: false,
    date: parsed.date,
    time: parsed.time,
  }
}

const normalizeExternalTimeWindow = (
  startValue: ParsedPlannerDateTime | null,
  endValue: ParsedPlannerDateTime | null
): { allDay: boolean; date: string; start: string; end: string } | null => {
  if (!startValue) return null
  if (startValue.allDay) {
    return {
      allDay: true,
      date: startValue.date,
      start: '00:00',
      end: '23:59',
    }
  }
  const fallbackEnd = minutesToTime(Math.min(timeToMinutes(startValue.time) + 60, 23 * 60 + 59))
  let endTime = endValue && !endValue.allDay ? endValue.time : fallbackEnd
  if (timeToMinutes(endTime) <= timeToMinutes(startValue.time)) {
    endTime = fallbackEnd
  }
  return {
    allDay: false,
    date: startValue.date,
    start: startValue.time,
    end: endTime,
  }
}

const mapGoogleCalendarEvents = (items: unknown): PlannerEvent[] => {
  if (!Array.isArray(items)) return []
  const mapped: Array<PlannerEvent | null> = items
    .map((item) => {
      if (!isRecord(item)) return null
      if (item.status === 'cancelled') return null
      const startParsed = parseGoogleEventDateTime(item.start)
      const endParsed = parseGoogleEventDateTime(item.end)
      const normalized = normalizeExternalTimeWindow(startParsed, endParsed)
      if (!normalized) return null
      const id = typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : createPlannerId('google')
      const title = typeof item.summary === 'string' && item.summary.trim().length > 0 ? item.summary : 'Google Termin'
      const detail = typeof item.description === 'string' ? item.description : ''
      const location = typeof item.location === 'string' ? item.location : ''
      return {
        id: `google-${id}-${normalized.date}-${normalized.start}`,
        source: 'external-google',
        kind: 'external',
        title,
        detail,
        date: normalized.date,
        start: normalized.start,
        end: normalized.end,
        allDay: normalized.allDay,
        repeat: 'never',
        tags: ['Google'],
        participants: [],
        location,
        color: '#c7ced6',
        remind: 'none',
        readOnly: true,
        updatedAt: new Date().toISOString(),
      } satisfies PlannerEvent
    })
  return sortPlannerEvents(mapped.filter((event): event is PlannerEvent => event !== null))
}

const mapOutlookCalendarEvents = (items: unknown): PlannerEvent[] => {
  if (!Array.isArray(items)) return []
  const mapped: Array<PlannerEvent | null> = items
    .map((item) => {
      if (!isRecord(item)) return null
      if (item.isCancelled === true) return null
      const startParsed = parseOutlookEventDateTime(item.start)
      const endParsed = parseOutlookEventDateTime(item.end)
      const normalized = normalizeExternalTimeWindow(startParsed, endParsed)
      if (!normalized) return null
      const locationValue = isRecord(item.location) ? item.location : null
      const location = locationValue && typeof locationValue.displayName === 'string' ? locationValue.displayName : ''
      const id = typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : createPlannerId('outlook')
      const title = typeof item.subject === 'string' && item.subject.trim().length > 0 ? item.subject : 'Outlook Termin'
      const detail = typeof item.bodyPreview === 'string' ? item.bodyPreview : ''
      const allDay = Boolean(item.isAllDay)
      return {
        id: `outlook-${id}-${normalized.date}-${normalized.start}`,
        source: 'external-outlook',
        kind: 'external',
        title,
        detail,
        date: normalized.date,
        start: allDay ? '00:00' : normalized.start,
        end: allDay ? '23:59' : normalized.end,
        allDay,
        repeat: 'never',
        tags: ['Outlook'],
        participants: [],
        location,
        color: '#c7ced6',
        remind: 'none',
        readOnly: true,
        updatedAt: new Date().toISOString(),
      } satisfies PlannerEvent
    })
  return sortPlannerEvents(mapped.filter((event): event is PlannerEvent => event !== null))
}

const buildSyncRange = (referenceDate: string) => {
  const base = new Date(`${referenceDate}T00:00:00`)
  const start = new Date(base)
  start.setDate(start.getDate() - 30)
  start.setHours(0, 0, 0, 0)
  const end = new Date(base)
  end.setDate(end.getDate() + 180)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

const parsePlannerTokenResponse = (value: unknown, fallbackRefreshToken = ''): PlannerOAuthSession | null => {
  if (!isRecord(value)) return null
  const accessToken = typeof value.access_token === 'string' ? value.access_token : ''
  const refreshToken = typeof value.refresh_token === 'string' ? value.refresh_token : fallbackRefreshToken
  const expiresInRaw = value.expires_in
  const expiresIn =
    typeof expiresInRaw === 'number'
      ? expiresInRaw
      : typeof expiresInRaw === 'string'
        ? Number(expiresInRaw)
        : Number.NaN
  if (!accessToken || !refreshToken || Number.isNaN(expiresIn)) return null
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + Math.max(expiresIn - 60, 10) * 1000).toISOString(),
  }
}

const parseApiErrorMessage = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => null)
  if (isRecord(payload)) {
    if (typeof payload.error_description === 'string' && payload.error_description.trim().length > 0) {
      return payload.error_description
    }
    const errorField = payload.error
    if (typeof errorField === 'string' && errorField.trim().length > 0) return errorField
    if (isRecord(errorField) && typeof errorField.message === 'string' && errorField.message.trim().length > 0) {
      return errorField.message
    }
    if (typeof payload.message === 'string' && payload.message.trim().length > 0) return payload.message
  }
  return fallback
}

const createPlannerDraft = (date: string, kind: 'session' | 'task', source?: PlannerEvent): PlannerDraft => {
  if (source) {
    return {
      id: source.id,
      date: source.date,
      kind: source.kind === 'task' ? 'task' : 'session',
      title: source.title,
      allDay: source.allDay,
      start: source.start,
      end: source.end,
      repeat: source.repeat,
      tags: source.tags.join(', '),
      participants: source.participants.join(', '),
      location: source.location,
      color: source.color || plannerDefaultColor,
      remind: source.remind,
      notes: source.detail,
    }
  }
  return {
    id: null,
    date,
    kind,
    title: '',
    allDay: false,
    start: kind === 'task' ? '16:00' : '10:00',
    end: kind === 'task' ? '16:45' : '11:00',
    repeat: 'never',
    tags: kind === 'task' ? 'Aufgabe' : 'Fokus',
    participants: '',
    location: '',
    color: plannerDefaultColor,
    remind: '30m',
    notes: '',
  }
}

const isPlannerSource = (value: unknown): value is PlannerEventSource =>
  value === 'elea' || value === 'external-google' || value === 'external-outlook' || value === 'external-uni'

const isPlannerKind = (value: unknown): value is PlannerEventKind =>
  value === 'session' || value === 'task' || value === 'external'

const isPlannerRepeat = (value: unknown): value is PlannerRepeat =>
  value === 'never' || value === 'daily' || value === 'weekly'

const isPlannerReminder = (value: unknown): value is PlannerReminder =>
  value === 'none' || value === '10m' || value === '30m' || value === '60m'

const normalizePlannerEvents = (value: unknown): PlannerEvent[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item, index) => {
      const raw = item as Record<string, unknown>
      const source: PlannerEventSource = isPlannerSource(raw.source) ? raw.source : 'elea'
      const kind: PlannerEventKind = isPlannerKind(raw.kind) ? raw.kind : source === 'elea' ? 'session' : 'external'
      const title = typeof raw.title === 'string' ? raw.title.trim() : ''
      const date = typeof raw.date === 'string' ? raw.date : ''
      if (!title || !date) return null
      const color =
        typeof raw.color === 'string' && raw.color.trim().length > 0
          ? raw.color.trim()
          : source === 'elea'
            ? plannerDefaultColor
            : '#c5ccd3'
      return {
        id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : `planner-${Date.now()}-${index}`,
        source,
        kind,
        title,
        detail: typeof raw.detail === 'string' ? raw.detail : '',
        date,
        start: normalizeTimeValue(typeof raw.start === 'string' ? raw.start : '', '09:00'),
        end: normalizeTimeValue(typeof raw.end === 'string' ? raw.end : '', '10:00'),
        allDay: Boolean(raw.allDay),
        repeat: isPlannerRepeat(raw.repeat) ? raw.repeat : 'never',
        tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        participants: Array.isArray(raw.participants)
          ? raw.participants.filter((person): person is string => typeof person === 'string')
          : [],
        location: typeof raw.location === 'string' ? raw.location : '',
        color,
        remind: isPlannerReminder(raw.remind) ? raw.remind : '30m',
        readOnly: Boolean(raw.readOnly),
        updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : new Date().toISOString(),
      } satisfies PlannerEvent
    })
    .filter((event): event is PlannerEvent => Boolean(event))
}

const decodeIcalText = (value: string) =>
  value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')

const parseIcalDateTime = (value: string) => {
  const trimmed = value.trim()
  if (/^\d{8}$/.test(trimmed)) {
    return {
      date: `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`,
      time: '00:00',
      allDay: true,
    }
  }
  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/)
  if (!match) return null
  const [, y, m, d, hh, mm, , utcFlag] = match
  if (utcFlag) {
    const utcDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0))
    return {
      date: `${utcDate.getFullYear()}-${pad2(utcDate.getMonth() + 1)}-${pad2(utcDate.getDate())}`,
      time: `${pad2(utcDate.getHours())}:${pad2(utcDate.getMinutes())}`,
      allDay: false,
    }
  }
  return {
    date: `${y}-${m}-${d}`,
    time: `${hh}:${mm}`,
    allDay: false,
  }
}

const parseIcalEvents = (content: string): PlannerEvent[] => {
  const unfolded = content.replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)
  const events: PlannerEvent[] = []
  let current: Record<string, string> | null = null

  lines.forEach((line) => {
    if (line === 'BEGIN:VEVENT') {
      current = {}
      return
    }
    if (line === 'END:VEVENT') {
      if (!current) return
      const dtStartRaw = current.DTSTART || ''
      const dtEndRaw = current.DTEND || ''
      const parsedStart = parseIcalDateTime(dtStartRaw)
      const parsedEnd = parseIcalDateTime(dtEndRaw)
      if (!parsedStart) {
        current = null
        return
      }
      const allDay = parsedStart.allDay || parsedEnd?.allDay || false
      const startTime = allDay ? '00:00' : parsedStart.time
      const endTime = allDay ? '23:59' : parsedEnd?.time || minutesToTime(Math.min(timeToMinutes(startTime) + 60, 23 * 60 + 59))
      const title = decodeIcalText(current.SUMMARY || 'Uni-Termin')
      const detail = decodeIcalText(current.DESCRIPTION || '')
      const location = decodeIcalText(current.LOCATION || '')
      const uid = current.UID ? decodeIcalText(current.UID) : createPlannerId('uni')
      events.push({
        id: `uni-${uid}`,
        source: 'external-uni',
        kind: 'external',
        title,
        detail,
        date: parsedStart.date,
        start: startTime,
        end: endTime,
        allDay,
        repeat: 'never',
        tags: ['Uni'],
        participants: [],
        location,
        color: '#c7ced6',
        remind: 'none',
        readOnly: true,
        updatedAt: new Date().toISOString(),
      })
      current = null
      return
    }
    if (!current) return
    const separatorIndex = line.indexOf(':')
    if (separatorIndex <= 0) return
    const rawKey = line.slice(0, separatorIndex)
    const key = rawKey.split(';')[0].toUpperCase()
    const value = line.slice(separatorIndex + 1)
    if (!current[key]) {
      current[key] = value
    }
  })

  return sortPlannerEvents(events)
}

const toMonthStart = (value: string | Date) => {
  const base = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value)
  return new Date(base.getFullYear(), base.getMonth(), 1)
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
  const [dayPlannerDate, setDayPlannerDate] = useState<string | null>(null)
  const [monthPlannerOpen, setMonthPlannerOpen] = useState(false)
  const [monthPlannerCursor, setMonthPlannerCursor] = useState<Date>(() => toMonthStart(todayIso()))
  const [plannerNotice, setPlannerNotice] = useState<PlannerNotice>(null)
  const [plannerSyncSettings, setPlannerSyncSettings] = useState<PlannerSyncSettings>(() => {
    const parsed = parseJson(localStorage.getItem(plannerStorageKeys.sync), plannerDefaultSyncSettings)
    return {
      googleConnected: Boolean(parsed?.googleConnected),
      outlookConnected: Boolean(parsed?.outlookConnected),
      uniConnected: Boolean(parsed?.uniConnected),
      uniIcalUrl: typeof parsed?.uniIcalUrl === 'string' ? parsed.uniIcalUrl : '',
      autoSyncMinutes: plannerDefaultSyncSettings.autoSyncMinutes,
      bufferMinutes: plannerDefaultSyncSettings.bufferMinutes,
      lastSyncedAt: typeof parsed?.lastSyncedAt === 'string' ? parsed.lastSyncedAt : '',
    }
  })
  const [plannerExternalEvents, setPlannerExternalEvents] = useState<PlannerEvent[]>(() =>
    normalizePlannerEvents(parseJson(localStorage.getItem(plannerStorageKeys.externalEvents), []))
  )
  const [plannerEleaEvents, setPlannerEleaEvents] = useState<PlannerEvent[]>(() =>
    normalizePlannerEvents(parseJson(localStorage.getItem(plannerStorageKeys.eleaEvents), []))
  )
  const [plannerOAuthSessions, setPlannerOAuthSessions] = useState<PlannerOAuthSessions>(() =>
    parseJson(localStorage.getItem(plannerStorageKeys.oauth), {})
  )
  const [plannerSyncExpanded, setPlannerSyncExpanded] = useState(false)
  const [plannerProviderModalOpen, setPlannerProviderModalOpen] = useState(false)
  const [plannerOauthBusy, setPlannerOauthBusy] = useState<PlannerOAuthProvider | null>(null)
  const [plannerEditorOpen, setPlannerEditorOpen] = useState(false)
  const [plannerEditorMode, setPlannerEditorMode] = useState<'create' | 'edit'>('create')
  const [plannerDraft, setPlannerDraft] = useState<PlannerDraft>(() => createPlannerDraft(todayIso(), 'session'))
  const [supportDraft, setSupportDraft] = useState('')
  const [supportNotice, setSupportNotice] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null)
  const [askEleaOpen, setAskEleaOpen] = useState(false)
  const [askEleaQuestion, setAskEleaQuestion] = useState('')
  const [askEleaAnswer, setAskEleaAnswer] = useState<EleaExplainResponse | null>(null)
  const [askEleaQuiz, setAskEleaQuiz] = useState<EleaQuizQuestion[]>([])
  const [askEleaBusy, setAskEleaBusy] = useState(false)
  const [askEleaQuizBusy, setAskEleaQuizBusy] = useState(false)
  const [askEleaRecording, setAskEleaRecording] = useState(false)
  const [askEleaTranscribing, setAskEleaTranscribing] = useState(false)
  const [askEleaNotice, setAskEleaNotice] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null)
  const [commitmentSeen, setCommitmentSeen] = useState<boolean>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.commitmentSeen), false)
  )
  const askCaptureRef = useRef<MicrophoneCaptureSession | null>(null)
  const askRecordingTimeoutRef = useRef<number | null>(null)
  const uniIcalInputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()
  const { user } = useAuth()
  const stress = useStress(user?.id)
  const deadlineCountdown = useCountdown(profile?.abgabedatum ?? todayIso())
  const coachingPlanEligible = plan === 'basic' || plan === 'pro'
  const hasCoachingAccess = coachingPlanEligible && coachingPaid
  const [productivityTick, setProductivityTick] = useState(0)
  const productivitySnapshot = useMemo(
    () => computeProductivitySnapshot(loadProductivityMetrics()),
    [productivityTick, stress.log.length, askEleaRecording, askEleaTranscribing]
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProductivityTick((prev) => prev + 1)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const bookingAvailability = useMemo(() => {
    if (!bookingDate) {
      return { times: [], message: 'Bitte ein Datum wählen.', valid: false }
    }
    if (isHoliday(bookingDate)) {
      return { times: [], message: 'Feiertag - keine Termine verfügbar.', valid: false }
    }
    if (!isWeekday(bookingDate)) {
      return { times: [], message: 'Nur Mo-Fr buchbar.', valid: false }
    }
    if (bookingBlackouts.includes(bookingDate)) {
      return { times: [], message: 'An diesem Tag sind wir nicht verfügbar.', valid: false }
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
    localStorage.setItem(plannerStorageKeys.sync, JSON.stringify(plannerSyncSettings))
  }, [plannerSyncSettings])

  useEffect(() => {
    localStorage.setItem(plannerStorageKeys.externalEvents, JSON.stringify(plannerExternalEvents))
  }, [plannerExternalEvents])

  useEffect(() => {
    localStorage.setItem(plannerStorageKeys.eleaEvents, JSON.stringify(plannerEleaEvents))
  }, [plannerEleaEvents])

  useEffect(() => {
    localStorage.setItem(plannerStorageKeys.oauth, JSON.stringify(plannerOAuthSessions))
  }, [plannerOAuthSessions])

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
    if (!plannerNotice) return
    const timer = window.setTimeout(() => setPlannerNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [plannerNotice])

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
  const recommendedPlan = assessment?.recommendedPlan === 'free' ? 'study' : assessment?.recommendedPlan ?? 'basic'
  const recommendationReasons =
    assessment?.reasons ?? ['Bitte den Einstufungstest ausfüllen, damit wir deinen Plan empfehlen können.']
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
    const coaching = plan === 'basic' || plan === 'pro' ? 20 : 0
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
    const coaching = plan === 'basic' || plan === 'pro'

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
      return { label, iso: toLocalIsoDate(date), day: date.getDate() }
    })
  }, [weekOffset])

  useEffect(() => {
    if (weekDays.length === 0) return
    const inWeek = weekDays.some((day) => day.iso === activeDate)
    if (!inWeek) setActiveDate(weekDays[0].iso)
  }, [activeDate, weekDays])

  const plannerEvents = useMemo(
    () => sortPlannerEvents([...plannerExternalEvents, ...plannerEleaEvents]),
    [plannerExternalEvents, plannerEleaEvents]
  )

  const plannerEventsByDate = useMemo(() => {
    const grouped = new Map<string, PlannerEvent[]>()
    plannerEvents.forEach((event) => {
      if (!grouped.has(event.date)) grouped.set(event.date, [])
      grouped.get(event.date)?.push(event)
    })
    return grouped
  }, [plannerEvents])

  const plannerPopupDate = dayPlannerDate ?? activeDate
  const plannerPopupEvents = useMemo(
    () => plannerEventsByDate.get(plannerPopupDate) ?? [],
    [plannerEventsByDate, plannerPopupDate]
  )
  const plannerPopupTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.date === plannerPopupDate)
        .sort((a, b) => Number(a.done) - Number(b.done)),
    [plannerPopupDate, todos]
  )
  const plannerPopupHasEntries = plannerPopupEvents.length > 0 || plannerPopupTodos.length > 0
  const plannerTodoCountByDate = useMemo(() => {
    const grouped = new Map<string, number>()
    todos.forEach((todo) => {
      if (!todo.date) return
      grouped.set(todo.date, (grouped.get(todo.date) ?? 0) + 1)
    })
    return grouped
  }, [todos])
  const monthPlannerDays = useMemo(() => {
    const first = toMonthStart(monthPlannerCursor)
    const startOffset = (first.getDay() + 6) % 7
    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - startOffset)
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + index)
      const iso = toLocalIsoDate(date)
      const monthEventCount = (plannerEventsByDate.get(iso)?.length ?? 0) + (plannerTodoCountByDate.get(iso) ?? 0)
      return {
        iso,
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === first.getMonth(),
        isToday: iso === todayIso(),
        count: monthEventCount,
      }
    })
  }, [monthPlannerCursor, plannerEventsByDate, plannerTodoCountByDate])
  const monthPlannerLabel = useMemo(
    () =>
      monthPlannerCursor.toLocaleDateString('de-DE', {
        month: 'long',
        year: 'numeric',
      }),
    [monthPlannerCursor]
  )

  const plannerSyncLabel = useMemo(() => {
    if (!plannerSyncSettings.lastSyncedAt) return 'Noch nie synchronisiert'
    const parsed = new Date(plannerSyncSettings.lastSyncedAt)
    if (Number.isNaN(parsed.getTime())) return 'Noch nie synchronisiert'
    return `Zuletzt: ${parsed.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })}`
  }, [plannerSyncSettings.lastSyncedAt])

  const formatPlannerDay = (isoDate: string) => {
    const parsed = new Date(`${isoDate}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return isoDate
    return parsed.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })
  }

  const formatPlannerTime = (event: PlannerEvent) => {
    if (event.allDay) return 'Ganztags'
    return `${event.start} - ${event.end}`
  }

  const openDayPlanner = (isoDate: string) => {
    setActiveDate(isoDate)
    setDayPlannerDate(isoDate)
    setMonthPlannerOpen(false)
    setPlannerNotice(null)
  }

  const openMonthPlanner = () => {
    setDayPlannerDate(null)
    setPlannerEditorOpen(false)
    setMonthPlannerCursor(toMonthStart(activeDate))
    setMonthPlannerOpen(true)
  }

  const openPlannerEditorForCreate = (date: string, kind: 'session' | 'task') => {
    setPlannerEditorMode('create')
    setPlannerDraft(createPlannerDraft(date, kind))
    setPlannerEditorOpen(true)
    setPlannerNotice(null)
  }

  const openPlannerEditorForEdit = (event: PlannerEvent) => {
    if (event.readOnly || event.source !== 'elea') return
    setPlannerEditorMode('edit')
    setPlannerDraft(createPlannerDraft(event.date, event.kind === 'task' ? 'task' : 'session', event))
    setPlannerEditorOpen(true)
    setPlannerNotice(null)
  }

  const deletePlannerEvent = (eventId: string) => {
    setPlannerEleaEvents((current) => current.filter((event) => event.id !== eventId))
    setPlannerNotice({ type: 'ok', text: 'Termin entfernt.' })
  }

  const getBlockedRanges = (isoDate: string, excludeEventId: string | null) => {
    const ranges = plannerEvents
      .filter((event) => event.date === isoDate && event.id !== excludeEventId)
      .map((event) => {
        if (event.allDay) return { start: 0, end: 24 * 60 }
        let start = timeToMinutes(event.start)
        let end = Math.max(timeToMinutes(event.end), start + 15)
        if (event.source !== 'elea' && plannerSyncSettings.bufferMinutes > 0) {
          start = Math.max(0, start - plannerSyncSettings.bufferMinutes)
          end = Math.min(24 * 60, end + plannerSyncSettings.bufferMinutes)
        }
        return { start, end }
      })
    return mergeRanges(ranges)
  }

  const fitEventAroundBlockedRanges = (
    isoDate: string,
    draftStart: string,
    draftEnd: string,
    excludeEventId: string | null
  ) => {
    let start = timeToMinutes(draftStart)
    const endInitial = timeToMinutes(draftEnd)
    const duration = Math.max(endInitial - start, 15)
    let end = start + duration
    const blocked = getBlockedRanges(isoDate, excludeEventId)
    let shifted = false
    let guard = 0

    while (guard < 48) {
      guard += 1
      const conflict = blocked.find((range) => start < range.end && end > range.start)
      if (!conflict) {
        if (end > 24 * 60) return null
        return { start: minutesToTime(start), end: minutesToTime(end), shifted }
      }
      start = conflict.end
      end = start + duration
      shifted = true
      if (end > 24 * 60) return null
    }
    return null
  }

  const savePlannerDraft = () => {
    const title = plannerDraft.title.trim()
    if (!title) {
      setPlannerNotice({ type: 'warn', text: 'Bitte gib einen Titel ein.' })
      return
    }
    if (!plannerDraft.date) {
      setPlannerNotice({ type: 'warn', text: 'Bitte wähle ein Datum.' })
      return
    }

    let start = plannerDraft.start
    let end = plannerDraft.end
    let shiftedAroundConflicts = false

    if (!plannerDraft.allDay) {
      const startMin = timeToMinutes(start)
      const endMin = timeToMinutes(end)
      if (endMin <= startMin) {
        setPlannerNotice({ type: 'warn', text: 'Endzeit muss nach der Startzeit liegen.' })
        return
      }
      const fitted = fitEventAroundBlockedRanges(plannerDraft.date, start, end, plannerDraft.id)
      if (!fitted) {
        setPlannerNotice({ type: 'warn', text: 'Kein freier Slot verfügbar. Bitte Uhrzeit oder Tag ändern.' })
        return
      }
      start = fitted.start
      end = fitted.end
      shiftedAroundConflicts = fitted.shifted
    }

    const id = plannerDraft.id ?? createPlannerId('elea-plan')
    const nextEvent: PlannerEvent = {
      id,
      source: 'elea',
      kind: plannerDraft.kind,
      title,
      detail: plannerDraft.notes.trim(),
      date: plannerDraft.date,
      start: plannerDraft.allDay ? '00:00' : start,
      end: plannerDraft.allDay ? '23:59' : end,
      allDay: plannerDraft.allDay,
      repeat: plannerDraft.repeat,
      tags: splitList(plannerDraft.tags),
      participants: splitList(plannerDraft.participants),
      location: plannerDraft.location.trim(),
      color: plannerDraft.color || plannerDefaultColor,
      remind: plannerDraft.remind,
      readOnly: false,
      updatedAt: new Date().toISOString(),
    }

    setPlannerEleaEvents((current) => sortPlannerEvents([nextEvent, ...current.filter((event) => event.id !== id)]))
    setPlannerEditorOpen(false)
    setDayPlannerDate(plannerDraft.date)
    setActiveDate(plannerDraft.date)
    setPlannerNotice({
      type: 'ok',
      text: shiftedAroundConflicts
        ? `Termin wurde automatisch auf ${start} - ${end} verschoben (wegen blockierter Slots).`
        : plannerEditorMode === 'edit'
          ? 'Termin aktualisiert.'
          : 'Termin gespeichert.',
    })
  }

  const uploadUniIcal = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseIcalEvents(text)
      if (parsed.length === 0) {
        setPlannerNotice({ type: 'warn', text: 'Keine Kalender-Events in der .ics Datei gefunden.' })
        return
      }
      setPlannerExternalEvents((current) =>
        sortPlannerEvents([...current.filter((row) => row.source !== 'external-uni'), ...parsed])
      )
      setPlannerSyncSettings((prev) => ({
        ...prev,
        uniConnected: true,
        lastSyncedAt: new Date().toISOString(),
      }))
      setPlannerNotice({ type: 'ok', text: `${parsed.length} Uni-Termine importiert.` })
    } catch (error) {
      console.error('iCal Import fehlgeschlagen', error)
      setPlannerNotice({ type: 'warn', text: 'iCal Datei konnte nicht gelesen werden.' })
    } finally {
      event.target.value = ''
    }
  }

  const connectUniIcalLink = () => {
    if (!plannerSyncSettings.uniIcalUrl.trim()) {
      setPlannerNotice({ type: 'warn', text: 'Bitte zuerst einen iCal-Link einfügen.' })
      return
    }
    setPlannerSyncSettings((prev) => ({
      ...prev,
      uniConnected: true,
      lastSyncedAt: new Date().toISOString(),
    }))
    setPlannerNotice({
      type: 'ok',
      text: 'iCal-Link gespeichert. Für verlässlichen Import nutze zusätzlich den .ics Upload.',
    })
  }

  const disconnectCalendarProvider = (provider: PlannerOAuthProvider) => {
    const source: PlannerEventSource = provider === 'google' ? 'external-google' : 'external-outlook'
    setPlannerExternalEvents((current) => current.filter((event) => event.source !== source))
    setPlannerOAuthSessions((current) => {
      const next = { ...current }
      delete next[provider]
      return next
    })
    setPlannerSyncSettings((prev) => ({
      ...prev,
      googleConnected: provider === 'google' ? false : prev.googleConnected,
      outlookConnected: provider === 'outlook' ? false : prev.outlookConnected,
    }))
    setPlannerNotice({
      type: 'ok',
      text: provider === 'google' ? 'Google Kalender getrennt.' : 'Outlook Kalender getrennt.',
    })
  }

  const fetchGoogleCalendarEvents = useCallback(async (accessToken: string) => {
    const { start, end } = buildSyncRange(activeDate)
    const collected: PlannerEvent[] = []
    let nextPageToken = ''
    let guard = 0

    while (guard < 8) {
      guard += 1
      const params = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        maxResults: '2500',
      })
      if (nextPageToken) params.set('pageToken', nextPageToken)

      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      if (!response.ok) {
        const message = await parseApiErrorMessage(response, 'Google Kalender konnte nicht geladen werden.')
        throw new Error(message)
      }
      const payload = await response.json().catch(() => null)
      if (isRecord(payload)) {
        collected.push(...mapGoogleCalendarEvents(payload.items))
        nextPageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : ''
      } else {
        nextPageToken = ''
      }
      if (!nextPageToken) break
    }

    return sortPlannerEvents(collected)
  }, [activeDate])

  const fetchOutlookCalendarEvents = useCallback(async (accessToken: string) => {
    const { start, end } = buildSyncRange(activeDate)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const params = new URLSearchParams({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      '$top': '1000',
      '$select': 'id,subject,bodyPreview,location,start,end,isAllDay,isCancelled',
    })
    let nextUrl = `https://graph.microsoft.com/v1.0/me/calendarview?${params.toString()}`
    const collected: PlannerEvent[] = []
    let guard = 0

    while (nextUrl && guard < 8) {
      guard += 1
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: `outlook.timezone="${timezone}"`,
        },
      })
      if (!response.ok) {
        const message = await parseApiErrorMessage(response, 'Outlook Kalender konnte nicht geladen werden.')
        throw new Error(message)
      }
      const payload = await response.json().catch(() => null)
      if (isRecord(payload)) {
        collected.push(...mapOutlookCalendarEvents(payload.value))
        nextUrl = typeof payload['@odata.nextLink'] === 'string' ? payload['@odata.nextLink'] : ''
      } else {
        nextUrl = ''
      }
    }

    return sortPlannerEvents(collected)
  }, [activeDate])

  const exchangePlannerCode = useCallback(
    async (provider: PlannerOAuthProvider, code: string, codeVerifier: string, redirectUri: string) => {
      const clientId = provider === 'google' ? plannerGoogleClientId : plannerMicrosoftClientId
      if (!clientId) {
        throw new Error(
          provider === 'google' ? 'VITE_GOOGLE_OAUTH_CLIENT_ID fehlt.' : 'VITE_MICROSOFT_OAUTH_CLIENT_ID fehlt.'
        )
      }
      const tokenUrl =
        provider === 'google'
          ? 'https://oauth2.googleapis.com/token'
          : 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
      const body = new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      })
      if (provider === 'outlook') {
        body.set('scope', `${plannerOutlookScope} offline_access openid profile User.Read`)
      }
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })
      if (!response.ok) {
        const message = await parseApiErrorMessage(response, 'OAuth Anmeldung fehlgeschlagen.')
        throw new Error(message)
      }
      const payload = await response.json().catch(() => null)
      const parsed = parsePlannerTokenResponse(payload)
      if (!parsed) throw new Error('Token-Antwort war unvollstaendig.')
      return parsed
    },
    []
  )

  const refreshPlannerSession = useCallback(async (provider: PlannerOAuthProvider, session: PlannerOAuthSession) => {
    const clientId = provider === 'google' ? plannerGoogleClientId : plannerMicrosoftClientId
    if (!clientId) return null
    const tokenUrl =
      provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    })
    if (provider === 'outlook') {
      body.set('scope', `${plannerOutlookScope} offline_access openid profile User.Read`)
    }
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    if (!response.ok) {
      const message = await parseApiErrorMessage(response, 'Token-Refresh fehlgeschlagen.')
      throw new Error(message)
    }
    const payload = await response.json().catch(() => null)
    return parsePlannerTokenResponse(payload, session.refreshToken)
  }, [])

  const ensurePlannerAccessToken = useCallback(
    async (provider: PlannerOAuthProvider) => {
      const session = plannerOAuthSessions[provider]
      if (!session) return null
      const expiresAt = new Date(session.expiresAt).getTime()
      if (!Number.isNaN(expiresAt) && expiresAt - plannerOauthClockSkewMs > Date.now()) {
        return session.accessToken
      }
      const refreshed = await refreshPlannerSession(provider, session)
      if (!refreshed) throw new Error('Token konnte nicht erneuert werden.')
      setPlannerOAuthSessions((current) => ({
        ...current,
        [provider]: refreshed,
      }))
      return refreshed.accessToken
    },
    [plannerOAuthSessions, refreshPlannerSession]
  )

  const startPlannerOAuth = useCallback(
    async (provider: PlannerOAuthProvider) => {
      const clientId = provider === 'google' ? plannerGoogleClientId : plannerMicrosoftClientId
      if (!clientId) {
        setPlannerNotice({
          type: 'warn',
          text:
            provider === 'google'
              ? 'Bitte VITE_GOOGLE_OAUTH_CLIENT_ID in .env.local setzen.'
              : 'Bitte VITE_MICROSOFT_OAUTH_CLIENT_ID in .env.local setzen.',
        })
        return
      }
      setPlannerOauthBusy(provider)
      try {
        const state = createRandomToken(24)
        const codeVerifier = createRandomToken(48)
        const codeChallenge = await createPkceChallenge(codeVerifier)
        const redirectUri = `${window.location.origin}${window.location.pathname}`
        const pending: PlannerOAuthPending = {
          provider,
          state,
          codeVerifier,
          redirectUri,
        }
        sessionStorage.setItem(plannerOauthPendingKey, JSON.stringify(pending))

        const authEndpoint =
          provider === 'google'
            ? 'https://accounts.google.com/o/oauth2/v2/auth'
            : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
        const scope =
          provider === 'google'
            ? `openid email profile ${plannerGoogleScope}`
            : `openid profile offline_access User.Read ${plannerOutlookScope}`
        const params = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          scope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        })
        if (provider === 'google') {
          params.set('access_type', 'offline')
          params.set('prompt', 'consent')
          params.set('include_granted_scopes', 'true')
        } else {
          params.set('response_mode', 'query')
        }
        window.location.assign(`${authEndpoint}?${params.toString()}`)
      } catch (error) {
        console.error('OAuth Start fehlgeschlagen', error)
        setPlannerNotice({ type: 'warn', text: 'OAuth Flow konnte nicht gestartet werden.' })
        setPlannerOauthBusy(null)
      }
    },
    []
  )

  const syncPlannerEvents = useCallback(
    async (origin: 'manual' | 'auto') => {
      const connectedProviders: PlannerOAuthProvider[] = []
      if (plannerSyncSettings.googleConnected) connectedProviders.push('google')
      if (plannerSyncSettings.outlookConnected) connectedProviders.push('outlook')

      const syncedExternal: PlannerEvent[] = []
      let hadErrors = false

      for (const provider of connectedProviders) {
        try {
          const accessToken = await ensurePlannerAccessToken(provider)
          if (!accessToken) continue
          const events =
            provider === 'google'
              ? await fetchGoogleCalendarEvents(accessToken)
              : await fetchOutlookCalendarEvents(accessToken)
          syncedExternal.push(...events)
        } catch (error) {
          hadErrors = true
          console.error(`${provider} Sync fehlgeschlagen`, error)
          setPlannerNotice({
            type: 'warn',
            text:
              provider === 'google'
                ? 'Google Sync fehlgeschlagen. Bitte neu verbinden.'
                : 'Outlook Sync fehlgeschlagen. Bitte neu verbinden.',
          })
        }
      }

      setPlannerExternalEvents((current) => {
        const retained = current.filter(
          (event) => event.source !== 'external-google' && event.source !== 'external-outlook'
        )
        return sortPlannerEvents([...retained, ...syncedExternal])
      })

      if (connectedProviders.length > 0) {
        setPlannerSyncSettings((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }))
      }

      if (origin === 'manual') {
        if (connectedProviders.length === 0 && !plannerSyncSettings.uniConnected) {
          setPlannerNotice({
            type: 'warn',
            text: 'Keine Quelle verbunden. Verbinde Google, Outlook oder Uni iCal.',
          })
        } else if (!hadErrors) {
          setPlannerNotice({
            type: 'ok',
            text: 'Kalender erfolgreich synchronisiert.',
          })
        }
      }
    },
    [
      ensurePlannerAccessToken,
      fetchGoogleCalendarEvents,
      fetchOutlookCalendarEvents,
      plannerSyncSettings.googleConnected,
      plannerSyncSettings.outlookConnected,
      plannerSyncSettings.uniConnected,
    ]
  )

  useEffect(() => {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const oauthError = url.searchParams.get('error')
    if (!code && !oauthError) return

    const cleanupUrl = () => {
      url.searchParams.delete('code')
      url.searchParams.delete('state')
      url.searchParams.delete('error')
      url.searchParams.delete('error_description')
      url.searchParams.delete('session_state')
      const nextSearch = url.searchParams.toString()
      const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`
      window.history.replaceState({}, document.title, nextUrl)
    }

    const pending = parseJson<PlannerOAuthPending | null>(sessionStorage.getItem(plannerOauthPendingKey), null)
    sessionStorage.removeItem(plannerOauthPendingKey)

    if (!pending || !state || pending.state !== state) {
      cleanupUrl()
      setPlannerNotice({ type: 'warn', text: 'OAuth Status ungueltig. Bitte erneut verbinden.' })
      return
    }

    if (oauthError) {
      cleanupUrl()
      const description = url.searchParams.get('error_description')
      setPlannerNotice({
        type: 'warn',
        text: description ? `Verbindung abgebrochen: ${description}` : 'Verbindung abgebrochen.',
      })
      return
    }

    if (!code) {
      cleanupUrl()
      setPlannerNotice({ type: 'warn', text: 'Kein OAuth Code erhalten.' })
      return
    }

    let cancelled = false
    setPlannerOauthBusy(pending.provider)
    void (async () => {
      try {
        const session = await exchangePlannerCode(pending.provider, code, pending.codeVerifier, pending.redirectUri)
        if (cancelled) return
        setPlannerOAuthSessions((current) => ({
          ...current,
          [pending.provider]: session,
        }))
        setPlannerSyncSettings((prev) => ({
          ...prev,
          googleConnected: pending.provider === 'google' ? true : prev.googleConnected,
          outlookConnected: pending.provider === 'outlook' ? true : prev.outlookConnected,
          lastSyncedAt: new Date().toISOString(),
        }))
        setPlannerProviderModalOpen(false)
        setPlannerNotice({
          type: 'ok',
          text: pending.provider === 'google' ? 'Google erfolgreich verbunden.' : 'Outlook erfolgreich verbunden.',
        })
      } catch (error) {
        console.error('OAuth Abschluss fehlgeschlagen', error)
        setPlannerNotice({ type: 'warn', text: 'Kalender-Verbindung fehlgeschlagen.' })
      } finally {
        if (!cancelled) setPlannerOauthBusy(null)
        cleanupUrl()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [exchangePlannerCode])

  useEffect(() => {
    if (!plannerSyncSettings.googleConnected && !plannerSyncSettings.outlookConnected && !plannerSyncSettings.uniConnected) return
    const timer = window.setInterval(() => {
      void syncPlannerEvents('auto')
    }, plannerSyncSettings.autoSyncMinutes * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [
    plannerSyncSettings.autoSyncMinutes,
    plannerSyncSettings.googleConnected,
    plannerSyncSettings.outlookConnected,
    plannerSyncSettings.uniConnected,
    syncPlannerEvents,
  ])

  useEffect(() => {
    if (!plannerSyncSettings.googleConnected && !plannerSyncSettings.outlookConnected) return
    void syncPlannerEvents('auto')
  }, [plannerSyncSettings.googleConnected, plannerSyncSettings.outlookConnected, activeDate, syncPlannerEvents])


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
        text: 'Wähle min. BASIC Plan aus für super schnellen Direkt-Betreuungssupport.',
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

  useEffect(() => {
    return () => {
      if (askRecordingTimeoutRef.current) {
        window.clearTimeout(askRecordingTimeoutRef.current)
      }
      if (askCaptureRef.current) {
        void askCaptureRef.current.cancel()
        askCaptureRef.current = null
      }
    }
  }, [])

  const runEleaExplain = async (question: string) => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined
    const preferredModel = (import.meta.env.VITE_GROQ_CHAT_MODEL as string | undefined) || 'llama-3.3-70b-versatile'
    const models = [preferredModel, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']
    if (!apiKey) {
      throw new Error('VITE_GROQ_API_KEY fehlt in .env.local.')
    }

    const system =
      'Du bist Elea, eine freundliche Thesis-Mentorin. Antworte auf Deutsch, sehr einfach, klar und kurz. Nutze nur gueltiges JSON.'
    const userPrompt = `Frage:\n${question}\n\nGib genau dieses JSON-Format zurueck:\n{\n  "explanation": "string (einfach erklaert)",\n  "examples": ["string", "string", "string"],\n  "nextSteps": ["string", "string", "string"]\n}\n\nRegeln:\n- fuer Studierende leicht verstaendlich\n- konkrete Beispiele\n- naechste Schritte als direkte Handlungsanweisungen`

    const { parsed } = await groqChatJsonWithFallback<EleaExplainResponse>({
      apiKey,
      models,
      system,
      user: userPrompt,
      temperature: 0.2,
      maxTokens: 1100,
    })

    if (!parsed || typeof parsed.explanation !== 'string') {
      throw new Error('Antwort konnte nicht verarbeitet werden. Bitte erneut fragen.')
    }
    return {
      explanation: parsed.explanation.trim(),
      examples: Array.isArray(parsed.examples) ? parsed.examples.filter(Boolean).slice(0, 5) : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.filter(Boolean).slice(0, 5) : [],
    } satisfies EleaExplainResponse
  }

  const askElea = async () => {
    const question = askEleaQuestion.trim()
    if (!question) {
      setAskEleaNotice({ type: 'warn', text: 'Bitte zuerst eine Frage eingeben oder aufnehmen.' })
      return
    }
    setAskEleaNotice(null)
    setAskEleaBusy(true)
    setAskEleaAnswer(null)
    setAskEleaQuiz([])
    try {
      const answer = await runEleaExplain(question)
      setAskEleaAnswer(answer)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Antwort konnte nicht erstellt werden.'
      setAskEleaNotice({ type: 'warn', text: message })
    } finally {
      setAskEleaBusy(false)
    }
  }

  const persistTodosForMyThesis = async (updater: (current: TodoItem[]) => TodoItem[]) => {
    const currentTodos = normalizeTodos(parseJson(localStorage.getItem(STORAGE_KEYS.todos), []))
    const nextTodos = updater(currentTodos)
    localStorage.setItem(STORAGE_KEYS.todos, JSON.stringify(nextTodos))
    setTodos(nextTodos)
    if (user?.id) {
      replaceTodos(user.id, nextTodos).catch((error) => {
        console.error('Todos speichern fehlgeschlagen', error)
      })
    }
    return nextTodos
  }

  const normalizeAskEleaQuizRows = (rows: unknown): EleaQuizQuestion[] => {
    if (!Array.isArray(rows)) return []
    return rows
      .map((item) => ({
        question: typeof item?.question === 'string' ? item.question.trim() : '',
        options: Array.isArray(item?.options) ? item.options.map((opt: unknown) => String(opt)).slice(0, 4) : [],
        correct: Number.isFinite(item?.correct) ? Math.max(0, Math.min(3, Number(item.correct))) : 0,
        explanation: typeof item?.explanation === 'string' ? item.explanation.trim() : '',
        chapterTag: typeof item?.chapterTag === 'string' && item.chapterTag.trim() ? item.chapterTag.trim() : 'Frag Elea',
      }))
      .filter((item) => item.question.length > 0 && item.options.length === 4)
      .slice(0, 5)
  }

  const persistStudyMaterialForMyThesis = async (material: StudyMaterial) => {
    const currentStudy = normalizeStudyMaterials(parseJson(localStorage.getItem(STORAGE_KEYS.studyMaterials), []))
    const nextStudy = [material, ...currentStudy.filter((item) => item.id !== material.id)]
    localStorage.setItem(STORAGE_KEYS.studyMaterials, JSON.stringify(nextStudy))
    if (user?.id) {
      replaceStudyMaterials(user.id, nextStudy).catch((error) => {
        console.error('Study-Materialien speichern fehlgeschlagen', error)
      })
    }
    return nextStudy
  }

  const createTaskFromAskElea = () => {
    const question = askEleaQuestion.trim()
    if (!question) {
      setAskEleaNotice({ type: 'warn', text: 'Keine Frage vorhanden, aus der eine Aufgabe erstellt werden kann.' })
      return
    }
    const taskTitle = `Frag Elea: ${question.slice(0, 52)}${question.length > 52 ? '...' : ''}`
    const taskDetail = askEleaAnswer?.nextSteps?.[0] || 'Aus der Elea-Erklaerung ableiten und umsetzen.'
    const date = todayIso()
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`

    void persistTodosForMyThesis((current) => [{ id, title: taskTitle, detail: taskDetail, date, done: false }, ...current])
    setAskEleaNotice({ type: 'ok', text: 'Aufgabe gespeichert in My Thesis > Aufgaben.' })
  }

  const buildQuizFromAskElea = async () => {
    const question = askEleaQuestion.trim()
    const answer = askEleaAnswer
    if (!question || !answer) {
      setAskEleaNotice({ type: 'warn', text: 'Bitte zuerst eine Frage stellen und Antwort erzeugen.' })
      return
    }
    const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined
    const preferredModel = (import.meta.env.VITE_GROQ_CHAT_MODEL as string | undefined) || 'llama-3.3-70b-versatile'
    const models = [preferredModel, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']
    if (!apiKey) {
      setAskEleaNotice({ type: 'warn', text: 'VITE_GROQ_API_KEY fehlt in .env.local.' })
      return
    }

    setAskEleaQuizBusy(true)
    try {
      const { parsed } = await groqChatJsonWithFallback<{
        easy: EleaQuizQuestion[]
        medium: EleaQuizQuestion[]
        hard: EleaQuizQuestion[]
      }>({
        apiKey,
        models,
        system: 'Du erstellst Lernquiz fuer Studierende. Antworte nur als gueltiges JSON.',
        user: `Erzeuge ein Lernlabor-Quiz mit drei Levels (easy, medium, hard), jeweils 5 MCQs mit je 4 Optionen.\nFrage: ${question}\nErklaerung: ${answer.explanation}\nBeispiele: ${answer.examples.join(' | ')}\n\nJSON-Format:\n{"easy":[{"question":"string","options":["a","b","c","d"],"correct":0,"explanation":"string","chapterTag":"string"}],"medium":[{"question":"string","options":["a","b","c","d"],"correct":0,"explanation":"string","chapterTag":"string"}],"hard":[{"question":"string","options":["a","b","c","d"],"correct":0,"explanation":"string","chapterTag":"string"}]}`,
        temperature: 0.22,
        maxTokens: 2300,
      })

      const easy = normalizeAskEleaQuizRows(parsed?.easy)
      const medium = normalizeAskEleaQuizRows(parsed?.medium)
      const hard = normalizeAskEleaQuizRows(parsed?.hard)
      const fallback = medium.length > 0 ? medium : easy.length > 0 ? easy : hard
      const quizSets: StudyQuiz = {
        easy: easy.length > 0 ? easy : fallback,
        medium: medium.length > 0 ? medium : fallback,
        hard: hard.length > 0 ? hard : fallback,
      }

      if (quizSets.easy.length === 0 || quizSets.medium.length === 0 || quizSets.hard.length === 0) {
        throw new Error('Quiz konnte nicht erzeugt werden.')
      }

      setAskEleaQuiz(quizSets.medium)

      const timestamp = new Date().toISOString()
      const materialId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `study-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const titleSeed = question.slice(0, 48).trim()
      const material: StudyMaterial = {
        id: materialId,
        name: titleSeed.length > 0 ? `Frag-Elea Quiz: ${titleSeed}` : `Frag-Elea Quiz ${todayIso()}`,
        size: 0,
        pageCount: 0,
        uploadedAt: timestamp,
        status: 'ready',
        tutor: {
          title: titleSeed.length > 0 ? titleSeed : 'Frag Elea',
          intro: answer.explanation,
          keyTakeaways: answer.nextSteps.slice(0, 6),
          sections: [
            {
              heading: 'Beispiele',
              bullets: answer.nextSteps.slice(0, 6),
              definitions: [],
              examples: answer.examples.slice(0, 6),
              questions: [question],
            },
          ],
        },
        quiz: quizSets,
        quizHistory: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      await persistStudyMaterialForMyThesis(material)
      setAskEleaNotice({ type: 'ok', text: 'Quiz erstellt und in My Thesis > Lernlabor gespeichert.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quiz konnte nicht erstellt werden.'
      setAskEleaNotice({ type: 'warn', text: message })
    } finally {
      setAskEleaQuizBusy(false)
    }
  }

  const transcribeAskEleaAudio = async (audioBlob: Blob, extension: string) => {
    const endpoint = import.meta.env.VITE_TRANSCRIBE_ENDPOINT || '/api/transcribe'
    const formData = new FormData()
    formData.append('file', audioBlob, `ask-elea-${Date.now()}.${extension}`)

    let transcript = ''
    const response = await fetch(endpoint, { method: 'POST', body: formData })
    if (response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { text?: string; transcript?: string }
      transcript = (payload?.transcript || payload?.text || '').trim()
    } else {
      const groqKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined
      if (!groqKey) throw new Error('Transkription fehlgeschlagen.')
      const groqForm = new FormData()
      groqForm.append('file', audioBlob, `ask-elea-${Date.now()}.${extension}`)
      groqForm.append('model', 'whisper-large-v3-turbo')
      groqForm.append('language', 'de')
      groqForm.append('response_format', 'json')
      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: groqForm,
      })
      const groqPayload = (await groqRes.json().catch(() => ({}))) as { text?: string; error?: { message?: string } }
      if (!groqRes.ok) {
        throw new Error(groqPayload?.error?.message || 'Transkription fehlgeschlagen.')
      }
      transcript = (groqPayload?.text || '').trim()
    }

    if (!transcript) throw new Error('Kein Transkript erkannt.')
    return transcript
  }

  const stopAskEleaRecording = async () => {
    const capture = askCaptureRef.current
    if (!capture) return
    askCaptureRef.current = null

    if (askRecordingTimeoutRef.current) {
      window.clearTimeout(askRecordingTimeoutRef.current)
      askRecordingTimeoutRef.current = null
    }

    setAskEleaRecording(false)
    setAskEleaTranscribing(true)

    try {
      const audio = await capture.stop()
      const transcript = await transcribeAskEleaAudio(audio.blob, audio.extension)
      setAskEleaQuestion((prev) => `${prev.trim()} ${transcript}`.trim())
      setAskEleaNotice({ type: 'ok', text: 'Frage aus Audio uebernommen.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transkription fehlgeschlagen.'
      setAskEleaNotice({ type: 'warn', text: message })
    } finally {
      setAskEleaTranscribing(false)
    }
  }

  const toggleAskEleaRecording = async () => {
    if (askEleaTranscribing) return

    if (askEleaRecording) {
      await stopAskEleaRecording()
      return
    }

    try {
      setAskEleaNotice({ type: 'ok', text: 'Mikrofon wird gestartet...' })
      const capture = await startMicrophoneCapture()
      askCaptureRef.current = capture
      setAskEleaRecording(true)
      setAskEleaNotice({ type: 'ok', text: 'Aufnahme laeuft... tippe erneut zum Stoppen.' })
      askRecordingTimeoutRef.current = window.setTimeout(() => {
        if (!askCaptureRef.current) return
        void stopAskEleaRecording()
      }, 30000)
    } catch (error) {
      const message = getMicrophoneErrorMessage(error)
      setAskEleaNotice({ type: 'warn', text: message })
      setAskEleaRecording(false)
      if (askCaptureRef.current) {
        void askCaptureRef.current.cancel()
        askCaptureRef.current = null
      }
    }
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
            <div className={`planner-sync-shell ${plannerSyncExpanded ? 'expanded' : 'collapsed'}`}>
              <div className="planner-top-actions">
                <button
                  className="planner-expand-btn"
                  type="button"
                  onClick={() => setPlannerSyncExpanded((prev) => !prev)}
                >
                  Kalender verbinden
                </button>
                <button className="planner-month-open-btn" type="button" onClick={openMonthPlanner}>
                  Monatsansicht
                </button>
              </div>
              {plannerSyncExpanded && (
                <>
              <div className="planner-sync-row">
                <button
                  className={`planner-connect-btn ${plannerSyncSettings.googleConnected || plannerSyncSettings.outlookConnected ? 'connected' : ''}`}
                  type="button"
                  onClick={() => setPlannerProviderModalOpen(true)}
                  disabled={plannerOauthBusy !== null}
                >
                  Jetzt verbinden
                </button>
                <button className="planner-refresh-btn" type="button" onClick={() => void syncPlannerEvents('manual')}>
                  Refresh
                </button>
              </div>
              {(plannerSyncSettings.googleConnected || plannerSyncSettings.outlookConnected) && (
                <div className="planner-sync-row planner-provider-row">
                  {plannerSyncSettings.googleConnected && (
                    <button className="ghost planner-mini-btn" type="button" onClick={() => disconnectCalendarProvider('google')}>
                      Google trennen
                    </button>
                  )}
                  {plannerSyncSettings.outlookConnected && (
                    <button className="ghost planner-mini-btn" type="button" onClick={() => disconnectCalendarProvider('outlook')}>
                      Outlook trennen
                    </button>
                  )}
                </div>
              )}
              <div className="planner-sync-row planner-sync-row-link">
                <input
                  className="planner-ical-input"
                  value={plannerSyncSettings.uniIcalUrl}
                  onChange={(event) =>
                    setPlannerSyncSettings((prev) => ({
                      ...prev,
                      uniIcalUrl: event.target.value,
                    }))
                  }
                  placeholder="Uni iCal-Link einfügen"
                />
                <button className="ghost planner-mini-btn" type="button" onClick={connectUniIcalLink}>
                  Speichern
                </button>
              </div>
              <div className="planner-sync-row">
                <button className="ghost planner-mini-btn" type="button" onClick={() => uniIcalInputRef.current?.click()}>
                  .ics Upload
                </button>
              </div>
              <input ref={uniIcalInputRef} type="file" accept=".ics,text/calendar" className="planner-hidden-input" onChange={uploadUniIcal} />
              <p className="planner-sync-hint">Externe Termine bleiben read-only. Google, Outlook und Uni iCal werden ohne Mock-Daten synchronisiert.</p>
              <p className="planner-sync-meta">{plannerSyncLabel}</p>
                </>
              )}
            </div>
            <div className="calendar planner-week-grid">
              {weekDays.map((day) => {
                const dayEvents = plannerEventsByDate.get(day.iso) ?? []
                return (
                  <button
                    key={day.iso}
                    className={`calendar-day ${day.iso === activeDate ? 'active' : ''}`}
                    type="button"
                    onClick={() => openDayPlanner(day.iso)}
                  >
                    <span>{day.label}</span>
                    <strong>{day.day}</strong>
                    <small>
                      {dayEvents.length === 0 ? 'frei' : `${dayEvents.length} Termin${dayEvents.length > 1 ? 'e' : ''}`}
                    </small>
                  </button>
                )
              })}
            </div>
            <div className="planner-legend">
              <span className="planner-legend-chip elea">elea Sessions</span>
              <span className="planner-legend-chip external">Externe Events</span>
            </div>
            {plannerNotice && <div className={`support-notice ${plannerNotice.type}`}>{plannerNotice.text}</div>}
          </div>
        </aside>

        <section className="panel hero-panel">
          <div className="hero-card">
            <div className={`hero-visual ${showDocs ? '' : 'single'}`}>
              <div className="hero-visual-card brain-card">
                <button className="brain-elea-hint" type="button" onClick={() => setAskEleaOpen(true)}>
                  <span className="brain-elea-grid" />
                  <span className="brain-elea-glow" />
                  <span className="brain-elea-content">
                    <span className="brain-elea-dot" />
                    <span className="brain-elea-text">Frag Elea</span>
                    <span className="brain-elea-mic" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path
                          d="M12 3a3 3 0 0 0-3 3v5a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Zm-6 8v.8a6 6 0 0 0 5 5.92V20H8.8a1 1 0 0 0 0 2h6.4a1 1 0 1 0 0-2H13v-2.28a6 6 0 0 0 5-5.92V11a1 1 0 1 0-2 0v.8a4 4 0 1 1-8 0V11a1 1 0 1 0-2 0Z"
                          fill="currentColor"
                        />
                      </svg>
                    </span>
                  </span>
                </button>
                <button className="brain-image-trigger" type="button" onClick={() => setAskEleaOpen(true)} aria-label="Frag Elea öffnen">
                  <img className="brain-image" src="/brain-hero.png" alt="Gehirn" />
                </button>
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
                    <span>Produktivität</span>
                    <strong>{productivitySnapshot.score}%</strong>
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
                  Dein Stress ist erhöht. Wir empfehlen persönliche Betreuung.
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
                  <div className="support-plan-hint">Support-Chat ist ab BASIC und PRO direkt verfügbar.</div>
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
                    <span className="plan-call-strong">Deine Thesis-Mentorin</span>{' '}
                    <span className="plan-call-name">Dr. Anna Horrer, LMU Muenchen</span>
                  </div>
                  {bookingLabel && <div className="plan-sub">Nächster Termin: {bookingLabel}</div>}
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
                  Bestätigen
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

      {plannerProviderModalOpen && (
        <div className="modal-backdrop" onClick={() => setPlannerProviderModalOpen(false)}>
          <div className="modal planner-provider-modal" onClick={(event) => event.stopPropagation()}>
            <div className="planner-modal-head">
              <div>
                <h2>Kalenderanbieter waehlen</h2>
                <p>Verbinde deinen echten Kalender. Es werden keine Demo-Termine erzeugt.</p>
              </div>
              <button className="ghost" type="button" onClick={() => setPlannerProviderModalOpen(false)}>
                Schliessen
              </button>
            </div>
            <div className="planner-provider-actions">
              <button
                className="primary planner-add-btn"
                type="button"
                onClick={() => void startPlannerOAuth('google')}
                disabled={plannerOauthBusy !== null}
              >
                {plannerOauthBusy === 'google' ? 'Google verbindet...' : 'Google verbinden'}
              </button>
              <button
                className="primary planner-add-btn planner-provider-alt"
                type="button"
                onClick={() => void startPlannerOAuth('outlook')}
                disabled={plannerOauthBusy !== null}
              >
                {plannerOauthBusy === 'outlook' ? 'Outlook verbindet...' : 'Outlook verbinden'}
              </button>
            </div>
          </div>
        </div>
      )}

      {monthPlannerOpen && (
        <div className="modal-backdrop" onClick={() => setMonthPlannerOpen(false)}>
          <div className="modal planner-month-modal" onClick={(event) => event.stopPropagation()}>
            <div className="planner-month-head">
              <button
                className="ghost planner-mini-btn"
                type="button"
                onClick={() => setMonthPlannerCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                &lt;
              </button>
              <h2>{monthPlannerLabel}</h2>
              <div className="planner-month-head-actions">
                <button
                  className="ghost planner-mini-btn"
                  type="button"
                  onClick={() => setMonthPlannerCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                >
                  &gt;
                </button>
                <button className="ghost planner-mini-btn" type="button" onClick={() => setMonthPlannerOpen(false)}>
                  Schliessen
                </button>
              </div>
            </div>
            <div className="planner-month-weekdays">
              {weekdayLabels.map((label) => (
                <span key={`month-week-${label}`}>{label}</span>
              ))}
            </div>
            <div className="planner-month-grid">
              {monthPlannerDays.map((day) => (
                <button
                  key={`month-day-${day.iso}`}
                  className={`planner-month-day ${day.inCurrentMonth ? '' : 'outside'} ${day.isToday ? 'today' : ''} ${
                    day.iso === activeDate ? 'active' : ''
                  }`}
                  type="button"
                  onClick={() => openDayPlanner(day.iso)}
                >
                  <strong>{day.day}</strong>
                  {day.count > 0 ? <small>{day.count} Eintrag{day.count > 1 ? 'e' : ''}</small> : <small>frei</small>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {dayPlannerDate && (
        <div className="modal-backdrop" onClick={() => setDayPlannerDate(null)}>
          <div className="modal planner-day-modal" onClick={(event) => event.stopPropagation()}>
            <div className="planner-modal-head">
              <div>
                <h2>{formatPlannerDay(plannerPopupDate)}</h2>
                <p>Alle Termine dieses Tages. Externe Termine sind grau und blockieren Slots automatisch.</p>
              </div>
              <button className="ghost" type="button" onClick={() => setDayPlannerDate(null)}>
                Schliessen
              </button>
            </div>
            <div className="planner-modal-actions">
              <button className="ghost planner-mini-btn" type="button" onClick={() => openPlannerEditorForCreate(plannerPopupDate, 'task')}>
                Neue Aufgabe
              </button>
              <button className="primary planner-add-btn" type="button" onClick={() => openPlannerEditorForCreate(plannerPopupDate, 'session')}>
                Neuer Termin
              </button>
            </div>
            <div className="planner-day-list">
              {!plannerPopupHasEntries ? (
                <div className="planner-empty">Noch keine Termine fuer diesen Tag.</div>
              ) : (
                <>
                  {plannerPopupEvents.map((event) => (
                    <article key={event.id} className={`planner-day-item ${event.source === 'elea' ? 'elea' : 'external'}`}>
                      <div className="planner-day-time">{formatPlannerTime(event)}</div>
                      <div className="planner-day-body">
                        <strong>{event.title}</strong>
                        {event.location && <span>{event.location}</span>}
                        {event.detail && <p>{event.detail}</p>}
                        <div className="planner-day-meta">
                          {event.tags.slice(0, 3).map((tag) => (
                            <span key={`${event.id}-${tag}`}>{tag}</span>
                          ))}
                        </div>
                      </div>
                      <div className="planner-day-actions">
                        {event.source === 'elea' ? (
                          <>
                            <button className="ghost planner-mini-btn" type="button" onClick={() => openPlannerEditorForEdit(event)}>
                              Bearbeiten
                            </button>
                            <button className="ghost planner-mini-btn danger" type="button" onClick={() => deletePlannerEvent(event.id)}>
                              Loeschen
                            </button>
                          </>
                        ) : (
                          <span className="planner-readonly-pill">Nur lesen</span>
                        )}
                      </div>
                    </article>
                  ))}
                  {plannerPopupTodos.map((todo) => (
                    <article key={`todo-${todo.id}`} className={`planner-day-item ${todo.done ? 'external' : 'elea'}`}>
                      <div className="planner-day-time">{todo.done ? 'Erledigt' : 'Aufgabe'}</div>
                      <div className="planner-day-body">
                        <strong>{todo.title.trim() || 'Aufgabe ohne Titel'}</strong>
                        {todo.detail.trim() && <p>{todo.detail}</p>}
                        <div className="planner-day-meta">
                          <span>{todo.done ? 'Status: erledigt' : 'Status: offen'}</span>
                          <span>My Thesis</span>
                        </div>
                      </div>
                      <div className="planner-day-actions">
                        <button className="ghost planner-mini-btn" type="button" onClick={() => navigate('/my-thesis')}>
                          Zu My Thesis
                        </button>
                      </div>
                    </article>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {plannerEditorOpen && (
        <div className="modal-backdrop" onClick={() => setPlannerEditorOpen(false)}>
          <div className="modal planner-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="planner-editor-head">
              <button className="ghost planner-mini-btn" type="button" onClick={() => setPlannerEditorOpen(false)}>
                Zurueck
              </button>
              <h2>{plannerEditorMode === 'edit' ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
              <button className="primary planner-add-btn" type="button" onClick={savePlannerDraft}>
                Speichern
              </button>
            </div>
            <div className="planner-editor-form">
              <label>
                Titel
                <input
                  value={plannerDraft.title}
                  onChange={(event) => setPlannerDraft((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Titel eingeben..."
                />
              </label>
              <div className="planner-editor-dual">
                <label>
                  Typ
                  <select
                    value={plannerDraft.kind}
                    onChange={(event) =>
                      setPlannerDraft((prev) => ({
                        ...prev,
                        kind: event.target.value === 'task' ? 'task' : 'session',
                      }))
                    }
                  >
                    <option value="session">Termin</option>
                    <option value="task">Aufgabe</option>
                  </select>
                </label>
                <label>
                  Datum
                  <input
                    type="date"
                    value={plannerDraft.date}
                    onChange={(event) => setPlannerDraft((prev) => ({ ...prev, date: event.target.value }))}
                  />
                </label>
              </div>
              <label className="planner-all-day-toggle">
                <span>Ganztags</span>
                <input
                  type="checkbox"
                  checked={plannerDraft.allDay}
                  onChange={(event) => setPlannerDraft((prev) => ({ ...prev, allDay: event.target.checked }))}
                />
              </label>
              {!plannerDraft.allDay && (
                <div className="planner-editor-dual">
                  <label>
                    Start
                    <input
                      type="time"
                      value={plannerDraft.start}
                      onChange={(event) => setPlannerDraft((prev) => ({ ...prev, start: event.target.value }))}
                    />
                  </label>
                  <label>
                    Ende
                    <input
                      type="time"
                      value={plannerDraft.end}
                      onChange={(event) => setPlannerDraft((prev) => ({ ...prev, end: event.target.value }))}
                    />
                  </label>
                </div>
              )}
              <div className="planner-editor-dual">
                <label>
                  Wiederholung
                  <select
                    value={plannerDraft.repeat}
                    onChange={(event) =>
                      setPlannerDraft((prev) => ({
                        ...prev,
                        repeat: plannerRepeatOptions.includes(event.target.value as PlannerRepeat)
                          ? (event.target.value as PlannerRepeat)
                          : 'never',
                      }))
                    }
                  >
                    {plannerRepeatOptions.map((option) => (
                      <option key={option} value={option}>
                        {plannerRepeatLabels[option]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Erinnerung
                  <select
                    value={plannerDraft.remind}
                    onChange={(event) =>
                      setPlannerDraft((prev) => ({
                        ...prev,
                        remind: plannerReminderOptions.includes(event.target.value as PlannerReminder)
                          ? (event.target.value as PlannerReminder)
                          : '30m',
                      }))
                    }
                  >
                    {plannerReminderOptions.map((option) => (
                      <option key={option} value={option}>
                        {plannerReminderLabels[option]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Stichwoerter
                <input
                  value={plannerDraft.tags}
                  onChange={(event) => setPlannerDraft((prev) => ({ ...prev, tags: event.target.value }))}
                  placeholder="z. B. Fokus, Seminar"
                />
              </label>
              <label>
                Teilnehmende
                <input
                  value={plannerDraft.participants}
                  onChange={(event) => setPlannerDraft((prev) => ({ ...prev, participants: event.target.value }))}
                  placeholder="Anna, Lernbuddy"
                />
              </label>
              <label>
                Ort
                <input
                  value={plannerDraft.location}
                  onChange={(event) => setPlannerDraft((prev) => ({ ...prev, location: event.target.value }))}
                  placeholder="Ort eingeben..."
                />
              </label>
              <div className="planner-color-picker">
                <span>Farbe</span>
                <div>
                  {plannerColorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`planner-color-dot ${plannerDraft.color === color ? 'active' : ''}`}
                      style={{ '--planner-dot': color } as CSSProperties}
                      onClick={() => setPlannerDraft((prev) => ({ ...prev, color }))}
                      aria-label={`Farbe ${color}`}
                    />
                  ))}
                </div>
              </div>
              <label>
                Notizen
                <textarea
                  value={plannerDraft.notes}
                  onChange={(event) => setPlannerDraft((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Kurze Notiz eingeben..."
                />
              </label>
              {plannerNotice && <div className={`support-notice ${plannerNotice.type}`}>{plannerNotice.text}</div>}
            </div>
          </div>
        </div>
      )}

      {askEleaOpen && (
        <div className="modal-backdrop" onClick={() => setAskEleaOpen(false)}>
          <div className="modal elea-ask-modal" onClick={(event) => event.stopPropagation()}>
            <div className="elea-ask-head">
              <h2>Frag Elea</h2>
              <button className="ghost" type="button" onClick={() => setAskEleaOpen(false)}>
                Schließen
              </button>
            </div>
            <p className="elea-ask-subline">
              Stelle eine Frage per Text oder Mikrofon. Du bekommst eine einfache Erklärung mit Beispielen und nächsten Schritten.
            </p>
            <div className="elea-ask-input">
              <textarea
                value={askEleaQuestion}
                onChange={(event) => {
                  setAskEleaQuestion(event.target.value)
                  if (askEleaNotice) setAskEleaNotice(null)
                }}
                placeholder="z. B. Erkläre Integralrechnung einfach."
              />
              <div className="elea-ask-actions">
                <button className="ghost" type="button" onClick={toggleAskEleaRecording} disabled={askEleaTranscribing || askEleaBusy}>
                  {askEleaRecording ? 'Aufnahme stoppen' : askEleaTranscribing ? 'Transkribiere...' : 'Mikrofon'}
                </button>
                <button className="primary" type="button" onClick={askElea} disabled={askEleaBusy || askEleaTranscribing}>
                  {askEleaBusy ? 'Antwort wird erstellt...' : 'Antwort holen'}
                </button>
              </div>
            </div>

            {askEleaNotice && <div className={`support-notice ${askEleaNotice.type}`}>{askEleaNotice.text}</div>}

            {askEleaAnswer && (
              <div className="elea-ask-answer">
                <h3>Einfach erklärt</h3>
                <p>{askEleaAnswer.explanation}</p>

                {askEleaAnswer.examples.length > 0 && (
                  <div className="elea-ask-block">
                    <h4>Beispiele</h4>
                    <ul>
                      {askEleaAnswer.examples.map((example) => (
                        <li key={example}>{example}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {askEleaAnswer.nextSteps.length > 0 && (
                  <div className="elea-ask-block">
                    <h4>Nächste Schritte</h4>
                    <ol>
                      {askEleaAnswer.nextSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="elea-ask-cta-row">
                  <button className="ghost" type="button" onClick={buildQuizFromAskElea} disabled={askEleaQuizBusy}>
                    {askEleaQuizBusy ? 'Quiz wird erstellt...' : 'Quiz erstellen'}
                  </button>
                  <button className="ghost" type="button" onClick={createTaskFromAskElea}>
                    Aufgabe erstellen
                  </button>
                  <button className="ghost" type="button" onClick={() => navigate('/my-thesis')}>
                    Zu My Thesis
                  </button>
                </div>

                {askEleaQuiz.length > 0 && (
                  <div className="elea-ask-quiz">
                    <h4>Mini-Quiz</h4>
                    <div className="elea-ask-quiz-list">
                      {askEleaQuiz.map((item, index) => (
                        <div key={`${item.question}-${index}`} className="elea-ask-quiz-item">
                          <strong>
                            {index + 1}. {item.question}
                          </strong>
                          <ul>
                            {item.options.map((option, optionIndex) => (
                              <li key={`${item.question}-${optionIndex}`}>{option}</li>
                            ))}
                          </ul>
                          {item.explanation && <small>{item.explanation}</small>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
        <p>Beantworte die Fragen, damit wir deinen Plan empfehlen können.</p>
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
        </div>
      </div>
    </div>
  )
}

export default DashboardPage



