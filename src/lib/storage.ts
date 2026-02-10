export type Plan = 'free' | 'basic' | 'pro'

export type Profile = {
  studiengang: string
  hochschule?: string
  abgabedatum: string
  status: '0' | '30' | '50' | '80'
  zielnote: '0,7' | '1,0' | '1,3' | '1,7' | '2,0' | '2,3' | '2,7' | '3,0'
}

export type StressEntry = {
  date: string
  value: number
}

export type AssessmentResult = {
  answers: Record<string, string>
  score: number
  recommendedPlan: Plan
  reasons: string[]
  completedAt: string
}

export type SchoolLesson = {
  id: string
  title: string
  duration: string
  summary: string
  embedUrl?: string
}

export type SchoolModule = {
  id: string
  title: string
  summary: string
  lessons: SchoolLesson[]
}

export type SchoolContent = {
  modules: SchoolModule[]
}

export type SchoolProgress = {
  lessons: Record<string, boolean>
  lastLessonId?: string
}

export type BookingEntry = {
  date: string
  time: string
  createdAt: string
}

export type DeadlineLogEntry = {
  date: string
  recordedAt: string
}

export type TodoItem = {
  id: string
  title: string
  detail: string
  date: string
  done: boolean
}

export type ThesisDocument = {
  id: string
  name: string
  size: number
  type: string
  lastModified: number
  uploadedAt: string
}

export type ThesisChecklistItem = {
  id: string
  title: string
  detail: string
  done: boolean
}


export type TimeSlot = {
  id: string
  label: string
}

export const TIME_SLOTS: TimeSlot[] = [
  { id: 'slot-1300', label: '13:00 – 14:00' },
  { id: 'slot-1630', label: '16:30 – 17:15' },
]

export const STORAGE_KEYS = {
  profile: 'elea_profile',
  stress: 'elea_stress',
  stressValue: 'elea_stress_value',
  plan: 'elea_plan',
  referralOwnCode: 'elea_referral_own_code',
  referralPendingCode: 'elea_referral_pending_code',
  referralClaimedCode: 'elea_referral_claimed_code',
  referralLastReservation: 'elea_referral_last_reservation',
  lektorat: 'elea_lektorat',
  commitmentSeen: 'elea_commitment_seen',
  schoolProgress: 'elea_school_progress',
  schoolContent: 'elea_school_content',
  assessment: 'elea_assessment',
  deadlineLog: 'elea_deadline_log',
  phdBookings: 'elea_phd_bookings',
  phdBlackouts: 'elea_phd_blackouts',
  todos: 'elea_todos',
  thesisDocuments: 'elea_thesis_documents',
  thesisChecklist: 'elea_thesis_checklist',
  thesisNotes: 'elea_thesis_notes',
  lastUserId: 'elea_last_user_id',
}

export const USER_LOCAL_KEYS = [
  STORAGE_KEYS.profile,
  STORAGE_KEYS.stress,
  STORAGE_KEYS.stressValue,
  STORAGE_KEYS.plan,
  STORAGE_KEYS.referralOwnCode,
  STORAGE_KEYS.referralPendingCode,
  STORAGE_KEYS.referralClaimedCode,
  STORAGE_KEYS.referralLastReservation,
  STORAGE_KEYS.lektorat,
  STORAGE_KEYS.commitmentSeen,
  STORAGE_KEYS.schoolProgress,
  STORAGE_KEYS.assessment,
  STORAGE_KEYS.deadlineLog,
  STORAGE_KEYS.phdBookings,
  STORAGE_KEYS.phdBlackouts,
  STORAGE_KEYS.todos,
  STORAGE_KEYS.thesisDocuments,
  STORAGE_KEYS.thesisChecklist,
  STORAGE_KEYS.thesisNotes,
]

export const clearUserLocalState = () => {
  USER_LOCAL_KEYS.forEach((key) => localStorage.removeItem(key))
}

export const parseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const pad2 = (value: number) => value.toString().padStart(2, '0')

export const toLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

export const todayIso = () => toLocalIsoDate(new Date())

export const normalizeTodos = (value: unknown): TodoItem[] => {
  if (!Array.isArray(value)) return []
  const today = todayIso()
  return value.map((item, index) => {
    const raw = item as Record<string, unknown>
    const id =
      typeof raw?.id === 'string' && raw.id.trim().length > 0 ? raw.id : `todo-${Date.now()}-${index}`
    const title = typeof raw?.title === 'string' ? raw.title : ''
    const detail = typeof raw?.detail === 'string' ? raw.detail : ''
    let date = typeof raw?.date === 'string' ? raw.date : ''
    if (!date && typeof raw?.slotId === 'string' && raw.slotId) {
      date = today
    }
    const done = typeof raw?.done === 'boolean' ? raw.done : false
    return { id, title, detail, date, done }
  })
}

export const parseDeadlineDate = (value?: string | null) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    return new Date(year, month - 1, day, 23, 59, 59, 999)
  }

  const dmyMatch = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(trimmed)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    const year = Number(dmyMatch[3])
    return new Date(year, month - 1, day, 23, 59, 59, 999)
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export const formatCountdown = (days: number, hours: number, minutes: number, seconds: number) =>
  `Noch ${days} Tage · ${hours}h · ${minutes}min · ${seconds}s`
