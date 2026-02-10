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
  linkedDocumentId?: string
}

const isPlaceholderTodo = (title: string, detail: string) => {
  const t = title.trim().toLowerCase()
  const d = detail.trim().toLowerCase()
  if (!t) return true
  if (t === 'noch keine aufgabe') return true
  if (t === 'keine aufgabe') return true
  if (t === 'placeholder') return true
  if (d === 'in my thesis') return true
  return false
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

export type ThesisNote = {
  id: string
  title: string
  content: string
  subject: string
  tags: string[]
  priority: 'low' | 'medium' | 'high'
  linkedDocumentId?: string
  linkedTodoId?: string
  inputType: 'text' | 'voice'
  createdAt: string
  updatedAt: string
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
  rememberedEmail: 'elea_remembered_email',
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
  return value
    .map((item, index) => {
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
      const linkedDocumentId = typeof raw?.linkedDocumentId === 'string' ? raw.linkedDocumentId : ''
      return { id, title, detail, date, done, linkedDocumentId }
    })
    .filter((todo) => !isPlaceholderTodo(todo.title, todo.detail))
}

export const normalizeThesisNotes = (value: unknown): ThesisNote[] => {
  const now = new Date().toISOString()
  if (!value) return []

  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        const raw = item as Record<string, unknown>
        const id =
          typeof raw?.id === 'string' && raw.id.trim().length > 0 ? raw.id : `note-${Date.now()}-${index}`
        const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
        const content = typeof raw?.content === 'string' ? raw.content.trim() : ''
        const subject = typeof raw?.subject === 'string' ? raw.subject.trim() : ''
        const tags = Array.isArray(raw?.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : []
        const priority = raw?.priority === 'high' || raw?.priority === 'medium' || raw?.priority === 'low' ? raw.priority : 'medium'
        const linkedDocumentId = typeof raw?.linkedDocumentId === 'string' ? raw.linkedDocumentId : ''
        const linkedTodoId = typeof raw?.linkedTodoId === 'string' ? raw.linkedTodoId : ''
        const inputType = raw?.inputType === 'voice' ? 'voice' : 'text'
        const createdAt = typeof raw?.createdAt === 'string' && raw.createdAt.length > 0 ? raw.createdAt : now
        const updatedAt = typeof raw?.updatedAt === 'string' && raw.updatedAt.length > 0 ? raw.updatedAt : createdAt
        return {
          id,
          title,
          content,
          subject,
          tags,
          priority,
          linkedDocumentId,
          linkedTodoId,
          inputType,
          createdAt,
          updatedAt,
        } as ThesisNote
      })
      .filter((note) => note.title.length > 0 || note.content.length > 0)
  }

  if (typeof value === 'object') {
    const legacy = value as Record<string, unknown>
    const mapping: Array<{ key: string; title: string; subject: string; tags: string[] }> = [
      { key: 'chapter', title: 'Kapitel-Fokus', subject: 'Thesis', tags: ['kapitel'] },
      { key: 'method', title: 'Methodik To-dos', subject: 'Methodik', tags: ['methodik'] },
      { key: 'writing', title: 'Schreib-Reminder', subject: 'Schreiben', tags: ['schreiben'] },
    ]
    return mapping
      .map((entry, index) => {
        const rawContent = legacy[entry.key]
        const content = typeof rawContent === 'string' ? rawContent.trim() : ''
        if (!content) return null
        return {
          id: `note-legacy-${index}`,
          title: entry.title,
          content,
          subject: entry.subject,
          tags: entry.tags,
          priority: 'medium',
          linkedDocumentId: '',
          linkedTodoId: '',
          inputType: 'text',
          createdAt: now,
          updatedAt: now,
        } as ThesisNote
      })
      .filter((note): note is ThesisNote => Boolean(note))
  }

  return []
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
