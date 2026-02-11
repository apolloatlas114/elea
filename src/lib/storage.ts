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

export type StudyMCQ = {
  question: string
  options: string[]
  correct: number
  explanation?: string
}

export type StudyQuiz = {
  easy: StudyMCQ[]
  medium: StudyMCQ[]
  hard: StudyMCQ[]
}

export type StudyQuizAttempt = {
  id: string
  materialId: string
  level: 'easy' | 'medium' | 'hard'
  total: number
  correct: number
  percent: number
  grade: number
  startedAt: string
  finishedAt: string
  secondsSpent: number
}

export type StudyTutorSection = {
  heading: string
  bullets: string[]
  definitions: string[]
  examples: string[]
  questions: string[]
}

export type StudyTutorDoc = {
  title: string
  intro?: string
  keyTakeaways?: string[]
  sections: StudyTutorSection[]
}

export type StudyMaterial = {
  id: string
  name: string
  size: number
  pageCount: number
  uploadedAt: string
  status: 'processing' | 'ready' | 'error'
  error?: string
  tutor?: StudyTutorDoc
  quiz?: StudyQuiz
  quizHistory?: StudyQuizAttempt[]
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
  studyMaterials: 'elea_study_materials',
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
  STORAGE_KEYS.studyMaterials,
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

const parseTimestamp = (value: string | undefined) => {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export const mergeThesisNotes = (localNotes: ThesisNote[], remoteNotes: ThesisNote[]) => {
  // Keep user-created notes safe if the remote source is empty/stale.
  // Prefer the newest `updatedAt` per note id.
  const map = new Map<string, ThesisNote>()
  localNotes.forEach((note) => map.set(note.id, note))

  remoteNotes.forEach((note) => {
    const existing = map.get(note.id)
    if (!existing) {
      map.set(note.id, note)
      return
    }
    const existingTs = parseTimestamp(existing.updatedAt || existing.createdAt)
    const incomingTs = parseTimestamp(note.updatedAt || note.createdAt)
    if (incomingTs >= existingTs) {
      map.set(note.id, note)
    }
  })

  return Array.from(map.values()).sort((a, b) => {
    const aTs = parseTimestamp(a.updatedAt || a.createdAt)
    const bTs = parseTimestamp(b.updatedAt || b.createdAt)
    return bTs - aTs
  })
}

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []

const normalizeMcqArray = (value: unknown): StudyMCQ[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((raw): StudyMCQ | null => {
      const row = raw as Record<string, unknown>
      const question = typeof row?.question === 'string' ? row.question.trim() : ''
      const options = normalizeStringArray(row?.options).slice(0, 6)
      const correct = typeof row?.correct === 'number' ? row.correct : Number(row?.correct)
      const explanation = typeof row?.explanation === 'string' ? row.explanation.trim() : ''
      if (!question || options.length < 2) return null
      const fallbackIndex = 0
      const rawIndex = Number.isFinite(correct) ? Math.trunc(correct) : fallbackIndex
      const correctIndex = Math.min(Math.max(rawIndex, 0), Math.max(options.length - 1, 0))
      const base: StudyMCQ = { question, options, correct: correctIndex }
      if (explanation) base.explanation = explanation
      return base
    })
    .filter((item): item is StudyMCQ => item !== null)
}

const normalizeQuizHistoryArray = (value: unknown, materialId: string, now: string): StudyQuizAttempt[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((raw, index): StudyQuizAttempt | null => {
      const row = raw as Record<string, unknown>
      const id =
        typeof row?.id === 'string' && row.id.trim().length > 0 ? row.id.trim() : `attempt-${Date.now()}-${index}`
      const level = row?.level === 'easy' || row?.level === 'medium' || row?.level === 'hard' ? row.level : 'medium'
      const total = typeof row?.total === 'number' ? row.total : Number(row?.total ?? 0)
      const correct = typeof row?.correct === 'number' ? row.correct : Number(row?.correct ?? 0)
      const percent = typeof row?.percent === 'number' ? row.percent : Number(row?.percent ?? 0)
      const grade = typeof row?.grade === 'number' ? row.grade : Number(row?.grade ?? 0)
      const startedAt = typeof row?.startedAt === 'string' && row.startedAt ? row.startedAt : now
      const finishedAt = typeof row?.finishedAt === 'string' && row.finishedAt ? row.finishedAt : startedAt
      const secondsSpent = typeof row?.secondsSpent === 'number' ? row.secondsSpent : Number(row?.secondsSpent ?? 0)

      if (!Number.isFinite(total) || total <= 0) return null
      if (!Number.isFinite(correct) || correct < 0) return null
      if (!Number.isFinite(grade) || grade <= 0) return null

      const safeCorrect = Math.min(Math.max(Math.trunc(correct), 0), Math.trunc(total))
      const safePercent =
        Number.isFinite(percent) && percent > 0 ? Math.min(Math.max(percent, 0), 100) : (safeCorrect / total) * 100

      return {
        id,
        materialId,
        level,
        total: Math.trunc(total),
        correct: safeCorrect,
        percent: Number(safePercent.toFixed(1)),
        grade: Number(grade.toFixed(1)),
        startedAt,
        finishedAt,
        secondsSpent: Number.isFinite(secondsSpent) ? Math.max(Math.trunc(secondsSpent), 0) : 0,
      }
    })
    .filter((item): item is StudyQuizAttempt => item !== null)
    .sort((a, b) => parseTimestamp(b.finishedAt) - parseTimestamp(a.finishedAt))
}

export const normalizeStudyMaterials = (value: unknown): StudyMaterial[] => {
  const now = new Date().toISOString()
  if (!Array.isArray(value)) return []

  return value
    .map((item, index): StudyMaterial | null => {
      const raw = item as Record<string, unknown>
      const id =
        typeof raw?.id === 'string' && raw.id.trim().length > 0 ? raw.id : `study-${Date.now()}-${index}`
      const name = typeof raw?.name === 'string' ? raw.name.trim() : ''
      const size = typeof raw?.size === 'number' ? raw.size : Number(raw?.size ?? 0)
      const pageCount = typeof raw?.pageCount === 'number' ? raw.pageCount : Number(raw?.pageCount ?? 0)
      const uploadedAt = typeof raw?.uploadedAt === 'string' && raw.uploadedAt ? raw.uploadedAt : now
      const createdAt = typeof raw?.createdAt === 'string' && raw.createdAt ? raw.createdAt : uploadedAt
      const updatedAt = typeof raw?.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : createdAt
      const status = raw?.status === 'ready' || raw?.status === 'processing' || raw?.status === 'error' ? raw.status : 'ready'
      const error = typeof raw?.error === 'string' ? raw.error : undefined

      const tutorRaw = raw?.tutor as Record<string, unknown> | undefined
      const tutor =
        tutorRaw && typeof tutorRaw === 'object'
          ? ({
              title: typeof tutorRaw.title === 'string' ? tutorRaw.title : name || 'Lern-Dokument',
              intro: typeof tutorRaw.intro === 'string' ? tutorRaw.intro : undefined,
              keyTakeaways: normalizeStringArray(tutorRaw.keyTakeaways),
              sections: Array.isArray(tutorRaw.sections)
                ? tutorRaw.sections
                    .map((s) => {
                      const sec = s as Record<string, unknown>
                      const heading = typeof sec?.heading === 'string' ? sec.heading.trim() : ''
                      if (!heading) return null
                      return {
                        heading,
                        bullets: normalizeStringArray(sec?.bullets),
                        definitions: normalizeStringArray(sec?.definitions),
                        examples: normalizeStringArray(sec?.examples),
                        questions: normalizeStringArray(sec?.questions),
                      } satisfies StudyTutorSection
                    })
                    .filter((s): s is StudyTutorSection => Boolean(s))
                : [],
            } satisfies StudyTutorDoc)
          : undefined

      const quizRaw = raw?.quiz as Record<string, unknown> | undefined
      const quiz =
        quizRaw && typeof quizRaw === 'object'
          ? ({
              easy: normalizeMcqArray(quizRaw.easy),
              medium: normalizeMcqArray(quizRaw.medium),
              hard: normalizeMcqArray(quizRaw.hard),
            } satisfies StudyQuiz)
          : undefined

      const quizHistory = normalizeQuizHistoryArray(raw?.quizHistory, id, now)

      if (!name) return null
      const result: StudyMaterial = {
        id,
        name,
        size: Number.isFinite(size) ? size : 0,
        pageCount: Number.isFinite(pageCount) ? pageCount : 0,
        uploadedAt,
        status,
        ...(error ? { error } : {}),
        tutor,
        quiz,
        ...(quizHistory.length > 0 ? { quizHistory } : {}),
        createdAt,
        updatedAt,
      }
      return result
    })
    .filter((item): item is StudyMaterial => item !== null && item.status !== 'error')
    .sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt))
}

export const mergeStudyMaterials = (localItems: StudyMaterial[], remoteItems: StudyMaterial[]) => {
  const map = new Map<string, StudyMaterial>()
  localItems.forEach((item) => map.set(item.id, item))
  remoteItems.forEach((item) => {
    const existing = map.get(item.id)
    if (!existing) {
      map.set(item.id, item)
      return
    }
    const existingTs = parseTimestamp(existing.updatedAt || existing.createdAt)
    const incomingTs = parseTimestamp(item.updatedAt || item.createdAt)
    if (incomingTs >= existingTs) {
      map.set(item.id, item)
    }
  })
  return Array.from(map.values()).sort((a, b) => parseTimestamp(b.updatedAt || b.createdAt) - parseTimestamp(a.updatedAt || a.createdAt))
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
