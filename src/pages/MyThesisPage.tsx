import {
  Activity,
  BarChart3,
  CalendarDays,
  CircleAlert,
  FileText,
  Filter,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  NotepadText,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  ListTodo,
  Mic,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMicrophoneErrorMessage, startMicrophoneCapture, type MicrophoneCaptureSession } from '../lib/audioCapture'
import { useStoredProfile } from '../hooks/useStoredProfile'
import { useStress } from '../hooks/useStress'
import {
  loadAssessment,
  loadPlan,
  loadThesisNotes,
  loadThesisChecklist,
  loadThesisDocuments,
  loadTodos,
  loadStudyMaterials,
  replaceThesisNotes,
  replaceThesisChecklist,
  replaceThesisDocuments,
  replaceTodos,
  replaceStudyMaterials,
} from '../lib/supabaseData'
import { groqChatJsonWithFallback } from '../lib/groq'
import { extractPdfText } from '../lib/pdf'
import {
  STORAGE_KEYS,
  mergeStudyMaterials,
  mergeThesisNotes,
  normalizeStudyMaterials,
  normalizeThesisNotes,
  normalizeTodos,
  parseDeadlineDate,
  parseJson,
  todayIso,
} from '../lib/storage'
import type {
  AssessmentResult,
  Plan,
  StudyMCQ,
  StudyMaterial,
  StudyQuiz,
  StudyQuizAttempt,
  StudyTutorDoc,
  ThesisChecklistItem,
  ThesisDocument,
  ThesisNote,
  TodoItem,
} from '../lib/storage'

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / Math.pow(k, i)
  const rounded = i === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${rounded} ${sizes[i]}`
}

const formatDocDate = (value: string | number) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--'
  return parsed.toLocaleDateString()
}

const documentKey = (doc: { name: string; size: number; lastModified: number }) =>
  `${doc.name}-${doc.size}-${doc.lastModified}`

const documentLabel = (name: string) => {
  const parts = name.split('.')
  if (parts.length < 2) return 'FILE'
  return parts[parts.length - 1].toUpperCase().slice(0, 4)
}

const UNI_GRADE_STEPS = [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0, 5.0] as const

const snapUniGrade = (value: number) => {
  const candidates = UNI_GRADE_STEPS as unknown as number[]
  if (!Number.isFinite(value)) return 5.0
  return candidates.reduce((best, grade) => (Math.abs(grade - value) < Math.abs(best - value) ? grade : best), candidates[0])
}

const gradeFromPercent = (percent: number) => {
  const value = Number.isFinite(percent) ? percent : 0
  if (value >= 95) return 1.0
  if (value >= 90) return 1.3
  if (value >= 85) return 1.7
  if (value >= 80) return 2.0
  if (value >= 75) return 2.3
  if (value >= 70) return 2.7
  if (value >= 65) return 3.0
  if (value >= 60) return 3.3
  if (value >= 55) return 3.7
  if (value >= 50) return 4.0
  return 5.0
}

const formatUniGrade = (grade: number) => snapUniGrade(grade).toFixed(1).replace('.', ',')

const checklistBase: ThesisChecklistItem[] = [
  { id: 'title-page', title: 'Titelblatt', detail: 'Cover, Author, Studiengang', done: false },
  { id: 'abstract', title: 'Abstract', detail: 'Kurzfassung mit Ziel, Methode, Ergebnis', done: false },
  { id: 'introduction', title: 'Einleitung', detail: 'Problemstellung und Forschungsfrage', done: false },
  { id: 'method', title: 'Methodik', detail: 'Design, Stichprobe, Instrumente', done: false },
  { id: 'results', title: 'Ergebnisse', detail: 'Auswertung, Tabellen, Visuals', done: false },
  { id: 'discussion', title: 'Diskussion', detail: 'Interpretation, Limitationen, Ausblick', done: false },
  { id: 'references', title: 'Zitationen', detail: 'Saubere und einheitliche Quellen', done: false },
  { id: 'appendix', title: 'Anhang', detail: 'Zusatzmaterial und Datensets', done: false },
]

const createChecklist = () => checklistBase.map((item) => ({ ...item }))

const mergeChecklist = (stored: ThesisChecklistItem[] | null) => {
  const base = createChecklist()
  if (!stored || stored.length === 0) return base
  const map = new Map(stored.map((item) => [item.id, item.done]))
  return base.map((item) => ({ ...item, done: map.get(item.id) ?? item.done }))
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

type DocFilter = 'all' | 'pdf' | 'doc' | 'docx'
type TodoView = 'all' | 'today' | 'week' | 'overdue'
type ThesisView = 'overview' | 'documents' | 'tasks' | 'quality' | 'study' | 'workbench'
type TodoDraft = {
  title: string
  detail: string
  date: string
  linkedDocumentId: string
}
type NoteDraft = {
  title: string
  content: string
  subject: string
  tags: string
  priority: ThesisNote['priority']
  linkedDocumentId: string
  linkedTodoId: string
}
type OverviewSearchResult = {
  id: string
  type: 'document' | 'task' | 'note'
  title: string
  meta: string
}

type ChapterPerformance = {
  chapter: string
  total: number
  correct: number
  wrong: number
  percent: number
}

const toChapterTag = (value: string | undefined, fallback: string) => {
  const clean = (value ?? '').trim()
  return clean.length > 0 ? clean : fallback
}

const sanitizeQuizRows = (rows: StudyMCQ[] | undefined, fallbackChapters: string[]): StudyMCQ[] => {
  if (!Array.isArray(rows)) return []
  const result: StudyMCQ[] = []
  rows.forEach((row, index) => {
    const question = typeof row?.question === 'string' ? row.question.trim() : ''
    const options = Array.isArray(row?.options) ? row.options.map((opt) => String(opt)).slice(0, 4) : []
    if (!question || options.length < 4) return
    const fallbackTag = fallbackChapters[index % Math.max(fallbackChapters.length, 1)] || `Kapitel ${index + 1}`
    const chapterTag = toChapterTag(typeof row?.chapterTag === 'string' ? row.chapterTag : '', fallbackTag)
    const correctRaw = Number.isFinite(row?.correct) ? Number(row.correct) : 0
    const correct = Math.max(0, Math.min(options.length - 1, Math.trunc(correctRaw)))
    const explanation = typeof row?.explanation === 'string' ? row.explanation.trim() : ''
    result.push({
      question,
      options,
      correct,
      chapterTag,
      ...(explanation ? { explanation } : {}),
    })
  })
  return result.slice(0, 5)
}

const buildTaggedQuiz = (quiz: StudyQuiz | undefined, fallbackChapters: string[]): StudyQuiz | null => {
  if (!quiz) return null
  const safeFallback = fallbackChapters.length > 0 ? fallbackChapters : ['Allgemein']
  const easy = sanitizeQuizRows(quiz.easy, safeFallback)
  const medium = sanitizeQuizRows(quiz.medium, safeFallback)
  const hard = sanitizeQuizRows(quiz.hard, safeFallback)
  const backup = medium.length > 0 ? medium : easy.length > 0 ? easy : hard
  if (backup.length === 0) return null
  return {
    easy: easy.length > 0 ? easy : backup,
    medium: medium.length > 0 ? medium : backup,
    hard: hard.length > 0 ? hard : backup,
  }
}

const MyThesisPage = () => {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<ThesisDocument[]>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.thesisDocuments), [])
  )
  const [todos, setTodos] = useState<TodoItem[]>(() =>
    normalizeTodos(parseJson(localStorage.getItem(STORAGE_KEYS.todos), []))
  )
  const [checklist, setChecklist] = useState<ThesisChecklistItem[]>(() =>
    mergeChecklist(parseJson(localStorage.getItem(STORAGE_KEYS.thesisChecklist), null))
  )
  const [plan, setPlan] = useState<Plan>(() => parseJson(localStorage.getItem(STORAGE_KEYS.plan), 'free'))
  const [assessment, setAssessment] = useState<AssessmentResult | null>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.assessment), null)
  )
  const [notes, setNotes] = useState<ThesisNote[]>(() =>
    normalizeThesisNotes(parseJson(localStorage.getItem(STORAGE_KEYS.thesisNotes), []))
  )
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>(() =>
    normalizeStudyMaterials(parseJson(localStorage.getItem(STORAGE_KEYS.studyMaterials), []))
  )
  const [docQuery, setDocQuery] = useState('')
  const [docFilter, setDocFilter] = useState<DocFilter>('all')
  const [todoView, setTodoView] = useState<TodoView>('all')
  const [activeView, setActiveView] = useState<ThesisView>('overview')
  const [todoFormOpen, setTodoFormOpen] = useState(false)
  const [todoError, setTodoError] = useState('')
  const [selectedTodo, setSelectedTodo] = useState<TodoItem | null>(null)
  const [selectedNote, setSelectedNote] = useState<ThesisNote | null>(null)
  const [noteError, setNoteError] = useState('')
  const [noteDraft, setNoteDraft] = useState<NoteDraft>({
    title: '',
    content: '',
    subject: '',
    tags: '',
    priority: 'medium',
    linkedDocumentId: '',
    linkedTodoId: '',
  })
  const [todoDraft, setTodoDraft] = useState<TodoDraft>(() => ({
    title: '',
    detail: '',
    date: todayIso(),
    linkedDocumentId: '',
  }))
  const [synced, setSynced] = useState(false)
  const noteDocUploadRef = useRef<HTMLInputElement | null>(null)
  const studyUploadRef = useRef<HTMLInputElement | null>(null)
  const noteCaptureRef = useRef<MicrophoneCaptureSession | null>(null)
  const recordingTimeoutRef = useRef<number | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [studyError, setStudyError] = useState('')
  const [studyActiveId, setStudyActiveId] = useState<string>('')
  const [studyActiveTab, setStudyActiveTab] = useState<'learn' | 'test' | 'weakness'>('learn')
  const [studyBusy, setStudyBusy] = useState(false)
  const [studyProgress, setStudyProgress] = useState<{ label: string; percent: number } | null>(null)
  const [studyQuizLevel, setStudyQuizLevel] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [studyQuizAnswers, setStudyQuizAnswers] = useState<Record<number, number>>({})
  const [studyQuizDone, setStudyQuizDone] = useState(false)
  const [studyQuizStarted, setStudyQuizStarted] = useState(false)
  const [studyQuizSecondsLeft, setStudyQuizSecondsLeft] = useState(0)
  const [studyQuizAttemptId, setStudyQuizAttemptId] = useState('')
  const [studyQuizStartedAt, setStudyQuizStartedAt] = useState('')
  const [studyQuizTotalSeconds, setStudyQuizTotalSeconds] = useState(0)
  const [studyWeaknessBusy, setStudyWeaknessBusy] = useState(false)
  const [studyWeaknessNotice, setStudyWeaknessNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [overviewSearchQuery, setOverviewSearchQuery] = useState('')

  const { user } = useAuth()
  const profile = useStoredProfile()
  const stress = useStress(user?.id)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.todos, JSON.stringify(todos))
    if (!synced || !user) return
    replaceTodos(user.id, todos).catch((error) => {
      console.error('Todos speichern fehlgeschlagen', error)
    })
  }, [todos, synced, user])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.thesisDocuments, JSON.stringify(documents))
    if (!synced || !user) return
    replaceThesisDocuments(user.id, documents).catch((error) => {
      console.error('Dokumente speichern fehlgeschlagen', error)
    })
  }, [documents, synced, user])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.thesisChecklist, JSON.stringify(checklist))
    if (!synced || !user) return
    replaceThesisChecklist(user.id, checklist).catch((error) => {
      console.error('Checklist speichern fehlgeschlagen', error)
    })
  }, [checklist, synced, user])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.thesisNotes, JSON.stringify(notes))
    if (!synced || !user) return
    replaceThesisNotes(user.id, notes).catch((error) => {
      console.error('Notizen speichern fehlgeschlagen', error)
    })
  }, [notes, synced, user])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.studyMaterials, JSON.stringify(studyMaterials))
    if (!synced || !user) return
    replaceStudyMaterials(user.id, studyMaterials).catch((error) => {
      console.error('Study-Materialien speichern fehlgeschlagen', error)
    })
  }, [studyMaterials, synced, user])

  useEffect(() => {
    let active = true
    if (!user) {
      setSynced(true)
      return () => {}
    }

    Promise.all([
      loadTodos(user.id),
      loadThesisDocuments(user.id),
      loadThesisChecklist(user.id),
      loadThesisNotes(user.id),
      loadStudyMaterials(user.id),
    ]).then(([remoteTodos, remoteDocs, remoteChecklist, remoteNotes, remoteStudy]) => {
        if (!active) return
        setTodos(normalizeTodos(remoteTodos))
        setDocuments(remoteDocs)
        setChecklist(mergeChecklist(remoteChecklist))
        // Don't wipe locally saved notes if remote isn't ready/empty yet.
        const normalizedRemote = normalizeThesisNotes(remoteNotes)
        setNotes((prev) => mergeThesisNotes(prev, normalizedRemote))
        const normalizedStudy = normalizeStudyMaterials(remoteStudy)
        setStudyMaterials((prev) => mergeStudyMaterials(prev, normalizedStudy))
        setSynced(true)
      }
    )

    return () => {
      active = false
    }
  }, [user?.id])

  useEffect(() => {
    let active = true
    if (!user) return () => {}

    loadPlan(user.id).then((remote) => {
      if (!active || !remote) return
      setPlan(remote)
      localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(remote))
    })

    loadAssessment(user.id).then((remote) => {
      if (!active || !remote) return
      setAssessment(remote)
      localStorage.setItem(STORAGE_KEYS.assessment, JSON.stringify(remote))
    })

    return () => {
      active = false
    }
  }, [user?.id])

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) {
        window.clearTimeout(recordingTimeoutRef.current)
      }
      if (noteCaptureRef.current) {
        void noteCaptureRef.current.cancel()
        noteCaptureRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!user || !synced) return () => {}
    const timer = window.setInterval(() => {
      loadThesisNotes(user.id).then((remoteNotes) => {
        if (!remoteNotes) return
        const normalized = normalizeThesisNotes(remoteNotes)
        setNotes((prev) => {
          const merged = mergeThesisNotes(prev, normalized)
          const prevSig = JSON.stringify(prev.map((note) => [note.id, note.updatedAt]))
          const nextSig = JSON.stringify(merged.map((note) => [note.id, note.updatedAt]))
          return prevSig === nextSig ? prev : merged
        })
      })
    }, 12000)
    return () => window.clearInterval(timer)
  }, [user?.id, synced])

  const today = todayIso()
  const weekEnd = useMemo(() => {
    const date = new Date(today)
    date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 10)
  }, [today])

  const checklistDone = checklist.filter((item) => item.done).length
  const checklistRate = checklist.length === 0 ? 0 : Math.round((checklistDone / checklist.length) * 100)
  const overdueTodos = todos.filter((todo) => todo.date && todo.date < today).length
  const todosToday = todos.filter((todo) => todo.date === today).length
  const todosWeek = todos.filter((todo) => todo.date >= today && todo.date <= weekEnd).length
  const completedTodos = todos.filter((todo) => Boolean(todo.done)).length
  const openTodos = Math.max(todos.length - completedTodos, 0)
  const qualityLocked = plan === 'free'
  const eleaReviewedDocs = qualityLocked ? 0 : documents.length
  const eleaPendingDocs = Math.max(documents.length - eleaReviewedDocs, 0)

  const notesTotalCount = notes.length
  const notesHighPriority = notes.filter((note) => note.priority === 'high').length
  const notesWithLinks = notes.filter((note) => note.linkedDocumentId || note.linkedTodoId).length
  const studyTotalCount = studyMaterials.length
  const studyReadyCount = studyMaterials.filter((item) => item.status === 'ready').length
  const studyQuizAttempts = useMemo(() => studyMaterials.flatMap((material) => material.quizHistory ?? []), [studyMaterials])
  const studyQuizPassedCount = useMemo(
    () => studyQuizAttempts.filter((attempt) => Number.isFinite(attempt.grade) && attempt.grade <= 4.0).length,
    [studyQuizAttempts]
  )
  const studyQuizFailedCount = Math.max(studyQuizAttempts.length - studyQuizPassedCount, 0)
  const studyQuizAverageGrade = useMemo(() => {
    if (studyQuizAttempts.length === 0) return null
    const avg =
      studyQuizAttempts.reduce((sum, attempt) => sum + (Number.isFinite(attempt.grade) ? attempt.grade : 5.0), 0) /
      studyQuizAttempts.length
    return snapUniGrade(avg)
  }, [studyQuizAttempts])
  const answeredQuizQuestionsCount = useMemo(
    () =>
      studyQuizAttempts.reduce((sum, attempt) => {
        if (Array.isArray(attempt.questionResults) && attempt.questionResults.length > 0) {
          return sum + attempt.questionResults.filter((row) => row.picked >= 0).length
        }
        return sum + Math.max(0, Math.trunc(attempt.total))
      }, 0),
    [studyQuizAttempts]
  )
  const chapterPerformance = useMemo<ChapterPerformance[]>(() => {
    const map = new Map<string, { total: number; correct: number; wrong: number }>()
    studyQuizAttempts.forEach((attempt) => {
      ;(attempt.questionResults ?? []).forEach((row) => {
        if (row.picked < 0) return
        const chapter = toChapterTag(row.chapterTag, 'Allgemein')
        const current = map.get(chapter) ?? { total: 0, correct: 0, wrong: 0 }
        current.total += 1
        if (row.isCorrect) current.correct += 1
        else current.wrong += 1
        map.set(chapter, current)
      })
    })

    return Array.from(map.entries())
      .map(([chapter, values]) => ({
        chapter,
        total: values.total,
        correct: values.correct,
        wrong: values.wrong,
        percent: values.total > 0 ? Math.round((values.correct / values.total) * 100) : 0,
      }))
      .sort((a, b) => {
        if (a.percent !== b.percent) return a.percent - b.percent
        return b.total - a.total
      })
  }, [studyQuizAttempts])
  const weakChapterPerformance = useMemo(
    () => chapterPerformance.filter((item) => item.total > 0 && item.percent < 60),
    [chapterPerformance]
  )
  const activeStudyMaterial = useMemo(
    () => studyMaterials.find((material) => material.id === studyActiveId) ?? null,
    [studyMaterials, studyActiveId]
  )

  const deadlineDaysLeft = useMemo(() => {
    const parsed = parseDeadlineDate(profile?.abgabedatum ?? null)
    if (!parsed) return null
    const diff = parsed.getTime() - Date.now()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }, [profile?.abgabedatum])

  const focusState = useMemo(() => {
    if (stress.value >= 70) return 'hoch'
    if (stress.value >= 45) return 'mittel'
    return 'stabil'
  }, [stress.value])

  const progressValue = useMemo(() => {
    const statusValue = Number(profile?.status ?? '0')
    const uploadsImpact = Math.min(documents.length * 4, 18)
    const checklistImpact = Math.round(checklistRate * 0.34)
    const todoImpact = Math.min(todosWeek * 3, 16)
    const planImpact = plan === 'pro' ? 13 : plan === 'basic' ? 8 : plan === 'study' ? 5 : 0
    const stressPenalty = Math.round(Math.max(stress.value - 58, 0) * 0.24)

    return clamp(statusValue + uploadsImpact + checklistImpact + todoImpact + planImpact - stressPenalty, 6, 100)
  }, [profile?.status, documents.length, checklistRate, todosWeek, plan, stress.value])

  const eleaScorePercent = useMemo(() => {
    const statusValue = Number(profile?.status ?? '0')
    const base = 42 + statusValue * 0.34 + checklistRate * 0.26 + Math.min(documents.length * 2.6, 15)
    const stressImpact = Math.max(stress.value - 55, 0) * 0.19
    const planBoost = plan === 'pro' ? 8 : plan === 'basic' ? 4 : plan === 'study' ? 2 : 0
    return clamp(Math.round(base + planBoost - stressImpact), 18, 97)
  }, [profile?.status, checklistRate, documents.length, stress.value, plan])

  const eleaScoreValue = (eleaScorePercent / 10).toFixed(1)

  const rubricScores = useMemo(() => {
    const base = eleaScorePercent / 10
    return [
      { label: 'Struktur', value: clamp(Number((base + 0.2).toFixed(1)), 1, 10) },
      { label: 'Inhalt', value: clamp(Number((base - 0.1).toFixed(1)), 1, 10) },
      { label: 'Methodik', value: clamp(Number((base - 0.4).toFixed(1)), 1, 10) },
      { label: 'Zitation', value: clamp(Number((base + 0.1).toFixed(1)), 1, 10) },
      { label: 'Sprache', value: clamp(Number((base + 0.3).toFixed(1)), 1, 10) },
      { label: 'Originalität', value: clamp(Number((base - 0.2).toFixed(1)), 1, 10) },
    ]
  }, [eleaScorePercent])

  const sparklineValues = useMemo(() => {
    const fallbackValues = [
      clamp(progressValue - 14, 20, 95),
      clamp(progressValue - 10, 20, 95),
      clamp(progressValue - 7, 20, 95),
      clamp(progressValue - 4, 20, 95),
      clamp(progressValue - 1, 20, 95),
      clamp(progressValue + 1, 20, 95),
      clamp(progressValue + 3, 20, 95),
    ]
    const logValues = stress.log.slice(-7).map((entry) => clamp(100 - entry.value, 10, 95))
    if (logValues.length === 0) return fallbackValues
    if (logValues.length >= 7) return logValues
    return [...fallbackValues.slice(0, 7 - logValues.length), ...logValues]
  }, [stress.log, progressValue])

  const sparklinePath = useMemo(() => {
    const width = 320
    const height = 102
    const padding = 8
    const values = sparklineValues
    if (values.length <= 1) return `M ${padding} ${height / 2} L ${width - padding} ${height / 2}`

    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = Math.max(max - min, 1)

    return values
      .map((value, index) => {
        const x = padding + (index / (values.length - 1)) * (width - padding * 2)
        const y = height - padding - ((value - min) / range) * (height - padding * 2)
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }, [sparklineValues])

  const docTypeStats = useMemo(() => {
    const stats = { pdf: 0, docx: 0, doc: 0, other: 0 }

    documents.forEach((doc) => {
      const extension = doc.name.split('.').pop()?.toLowerCase() ?? ''
      if (extension === 'pdf') stats.pdf += 1
      else if (extension === 'docx') stats.docx += 1
      else if (extension === 'doc') stats.doc += 1
      else stats.other += 1
    })

    const total = Math.max(1, documents.length)
    return [
      { label: 'PDF', value: stats.pdf, percent: Math.round((stats.pdf / total) * 100) },
      { label: 'DOCX', value: stats.docx, percent: Math.round((stats.docx / total) * 100) },
      { label: 'DOC', value: stats.doc, percent: Math.round((stats.doc / total) * 100) },
      { label: 'Andere', value: stats.other, percent: Math.round((stats.other / total) * 100) },
    ]
  }, [documents])

  const filteredDocuments = useMemo(() => {
    const query = docQuery.trim().toLowerCase()

    return documents.filter((doc) => {
      const extension = doc.name.split('.').pop()?.toLowerCase() ?? ''
      const typePass =
        docFilter === 'all' ||
        (docFilter === 'pdf' && extension === 'pdf') ||
        (docFilter === 'doc' && extension === 'doc') ||
        (docFilter === 'docx' && extension === 'docx')

      if (!typePass) return false
      if (!query) return true
      return doc.name.toLowerCase().includes(query)
    })
  }, [documents, docFilter, docQuery])

  const filteredTodos = useMemo(() => {
    if (todoView === 'all') return todos
    if (todoView === 'today') return todos.filter((todo) => todo.date === today)
    if (todoView === 'week') return todos.filter((todo) => todo.date >= today && todo.date <= weekEnd)
    return todos.filter((todo) => todo.date && todo.date < today)
  }, [todos, todoView, today, weekEnd])

  const recommendations = useMemo(() => {
    const items: string[] = []

    if (!profile) {
      items.push('Profil vollständig ausfüllen, damit dein Thesis-Plan korrekt startet.')
      return items
    }

    const statusValue = Number(profile.status ?? '0')
    if (statusValue < 50) items.push('Expose + Methodikteil als nächsten Sprint priorisieren.')
    if (documents.length === 0) items.push('Erste Gliederung oder Draft hochladen für schnellere Score-Vorschau.')
    if (todosWeek < 2) items.push('Mindestens 2 konkrete Wochenaufgaben mit Datum planen.')
    if (stress.value > 60) items.push('Stress ist erhöht: 1 Coaching-Slot oder Fokusblock einplanen.')
    if (assessment?.recommendedPlan && plan === 'free' && assessment.recommendedPlan !== 'free') {
      items.push('Empfohlenen Plan prüfen, um Feedback und PhD-Review zu aktivieren.')
    }
    if (items.length === 0) items.push('Sehr gut: Fokus halten und jede Woche eine messbare Abgabe definieren.')

    return items
  }, [profile, documents.length, todosWeek, stress.value, assessment?.recommendedPlan, plan])

  const latestDocument = documents[0] ?? null
  const documentNameById = useMemo(() => {
    return new Map(documents.map((doc) => [doc.id, doc.name]))
  }, [documents])

  const appendDocuments = (files: FileList | null): ThesisDocument[] => {
    if (!files || files.length === 0) return []
    const uploadedAt = new Date().toISOString()

    const nextDocs: ThesisDocument[] = Array.from(files).map((file) => ({
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      uploadedAt,
    }))

    let addedDocs: ThesisDocument[] = []
    setDocuments((prev) => {
      const existing = new Set(prev.map((doc) => documentKey(doc)))
      const unique = nextDocs.filter((doc) => !existing.has(documentKey(doc)))
      addedDocs = unique
      return unique.length > 0 ? [...unique, ...prev] : prev
    })
    return addedDocs
  }

  const uploadNoteDocument = (files: FileList | null) => {
    const added = appendDocuments(files)
    if (added.length > 0) {
      setNoteDraft((prev) => ({ ...prev, linkedDocumentId: added[0].id }))
      setNoteError('')
    }
  }

  const removeDocument = (id: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id))
  }

  const openTodoForm = () => {
    setTodoError('')
    setTodoFormOpen(true)
    setTodoDraft((prev) => ({ ...prev, date: prev.date || today }))
  }

  const createTodo = () => {
    if (!todoDraft.title.trim()) {
      setTodoError('Bitte gib einen Titel für die Aufgabe ein.')
      return
    }
    if (!todoDraft.date) {
      setTodoError('Bitte setze eine Deadline für die Aufgabe.')
      return
    }

    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`

    setTodos((prev) => [
      {
        id,
        title: todoDraft.title.trim(),
        detail: todoDraft.detail.trim(),
        date: todoDraft.date,
        done: false,
        linkedDocumentId: todoDraft.linkedDocumentId,
      },
      ...prev,
    ])
    setTodoDraft({ title: '', detail: '', date: today, linkedDocumentId: '' })
    setTodoError('')
    setTodoFormOpen(false)
  }

  const updateTodo = (id: string, patch: Partial<TodoItem>) => {
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo)))
  }

  const removeTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id))
  }

  const resetNoteDraft = () => {
    setNoteDraft({
      title: '',
      content: '',
      subject: '',
      tags: '',
      priority: 'medium',
      linkedDocumentId: '',
      linkedTodoId: '',
    })
  }

  const createNote = (inputType: ThesisNote['inputType'] = 'text') => {
    if (!noteDraft.title.trim() || !noteDraft.content.trim()) {
      setNoteError('Bitte Titel und Notizinhalt ausfüllen.')
      return
    }
    const timestamp = new Date().toISOString()
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const tags = noteDraft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    const nextNote: ThesisNote = {
      id,
      title: noteDraft.title.trim(),
      content: noteDraft.content.trim(),
      subject: noteDraft.subject.trim(),
      tags,
      priority: noteDraft.priority,
      linkedDocumentId: noteDraft.linkedDocumentId,
      linkedTodoId: noteDraft.linkedTodoId,
      inputType,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    setNotes((prev) => [nextNote, ...prev])
    setNoteError('')
    resetNoteDraft()
  }

  const removeNote = (id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id))
  }

  const updateNotePriority = (id: string, priority: ThesisNote['priority']) => {
    setNotes((prev) =>
      prev.map((note) => (note.id === id ? { ...note, priority, updatedAt: new Date().toISOString() } : note))
    )
  }

  const ensureStudySelection = (nextId?: string) => {
    setStudyActiveId((prev) => {
      if (nextId) return nextId
      if (prev && studyMaterials.some((item) => item.id === prev)) return prev
      return studyMaterials[0]?.id ?? ''
    })
  }

  useEffect(() => {
    ensureStudySelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyMaterials.length])

  const resetStudyQuizState = () => {
    setStudyQuizAnswers({})
    setStudyQuizDone(false)
    setStudyQuizStarted(false)
    setStudyQuizSecondsLeft(0)
    setStudyQuizAttemptId('')
    setStudyQuizStartedAt('')
    setStudyQuizTotalSeconds(0)
  }

  const startStudyQuiz = () => {
    resetStudyQuizState()
    const attemptId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const totalSeconds = 6 * 60
    setStudyQuizAttemptId(attemptId)
    setStudyQuizStartedAt(new Date().toISOString())
    setStudyQuizTotalSeconds(totalSeconds)
    setStudyQuizStarted(true)
    setStudyQuizSecondsLeft(totalSeconds)
  }

  useEffect(() => {
    if (!studyQuizStarted || studyQuizDone) return () => {}
    if (studyQuizSecondsLeft <= 0) {
      setStudyQuizDone(true)
      setStudyQuizStarted(false)
      return () => {}
    }
    const timer = window.setInterval(() => {
      setStudyQuizSecondsLeft((prev) => Math.max(prev - 1, 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [studyQuizStarted, studyQuizDone, studyQuizSecondsLeft])

  useEffect(() => {
    if (!studyQuizDone) return
    if (!studyQuizAttemptId) return

    const material = activeStudyMaterial
    if (!material?.quiz) {
      setStudyQuizAttemptId('')
      return
    }

    const finishedAt = new Date().toISOString()
    const questions = material.quiz?.[studyQuizLevel] ?? []
    const questionResults = questions.map((q, idx) => {
      const pickedRaw = studyQuizAnswers[idx]
      const picked = typeof pickedRaw === 'number' ? pickedRaw : -1
      const chapterTag = toChapterTag(q.chapterTag, `Kapitel ${idx + 1}`)
      return {
        question: q.question,
        chapterTag,
        level: studyQuizLevel,
        picked,
        correct: q.correct,
        isCorrect: picked >= 0 && picked === q.correct,
      }
    })
    const answeredCount = questionResults.filter((row) => row.picked >= 0).length
    const total = questions.length
    const correct = questionResults.filter((row) => row.isCorrect).length
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0
    const grade = gradeFromPercent(percent)
    const secondsSpent = studyQuizTotalSeconds > 0 ? Math.max(0, studyQuizTotalSeconds - studyQuizSecondsLeft) : 0

    const attempt: StudyQuizAttempt = {
      id: studyQuizAttemptId,
      materialId: material.id,
      level: studyQuizLevel,
      total,
      correct,
      percent,
      grade,
      startedAt: studyQuizStartedAt || finishedAt,
      finishedAt,
      secondsSpent,
      questionResults: questionResults.slice(0, answeredCount > 0 ? questionResults.length : 0),
    }

    setStudyMaterials((prev) =>
      prev.map((item) => {
        if (item.id !== material.id) return item
        const nextHistory = [attempt, ...(item.quizHistory ?? []).filter((h) => h.id !== attempt.id)].slice(0, 60)
        return { ...item, quizHistory: nextHistory, updatedAt: finishedAt }
      })
    )

    setStudyQuizAttemptId('')
  }, [
    studyQuizDone,
    studyQuizAttemptId,
    studyQuizLevel,
    studyQuizAnswers,
    studyQuizSecondsLeft,
    studyQuizTotalSeconds,
    studyQuizStartedAt,
    activeStudyMaterial,
  ])

  const chunkText = (text: string, maxChars: number) => {
    const cleaned = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    if (cleaned.length <= maxChars) return [cleaned]
    const chunks: string[] = []
    for (let i = 0; i < cleaned.length; i += maxChars) {
      chunks.push(cleaned.slice(i, i + maxChars))
    }
    return chunks
  }

  const analyzePdfToStudyMaterial = async (file: File) => {
    const maxBytes = 20 * 1024 * 1024
    if (!file || !(file instanceof File)) {
      setStudyError('Bitte ein PDF auswählen.')
      return
    }
    if (!/pdf/i.test(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      setStudyError('Nur PDF-Dateien sind erlaubt.')
      return
    }
    if (file.size > maxBytes) {
      setStudyError('Maximal 20 MB pro PDF.')
      return
    }

    const groqKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined
    const preferredModel = (import.meta.env.VITE_GROQ_CHAT_MODEL as string | undefined) || 'llama-3.3-70b-versatile'
    const fallbackModels = [
      preferredModel,
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
    ]
    if (!groqKey) {
      setStudyError('VITE_GROQ_API_KEY fehlt in .env.local.')
      return
    }

    const timestamp = new Date().toISOString()
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `study-${Date.now()}-${Math.random().toString(16).slice(2)}`

    setStudyBusy(true)
    setStudyError('')
    setStudyProgress({ label: 'PDF wird gelesen...', percent: 8 })

    // Insert placeholder immediately so the user sees it in the list.
    const baseItem: StudyMaterial = {
      id,
      name: file.name,
      size: file.size,
      pageCount: 0,
      uploadedAt: timestamp,
      status: 'processing',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    setStudyMaterials((prev) => [baseItem, ...prev])
    setStudyActiveId(id)
    setStudyActiveTab('learn')
    resetStudyQuizState()

    try {
      const { pageCount, text } = await extractPdfText(file)
      if (pageCount > 50) {
        throw new Error('Maximal 50 Seiten pro PDF.')
      }
      setStudyProgress({ label: 'Text wird vorbereitet...', percent: 16 })

      const chunks = chunkText(text, 12000)
      const maxChunks = 5
      const selectedChunks =
        chunks.length <= maxChunks
          ? chunks
          : Array.from({ length: maxChunks }).map((_, index) => {
              const pick = Math.floor((index / maxChunks) * chunks.length)
              return chunks[Math.min(Math.max(pick, 0), chunks.length - 1)]
            })

      type ChunkOutline = {
        keyPoints: string[]
        definitions: string[]
        examples: string[]
        questions: string[]
      }

      const combined: ChunkOutline = { keyPoints: [], definitions: [], examples: [], questions: [] }

      for (let i = 0; i < selectedChunks.length; i += 1) {
        setStudyProgress({
          label: `Groq analysiert Abschnitt ${i + 1}/${selectedChunks.length}...`,
          percent: 18 + Math.round(((i + 0.2) / selectedChunks.length) * 34),
        })

        const outlineSystem =
          'Du bist ein Tutor. Antworte ausschließlich mit gültigem JSON. Keine Markdown-Fences.'
        const outlineUser = `Extrahiere aus diesem Vorlesungstext die wichtigsten Inhalte.\n\nGib JSON im Format:\n{\n  \"keyPoints\": string[],\n  \"definitions\": string[],\n  \"examples\": string[],\n  \"questions\": string[]\n}\n\nText:\n${selectedChunks[i]}`

        const { parsed } = await groqChatJsonWithFallback<ChunkOutline>({
          apiKey: groqKey,
          models: fallbackModels,
          system: outlineSystem,
          user: outlineUser,
          temperature: 0.1,
          maxTokens: 1200,
        })

        if (parsed) {
          combined.keyPoints.push(...(parsed.keyPoints ?? []))
          combined.definitions.push(...(parsed.definitions ?? []))
          combined.examples.push(...(parsed.examples ?? []))
          combined.questions.push(...(parsed.questions ?? []))
        }
      }

      const dedupe = (items: string[]) =>
        Array.from(new Set(items.map((i) => i.trim()).filter(Boolean))).slice(0, 120)

      const outlinePayload = {
        keyPoints: dedupe(combined.keyPoints),
        definitions: dedupe(combined.definitions),
        examples: dedupe(combined.examples),
        questions: dedupe(combined.questions),
      }

      setStudyProgress({ label: 'Lern-Dokument wird erstellt...', percent: 62 })

      const tutorSystem =
        'Du bist ein Tutor für Studierende (1-5 Semester). Antworte ausschließlich mit gültigem JSON. Keine Markdown-Fences.'
      const tutorUser = `Erstelle aus diesen Stichpunkten ein Tutor-Skript.\n\nJSON-Format:\n{\n  \"title\": string,\n  \"intro\": string,\n  \"keyTakeaways\": string[],\n  \"sections\": [\n    {\n      \"heading\": string,\n      \"bullets\": string[],\n      \"definitions\": string[],\n      \"examples\": string[],\n      \"questions\": string[]\n    }\n  ]\n}\n\nInhalt:\n${JSON.stringify(outlinePayload)}\n\nWichtig:\n- klare, schrittweise Erklaerung\n- kurze Beispiele\n- Lernfragen pro Abschnitt (3-5)\n`

      const tutorResult = await groqChatJsonWithFallback<StudyTutorDoc>({
        apiKey: groqKey,
        models: fallbackModels,
        system: tutorSystem,
        user: tutorUser,
        temperature: 0.2,
        maxTokens: 2600,
      })

      setStudyProgress({ label: 'Quiz wird generiert...', percent: 80 })

      const quizSystem =
        'Du bist ein Tutor. Antworte ausschließlich mit gültigem JSON. Keine Markdown-Fences.'
      const quizUser = `Erstelle 3 Sets a 5 Multiple-Choice-Fragen (easy, medium, hard).\n\nJSON-Format:\n{\n  \"easy\": [{\"question\": string, \"options\": string[], \"correct\": number, \"explanation\": string, \"chapterTag\": string}],\n  \"medium\": [...],\n  \"hard\": [...]\n}\n\nRegeln:\n- genau 4 Optionen pro Frage\n- genau 1 korrekt\n- jede Frage braucht ein chapterTag\n- gute Distraktoren aus dem Stoff\n- erklaere kurz warum richtig\n\nStoff:\n${JSON.stringify(outlinePayload)}\n`

      const quizResult = await groqChatJsonWithFallback<StudyQuiz>({
        apiKey: groqKey,
        models: fallbackModels,
        system: quizSystem,
        user: quizUser,
        temperature: 0.25,
        maxTokens: 2200,
      })

      const chapterFallbacks = (tutorResult.parsed?.sections ?? []).map((section) => section.heading).filter(Boolean)
      const taggedQuiz = buildTaggedQuiz(quizResult.parsed ?? undefined, chapterFallbacks)
      const isReady = Boolean(tutorResult.parsed && taggedQuiz)
      if (!isReady) {
        const message = 'Analyse unvollständig. Bitte erneut versuchen oder ein kleineres PDF nutzen.'
        // Requested: remove errored materials immediately (no "Fehler" entries in the list).
        setStudyMaterials((prev) => prev.filter((item) => item.id !== id))
        setStudyError(`${file.name}: ${message}`)
        setStudyProgress(null)
        return
      }

      const next: StudyMaterial = {
        ...baseItem,
        pageCount,
        status: 'ready',
        tutor: tutorResult.parsed ?? undefined,
        quiz: taggedQuiz ?? undefined,
        updatedAt: new Date().toISOString(),
      }

      setStudyMaterials((prev) => prev.map((item) => (item.id === id ? next : item)))
      setStudyProgress({ label: 'Fertig', percent: 100 })
      window.setTimeout(() => setStudyProgress(null), 900)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analyse fehlgeschlagen.'
      // Requested: remove errored materials immediately (no "Fehler" entries in the list).
      setStudyMaterials((prev) => prev.filter((item) => item.id !== id))
      setStudyError(`${file.name}: ${message}`)
      setStudyProgress(null)
    } finally {
      setStudyBusy(false)
    }
  }

  const chapterRecommendation = (chapter: string) => {
    const value = chapter.toLowerCase()
    if (value.includes('method')) return 'Arbeite mit einer Schrittfolge aus Ziel, Design, Stichprobe und Auswertung.'
    if (value.includes('diskussion')) return 'Formuliere zuerst Ergebnis -> Bedeutung -> Limitation in drei kurzen Sätzen.'
    if (value.includes('einleitung')) return 'Prüfe Problemstellung, Relevanz und Forschungsfrage in genau dieser Reihenfolge.'
    if (value.includes('statistik') || value.includes('analyse')) return 'Wiederhole die Kernformeln und rechne zwei kurze Beispielaufgaben.'
    if (value.includes('zit') || value.includes('quelle')) return 'Baue einen festen Quellen-Check vor dem finalen Schreiben ein.'
    return 'Gehe Kapitelabschnitt für Abschnitt durch und beantworte je Abschnitt drei Kontrollfragen.'
  }

  const createWeaknessQuiz = async () => {
    setStudyWeaknessNotice(null)
    if (answeredQuizQuestionsCount < 50) {
      setStudyWeaknessNotice({
        type: 'error',
        text: `Schwächen-Analyse wird ab 50 beantworteten Fragen freigeschaltet. Aktuell: ${answeredQuizQuestionsCount}.`,
      })
      return
    }

    if (weakChapterPerformance.length === 0) {
      setStudyWeaknessNotice({
        type: 'ok',
        text: 'Aktuell keine Kapitel unter 60%. Starkes Niveau - trainiere weiter im normalen Quizmodus.',
      })
      return
    }

    const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined
    const preferredModel = (import.meta.env.VITE_GROQ_CHAT_MODEL as string | undefined) || 'llama-3.3-70b-versatile'
    const models = [preferredModel, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']
    if (!apiKey) {
      setStudyWeaknessNotice({ type: 'error', text: 'VITE_GROQ_API_KEY fehlt in .env.local.' })
      return
    }

    const weakChapters = weakChapterPerformance.slice(0, 6).map((item) => item.chapter)
    const sourceQuestions = studyMaterials
      .flatMap((material) => {
        const levels: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard']
        return levels.flatMap((level) =>
          (material.quiz?.[level] ?? [])
            .filter((q) => weakChapters.includes(toChapterTag(q.chapterTag, 'Allgemein')))
            .map((q) => ({
              chapterTag: toChapterTag(q.chapterTag, 'Allgemein'),
              question: q.question,
              options: q.options,
              correct: q.correct,
              level,
            }))
        )
      })
      .slice(0, 48)

    const failedExamples = studyQuizAttempts
      .flatMap((attempt) => (attempt.questionResults ?? []).map((row) => ({ row, level: attempt.level })))
      .filter(({ row }) => row.picked >= 0 && !row.isCorrect && weakChapters.includes(toChapterTag(row.chapterTag, 'Allgemein')))
      .slice(0, 48)
      .map(({ row, level }) => ({
        chapterTag: toChapterTag(row.chapterTag, 'Allgemein'),
        question: row.question,
        picked: row.picked,
        correct: row.correct,
        level,
      }))

    setStudyWeaknessBusy(true)
    try {
      const weaknessBrief = weakChapterPerformance.slice(0, 6).map((item) => ({
        chapter: item.chapter,
        total: item.total,
        correct: item.correct,
        wrong: item.wrong,
        percent: item.percent,
      }))

      const { parsed } = await groqChatJsonWithFallback<StudyQuiz>({
        apiKey,
        models,
        system:
          'Du bist Lerncoach fuer Studierende. Erzeuge nur gueltiges JSON ohne Markdown. Fokus: gezielte Schwachstellen.',
        user: `Erzeuge ein neues Lernlabor-Quiz mit drei Levels (easy, medium, hard), je 5 MCQs mit 4 Optionen und genau 1 korrekter Antwort.

Jede Frage MUSS ein "chapterTag" haben und aus den Schwachstellen stammen.
JSON-Format:
{
  "easy":[{"question":"string","options":["a","b","c","d"],"correct":0,"explanation":"string","chapterTag":"string"}],
  "medium":[...],
  "hard":[...]
}

Schwaechenanalyse:
${JSON.stringify(weaknessBrief)}

Falsch beantwortete Beispiele:
${JSON.stringify(failedExamples)}

Bestehender Fragenpool:
${JSON.stringify(sourceQuestions)}

Regeln:
- keine Wiederholung identischer Fragen
- klare, kurze Sprache
- Distraktoren muessen plausibel sein
- pro Level mindestens 3 verschiedene chapterTag verwenden`,
        temperature: 0.22,
        maxTokens: 2600,
      })

      const quizSets = buildTaggedQuiz(parsed ?? undefined, weakChapters)
      if (!quizSets) {
        throw new Error('Schwaechen-Quiz konnte nicht erzeugt werden.')
      }

      const timestamp = new Date().toISOString()
      const materialId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `study-${Date.now()}-${Math.random().toString(16).slice(2)}`

      const weaknessMaterial: StudyMaterial = {
        id: materialId,
        name: `Schwaechen-Quiz ${new Date().toLocaleDateString('de-DE')}`,
        size: 0,
        pageCount: 0,
        uploadedAt: timestamp,
        status: 'ready',
        tutor: {
          title: 'Schwaechen-Analyse Training',
          intro:
            'Dieses Quiz fokussiert gezielt Kapitel unter 60% Trefferquote. Trainiere zuerst diese Punkte und wiederhole dann ein Level.',
          keyTakeaways: weakChapterPerformance.slice(0, 5).map((item) => `${item.chapter}: ${item.percent}%`),
          sections: weakChapterPerformance.slice(0, 5).map((item) => ({
            heading: item.chapter,
            bullets: [
              `Trefferquote: ${item.percent}% (${item.correct}/${item.total})`,
              `Fokus: ${item.wrong} Fehler gezielt aufarbeiten`,
            ],
            definitions: [],
            examples: [chapterRecommendation(item.chapter)],
            questions: [],
          })),
        },
        quiz: quizSets,
        quizHistory: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      setStudyMaterials((prev) => [weaknessMaterial, ...prev.filter((item) => item.id !== materialId)])
      setStudyActiveId(materialId)
      setStudyActiveTab('test')
      resetStudyQuizState()
      setStudyWeaknessNotice({
        type: 'ok',
        text: 'Neues Schwaechen-Quiz erstellt und im Lernlabor gespeichert.',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Schwaechen-Quiz konnte nicht erstellt werden.'
      setStudyWeaknessNotice({ type: 'error', text: message })
    } finally {
      setStudyWeaknessBusy(false)
    }
  }

  const transcribeNoteAudio = async (audioBlob: Blob, extension: string) => {
    const endpoint = import.meta.env.VITE_TRANSCRIBE_ENDPOINT || '/api/transcribe'
    const formData = new FormData()
    formData.append('file', audioBlob, `note-${Date.now()}.${extension}`)

    let transcript = ''

    try {
      const response = await fetch(endpoint, { method: 'POST', body: formData })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'API-Transkription fehlgeschlagen.')
      }
      transcript = typeof payload?.text === 'string' ? payload.text.trim() : ''
    } catch {
      const groqKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined
      const groqModel = (import.meta.env.VITE_GROQ_TRANSCRIPTION_MODEL as string | undefined) || 'whisper-large-v3-turbo'
      if (!groqKey) {
        throw new Error('Kein Transkript: API-Route nicht erreichbar und VITE_GROQ_API_KEY fehlt in .env.local.')
      }
      const groqForm = new FormData()
      groqForm.append('file', audioBlob, `note-${Date.now()}.${extension}`)
      groqForm.append('model', groqModel)
      groqForm.append('language', 'de')
      groqForm.append('response_format', 'json')

      const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
        body: groqForm,
      })
      const groqPayload = await groqResponse.json().catch(() => ({}))
      if (!groqResponse.ok) {
        throw new Error(
          typeof groqPayload?.error?.message === 'string'
            ? groqPayload.error.message
            : 'Groq-Transkription fehlgeschlagen.'
        )
      }
      transcript = typeof groqPayload?.text === 'string' ? groqPayload.text.trim() : ''
    }

    if (!transcript) {
      throw new Error('Keine Sprache erkannt. Bitte erneut aufnehmen.')
    }
    return transcript
  }

  const stopVoiceCapture = async () => {
    const capture = noteCaptureRef.current
    if (!capture) return
    noteCaptureRef.current = null

    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current)
      recordingTimeoutRef.current = null
    }

    setIsRecording(false)
    setIsTranscribing(true)

    try {
      const audio = await capture.stop()
      const transcript = await transcribeNoteAudio(audio.blob, audio.extension)
      setNoteDraft((prev) => ({
        ...prev,
        content: prev.content ? `${prev.content}\n${transcript}` : transcript,
      }))
      setNoteError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transkription fehlgeschlagen.'
      setNoteError(`${message} Bitte erneut versuchen oder Text direkt eingeben.`)
    } finally {
      setIsTranscribing(false)
    }
  }

  const startVoiceCapture = async () => {
    if (isTranscribing) return

    if (isRecording) {
      await stopVoiceCapture()
      return
    }

    try {
      setNoteError('Mikrofon wird gestartet...')
      const capture = await startMicrophoneCapture()
      noteCaptureRef.current = capture
      setIsRecording(true)
      setNoteError('Aufnahme laeuft... tippe erneut auf Sprach-Input zum Stoppen.')
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (!noteCaptureRef.current) return
        void stopVoiceCapture()
      }, 30000)
    } catch (error) {
      const message = getMicrophoneErrorMessage(error)
      setNoteError(message)
      setIsRecording(false)
      if (noteCaptureRef.current) {
        void noteCaptureRef.current.cancel()
        noteCaptureRef.current = null
      }
    }
  }

  const toggleChecklist = (id: string) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)))
  }

  const openOverviewSearchResult = (result: OverviewSearchResult) => {
    if (result.type === 'document') {
      setDocFilter('all')
      setDocQuery(result.title)
      setActiveView('documents')
      return
    }

    if (result.type === 'task') {
      const task = todos.find((item) => item.id === result.id)
      if (task) setSelectedTodo(task)
      setTodoView('all')
      setActiveView('tasks')
      return
    }

    const note = notes.find((item) => item.id === result.id)
    if (note) setSelectedNote(note)
    setActiveView('workbench')
  }

  const circumference = 2 * Math.PI * 46
  const dashOffset = circumference - (progressValue / 100) * circumference

  const performanceBars = useMemo(() => {
    const values = sparklineValues.slice(-7)
    const today = new Date()
    const labels = values.map((_, index) => {
      const day = new Date(today)
      day.setDate(today.getDate() - (values.length - 1 - index))
      return day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    })
    return values.map((value, index) => ({
      label: labels[index] ?? '--.--',
      value,
    }))
  }, [sparklineValues])

  const overviewSearchResults = useMemo<OverviewSearchResult[]>(() => {
    const query = overviewSearchQuery.trim().toLowerCase()
    if (!query) return []

    const documentHits = documents
      .filter((doc) => doc.name.toLowerCase().includes(query))
      .slice(0, 4)
      .map((doc) => ({
        id: doc.id,
        type: 'document' as const,
        title: doc.name,
        meta: `${formatBytes(doc.size)} · ${formatDocDate(doc.uploadedAt)}`,
      }))

    const taskHits = todos
      .filter((todo) => `${todo.title} ${todo.detail}`.toLowerCase().includes(query))
      .slice(0, 4)
      .map((todo) => ({
        id: todo.id,
        type: 'task' as const,
        title: todo.title,
        meta: `${todo.done ? 'Erledigt' : 'Offen'} · Deadline ${todo.date}`,
      }))

    const noteHits = notes
      .filter((note) =>
        `${note.title} ${note.content} ${note.subject} ${note.tags.join(' ')}`.toLowerCase().includes(query)
      )
      .slice(0, 4)
      .map((note) => ({
        id: note.id,
        type: 'note' as const,
        title: note.title,
        meta: `${note.subject || 'Allgemein'} · ${note.priority === 'high' ? 'Hoch' : note.priority === 'medium' ? 'Mittel' : 'Niedrig'}`,
      }))

    return [...documentHits, ...taskHits, ...noteHits].slice(0, 8)
  }, [overviewSearchQuery, documents, todos, notes])

  const qualityHighlights = [
    'Struktur, Inhalt, Methodik, Ergebnisse, Sprache, Zitationen, Originalität, Visuals, Ethik & mehr.',
    '80% weniger Review-Zeit durch ultraschnelle Score-Auswertung.',
    '+25-40% bessere Notenchance durch gezielte Schwächen-Analyse.',
  ]

  const viewItems: Array<{ id: ThesisView; label: string; icon: JSX.Element; meta: string }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} />, meta: `${progressValue}%` },
    { id: 'documents', label: 'Dokumente', icon: <FolderOpen size={15} />, meta: `${documents.length}` },
    { id: 'tasks', label: 'Aufgaben', icon: <ListTodo size={15} />, meta: `${openTodos}/${todos.length}` },
    {
      id: 'quality',
      label: 'Elea Score',
      icon: <ShieldCheck size={15} />,
      meta: qualityLocked ? 'Locked' : `${eleaScoreValue}/10`,
    },
    { id: 'study', label: 'Lernlabor', icon: <GraduationCap size={15} />, meta: `${studyReadyCount}/${studyTotalCount}` },
    { id: 'workbench', label: 'Notizen', icon: <NotepadText size={15} />, meta: `${notesTotalCount}` },
  ]

  return (
    <section className="page thesis-page thesis-shell">
      <aside className="page-card thesis-surface thesis-left-rail">
        <div className="thesis-rail-head">
          <h1>My Thesis</h1>
        </div>

        <nav className="thesis-rail-nav" aria-label="My Thesis Navigation">
          {viewItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`thesis-rail-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              <span className="thesis-rail-icon">{item.icon}</span>
              <span className="thesis-rail-text">{item.label}</span>
              <span className="thesis-rail-meta">{item.meta}</span>
            </button>
          ))}
        </nav>

        <div className="thesis-rail-footer">
          <div className="thesis-rail-chip">Plan: {plan.toUpperCase()}</div>
          <div className={`thesis-rail-chip ${stress.value > 60 ? 'warn' : 'ok'}`}>
            Stress {stress.value}/100
          </div>
        </div>
      </aside>

      <main className={`thesis-right-stage ${activeView === 'workbench' ? 'workbench-open' : ''}`}>

        {activeView === 'overview' && (
          <section className="thesis-stage-grid thesis-stage-grid--overview thesis-pro-grid">
            <article className="page-card thesis-surface thesis-pro-hero">
              <div className="thesis-pro-hero-head">
                <div>
                  <p className="thesis-kicker">My Thesis Control Center</p>
                  <h3>Alles Wichtige auf einen Blick</h3>
                </div>
                <button className="ghost" type="button" onClick={() => setActiveView('workbench')}>
                  Notizen öffnen
                </button>
              </div>

              <div className="thesis-pro-kpi-strip">
                <div className="thesis-pro-kpi">
                  <span>Abgabe</span>
                  <strong>
                    {deadlineDaysLeft === null ? 'Kein Datum' : deadlineDaysLeft < 0 ? `${Math.abs(deadlineDaysLeft)} Tage drüber` : `${deadlineDaysLeft} Tage`}
                  </strong>
                  <small>{profile?.abgabedatum ? `Termin: ${profile.abgabedatum}` : 'Abgabedatum im Profil setzen'}</small>
                </div>
                <div className="thesis-pro-kpi">
                  <span>Durchschnittsnote</span>
                  <strong>{studyQuizAverageGrade === null ? '--' : formatUniGrade(studyQuizAverageGrade)}</strong>
                  <small>
                    {studyQuizAttempts.length === 0 ? 'Noch keine Quiz-Ergebnisse' : `${studyQuizAttempts.length} Quiz gespeichert`}
                  </small>
                </div>
                <div className="thesis-pro-kpi">
                  <span>Fokusstatus</span>
                  <strong>
                    {stress.value}/100 ({focusState})
                  </strong>
                  <small>Zielnote: {profile?.zielnote ?? '--'}</small>
                </div>
                <div className="thesis-pro-kpi">
                  <span>Checklist-Fortschritt</span>
                  <strong>
                    {checklistDone}/{checklist.length}
                  </strong>
                  <small>{Math.max(checklist.length - checklistDone, 0)} Bausteine offen</small>
                </div>
              </div>

              <div className="thesis-pro-hero-body">
                <div className="thesis-pro-bars-card">
                  <div className="thesis-panel-head">
                    <h2>
                      <BarChart3 size={15} /> Performance
                    </h2>
                    <span>letzte 7 Tage</span>
                  </div>
                  <div className="thesis-pro-bars">
                    {performanceBars.map((item) => (
                      <div key={item.label} className="thesis-pro-bar-col">
                        <div className="thesis-pro-bar-track">
                          <i style={{ height: `${item.value}%` }} />
                        </div>
                        <strong>{item.value}</strong>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                  <svg className="thesis-sparkline" viewBox="0 0 320 102" role="img" aria-label="Produktivitätsverlauf">
                    <path className="thesis-sparkline-axis" d="M 8 12 L 8 94 L 312 94" />
                    <path className="thesis-sparkline-path" d={sparklinePath} />
                  </svg>
                </div>

                <div className="thesis-pro-mix-card thesis-pro-search-card">
                  <h4>Schnellsuche</h4>
                  <div className="thesis-pro-search-shell" role="search" aria-label="Schnellsuche in My Thesis">
                    <div className="thesis-pro-search-grid-bg" />
                    <div className="thesis-pro-search-white" />
                    <div className="thesis-pro-search-border" />
                    <div className="thesis-pro-search-dark-border" />
                    <div className="thesis-pro-search-glow" />
                    <label className="thesis-pro-search-main" htmlFor="thesis-overview-search">
                      <Search size={14} />
                      <input
                        id="thesis-overview-search"
                        type="text"
                        placeholder="Suchen..."
                        value={overviewSearchQuery}
                        onChange={(event) => setOverviewSearchQuery(event.target.value)}
                      />
                      <span className="thesis-pro-search-input-mask" />
                      <span className="thesis-pro-search-accent-mask" />
                    </label>
                  </div>
                  {overviewSearchQuery.trim().length === 0 ? (
                    <div className="thesis-pro-search-empty">Suche in Dokumenten, Aufgaben und Notizen.</div>
                  ) : overviewSearchResults.length === 0 ? (
                    <div className="thesis-pro-search-empty">Keine Treffer gefunden.</div>
                  ) : (
                    <div className="thesis-pro-search-results">
                      {overviewSearchResults.map((result) => (
                        <button
                          key={`${result.type}-${result.id}`}
                          className="thesis-pro-search-result"
                          type="button"
                          onClick={() => openOverviewSearchResult(result)}
                        >
                          <span className="thesis-pro-search-result-type">
                            {result.type === 'document' ? 'Dokument' : result.type === 'task' ? 'Aufgabe' : 'Notiz'}
                          </span>
                          <strong>{result.title}</strong>
                          <small>{result.meta}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>

            <article className={`page-card thesis-surface thesis-pro-score-card ${qualityLocked ? 'locked' : 'unlocked'}`}>
              <div className="thesis-pro-score-glow" />
              <div className="thesis-panel-head">
                <h2>
                  <Sparkles size={16} /> Elea Quality Score
                </h2>
                <span>{qualityLocked ? 'Locked' : `${eleaScoreValue}/10`}</span>
              </div>
              <div className="thesis-pro-score-main">
                <div className="thesis-quality-value">{qualityLocked ? '--' : `${eleaScoreValue}/10`}</div>
                <div className="score-bar thesis-quality-bar">
                  <div className="score-fill" style={{ width: `${qualityLocked ? 0 : eleaScorePercent}%` }} />
                </div>
                <p className="thesis-quality-copy">
                  <strong>PhD-Level Quality Score:</strong> Lassen Sie Ihre Abschlussarbeit (Bachelor, Master, PhD) -
                  vollständig oder in Teilen - blitzschnell auf höchste wissenschaftliche Standards prüfen.
                </p>
                <ul className="thesis-pro-score-list">
                  {qualityHighlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {qualityLocked ? (
                  <button className="primary" type="button" onClick={() => navigate('/payments')}>
                    Basic oder Pro freischalten
                  </button>
                ) : (
                  <button className="thesis-pro-cta" type="button" onClick={() => setActiveView('quality')}>
                    <span className="thesis-pro-cta-circle">
                      <i className="thesis-pro-cta-arrow" />
                    </span>
                    <span className="thesis-pro-cta-text">Mehr Details</span>
                  </button>
                )}
              </div>
            </article>

            <article className="page-card thesis-surface thesis-pro-alert-card">
              <div className="thesis-panel-head">
                <h2>
                  <Activity size={16} /> Thesis Alerts
                </h2>
                <span>Live</span>
              </div>
              <div className="thesis-notification notification">
                <div className="notiglow" />
                <div className="notiborderglow" />
                <div className="notititle">Stress {stress.value}/100</div>
                <div className="notibody">
                  {stress.value > 60
                    ? 'Dein Stress ist erhöht. Plane einen Fokusblock oder Coaching-Slot ein.'
                    : 'Stress stabil. Halte deinen Wochenrhythmus für gleichmäßigen Fortschritt.'}
                </div>
              </div>
              <div className="thesis-pro-mini-reco">
                {recommendations.slice(0, 2).map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </article>

            <article className="page-card thesis-surface thesis-pro-tasks-card">
              <div className="thesis-panel-head">
                <h2>
                  <CalendarDays size={16} /> Nächste Aufgaben
                </h2>
                <button className="ghost" type="button" onClick={() => setActiveView('tasks')}>
                  Öffnen
                </button>
              </div>
              <div className="thesis-pro-stat-grid">
                <div className="thesis-pro-stat-item">
                  <span>Insgesamt erstellt</span>
                  <strong>{todos.length}</strong>
                </div>
                <div className="thesis-pro-stat-item">
                  <span>Erledigt</span>
                  <strong>{completedTodos}</strong>
                </div>
                <div className="thesis-pro-stat-item">
                  <span>Offen</span>
                  <strong>{openTodos}</strong>
                </div>
              </div>
              <div className="thesis-pro-card-note">
                {overdueTodos > 0
                  ? `${overdueTodos} Aufgabe(n) sind überfällig und sollten priorisiert werden.`
                  : 'Keine überfälligen Aufgaben. Dein Task-Rhythmus ist stabil.'}
              </div>
            </article>

            <article className="page-card thesis-surface thesis-pro-docs-card">
              <div className="thesis-panel-head">
                <h2>
                  <FileText size={16} /> Dokumente
                </h2>
                <button className="ghost" type="button" onClick={() => setActiveView('documents')}>
                  Alle
                </button>
              </div>
              <div className="thesis-pro-stat-grid">
                <div className="thesis-pro-stat-item">
                  <span>Hochgeladen</span>
                  <strong>{documents.length}</strong>
                </div>
                <div className="thesis-pro-stat-item">
                  <span>Durch Elea geprüft</span>
                  <strong>{eleaReviewedDocs}</strong>
                </div>
                <div className="thesis-pro-stat-item">
                  <span>Ausstehend</span>
                  <strong>{eleaPendingDocs}</strong>
                </div>
              </div>
              <div className="thesis-pro-card-note">
                {qualityLocked
                  ? 'Elea-Score Prüfung ist mit Basic/Pro aktivierbar.'
                  : 'Neue Uploads fließen automatisch in den Elea-Score ein.'}
              </div>
            </article>

            <article className="page-card thesis-surface thesis-pro-notes-card">
              <div className="thesis-panel-head">
                <h2>
                  <NotepadText size={16} /> Notizen
                </h2>
                <button className="ghost" type="button" onClick={() => setActiveView('workbench')}>
                  Vollansicht
                </button>
              </div>
              <div className="thesis-pro-stat-grid">
                <div className="thesis-pro-stat-item">
                  <span>Notizen gesamt</span>
                  <strong>{notesTotalCount}</strong>
                </div>
                <div className="thesis-pro-stat-item">
                  <span>Hohe Priorität</span>
                  <strong>{notesHighPriority}</strong>
                </div>
                <div className="thesis-pro-stat-item">
                  <span>Mit Verknüpfung</span>
                  <strong>{notesWithLinks}</strong>
                </div>
              </div>
              <div className="thesis-pro-card-note">
                Notizen werden automatisch gespeichert und zwischen Geräten synchronisiert.
              </div>
            </article>

            <article className="page-card thesis-surface thesis-pro-study-card">
              <div className="thesis-panel-head">
                <h2>
                  <GraduationCap size={16} /> Lernlabor
                </h2>
                <button className="ghost" type="button" onClick={() => setActiveView('study')}>
                  Öffnen
                </button>
              </div>
              <div className="thesis-pro-stat-grid">
                <div className="thesis-pro-stat-item">
                  <span>Tests gesamt</span>
                  <strong>{studyQuizAttempts.length}</strong>
                </div>
                <div className="thesis-pro-stat-item">
                  <span>Bestanden</span>
                  <strong>{studyQuizPassedCount}</strong>
                </div>
                <div className="thesis-pro-stat-item">
                  <span>Nicht bestanden</span>
                  <strong>{studyQuizFailedCount}</strong>
                </div>
              </div>
              <div className="thesis-pro-card-note">
                {studyQuizAttempts.length === 0
                  ? 'Noch keine Lernlabor-Tests abgeschlossen.'
                  : `Aktuelle Durchschnittsnote: ${studyQuizAverageGrade === null ? '--' : formatUniGrade(studyQuizAverageGrade)}`}
              </div>
            </article>
          </section>
        )}

        {activeView === 'documents' && (
          <section className="thesis-stage-grid thesis-stage-grid--documents">
            <article className="page-card thesis-surface thesis-doc-panel thesis-docs-card">
              <div className="thesis-panel-head">
                <h2>
                  <FileText size={16} /> Dokumente
                </h2>
                <span>{documents.length} Dateien</span>
              </div>

              <div className="thesis-upload">
                <div className="upload-area">
                  <input
                    id="thesis-file"
                    className="upload-input"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    multiple
                    onChange={(event) => {
                      appendDocuments(event.target.files)
                      event.target.value = ''
                    }}
                  />
                  <label className="upload-label thesis-upload-label" htmlFor="thesis-file">
                    <div className="upload-title">
                      <UploadCloud size={14} /> Dokumente hochladen
                    </div>
                    <div className="upload-sub">PDF, DOC, DOCX - mehrere Dateien möglich.</div>
                  </label>
                </div>

                <div className="upload-summary">
                  <div>
                    <div className="muted">Letzter Upload</div>
                    <div className="upload-name">{latestDocument ? latestDocument.name : 'Noch kein Dokument'}</div>
                  </div>
                  <div className="upload-meta">
                    <div>{latestDocument ? formatBytes(latestDocument.size) : '--'}</div>
                    <div>{latestDocument ? formatDocDate(latestDocument.uploadedAt) : '--'}</div>
                  </div>
                </div>
              </div>

              <div className="thesis-doc-toolbar">
                <label className="thesis-doc-search" htmlFor="thesis-doc-search">
                  <Search size={14} />
                  <input
                    id="thesis-doc-search"
                    type="text"
                    placeholder="Datei suchen"
                    value={docQuery}
                    onChange={(event) => setDocQuery(event.target.value)}
                  />
                </label>
                <div className="thesis-doc-filter">
                  <button type="button" className={docFilter === 'all' ? 'active' : ''} onClick={() => setDocFilter('all')}>
                    <Filter size={12} /> Alle
                  </button>
                  <button type="button" className={docFilter === 'pdf' ? 'active' : ''} onClick={() => setDocFilter('pdf')}>
                    PDF
                  </button>
                  <button type="button" className={docFilter === 'docx' ? 'active' : ''} onClick={() => setDocFilter('docx')}>
                    DOCX
                  </button>
                  <button type="button" className={docFilter === 'doc' ? 'active' : ''} onClick={() => setDocFilter('doc')}>
                    DOC
                  </button>
                </div>
              </div>

              {filteredDocuments.length === 0 ? (
                <div className="doc-empty thesis-mt-0">Keine Dokumente für diesen Filter gefunden.</div>
              ) : (
                <div className="doc-list compact thesis-doc-list">
                  {filteredDocuments.map((doc) => (
                    <div key={doc.id} className="doc-item">
                      <div>
                        <div className="doc-title">{doc.name}</div>
                        <div className="doc-sub">
                          {formatBytes(doc.size)} - {formatDocDate(doc.uploadedAt)}
                        </div>
                      </div>
                      <div className="thesis-doc-actions">
                        <span className="doc-icon">{documentLabel(doc.name)}</span>
                        <button className="ghost" type="button" onClick={() => removeDocument(doc.id)}>
                          x
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="page-card thesis-surface thesis-overview-analytics">
              <div className="thesis-panel-head">
                <h2>
                  <BarChart3 size={16} /> Dokument-Analytics
                </h2>
                <span>Übersicht</span>
              </div>
              <div className="thesis-chart-card">
                <h3>
                  <FileText size={14} /> Typen-Verteilung
                </h3>
                <div className="thesis-doc-type-bars">
                  {docTypeStats.map((item) => (
                    <div key={item.label} className="thesis-doc-type-row">
                      <span>{item.label}</span>
                      <div className="thesis-doc-type-track">
                        <i style={{ width: `${item.percent}%` }} />
                      </div>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>
        )}

        {activeView === 'tasks' && (
          <section className="thesis-stage-grid thesis-stage-grid--tasks">
            <article className="page-card thesis-surface thesis-todo-panel thesis-todo-card">
              <div className="thesis-panel-head">
                <h2>
                  <CalendarDays size={16} /> Aufgaben
                </h2>
                <button className="primary todo-add" type="button" onClick={openTodoForm}>
                  Aufgabe hinzufügen
                </button>
              </div>

              <div className="thesis-todo-stats">
                <span className="thesis-chip">Heute: {todosToday}</span>
                <span className="thesis-chip">Diese Woche: {todosWeek}</span>
                <span className={`thesis-chip ${overdueTodos > 0 ? 'warn' : 'ok'}`}>
                  {overdueTodos > 0 ? `${overdueTodos} überfällig` : 'Keine überfälligen Aufgaben'}
                </span>
              </div>

              <div className="thesis-todo-view">
                <button type="button" className={todoView === 'all' ? 'active' : ''} onClick={() => setTodoView('all')}>
                  Alle
                </button>
                <button type="button" className={todoView === 'today' ? 'active' : ''} onClick={() => setTodoView('today')}>
                  Heute
                </button>
                <button type="button" className={todoView === 'week' ? 'active' : ''} onClick={() => setTodoView('week')}>
                  Woche
                </button>
                <button
                  type="button"
                  className={todoView === 'overdue' ? 'active' : ''}
                  onClick={() => setTodoView('overdue')}
                >
                  Überfällig
                </button>
              </div>

              {todoFormOpen && (
                <div className="thesis-task-create">
                  <label className="thesis-task-field" htmlFor="todo-title">
                    <span>Titel</span>
                    <input
                      id="todo-title"
                      className="todo-input"
                      value={todoDraft.title}
                      placeholder="Titel der Aufgabe"
                      onChange={(event) => setTodoDraft((prev) => ({ ...prev, title: event.target.value }))}
                    />
                  </label>
                  <label className="thesis-task-field" htmlFor="todo-detail">
                    <span>Beschreibung</span>
                    <input
                      id="todo-detail"
                      className="todo-input"
                      value={todoDraft.detail}
                      placeholder="Beschreibung oder nächster Schritt"
                      onChange={(event) => setTodoDraft((prev) => ({ ...prev, detail: event.target.value }))}
                    />
                  </label>
                  <div className="thesis-task-create-row">
                    <label className="thesis-task-field" htmlFor="todo-date">
                      <span>Deadline</span>
                      <input
                        id="todo-date"
                        className="todo-date"
                        type="date"
                        value={todoDraft.date}
                        onChange={(event) => setTodoDraft((prev) => ({ ...prev, date: event.target.value }))}
                      />
                    </label>
                    <label className="thesis-task-field" htmlFor="todo-linked-doc">
                      <span>Internes Dokument</span>
                      <select
                        id="todo-linked-doc"
                        className="todo-date thesis-task-select"
                        value={todoDraft.linkedDocumentId}
                        onChange={(event) => setTodoDraft((prev) => ({ ...prev, linkedDocumentId: event.target.value }))}
                      >
                        <option value="">Kein Dokument verlinken</option>
                        {documents.map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            {doc.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {todoError && <div className="todo-empty thesis-task-error">{todoError}</div>}
                  <div className="thesis-actions-row">
                    <button className="primary" type="button" onClick={createTodo}>
                      Aufgabe erstellen
                    </button>
                    <button className="ghost" type="button" onClick={() => setTodoFormOpen(false)}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              <div className="thesis-task-grid">
                {filteredTodos.length === 0 ? (
                  <div className="todo-empty thesis-task-empty">Keine Aufgaben in dieser Ansicht.</div>
                ) : (
                  filteredTodos.map((todo) => (
                    <article
                      key={todo.id}
                      className={`thesis-task-card notification ${todo.done ? 'done' : ''}`}
                      onClick={() => setSelectedTodo(todo)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedTodo(todo)
                        }
                      }}
                    >
                      <div className="notiglow" />
                      <div className="notiborderglow" />
                      <div className="thesis-task-card-head">
                        <strong className="notititle">{todo.title}</strong>
                        <span className={`thesis-chip ${todo.done ? 'ok' : 'warn'}`}>{todo.done ? 'Erledigt' : 'Offen'}</span>
                      </div>
                      {todo.detail && <p className="thesis-task-card-detail notibody">{todo.detail}</p>}
                      <div className="thesis-task-card-meta">
                        <span>Deadline: {todo.date}</span>
                        <span>
                          Dokument:{' '}
                          {todo.linkedDocumentId ? documentNameById.get(todo.linkedDocumentId) || 'Nicht gefunden' : 'Keins'}
                        </span>
                      </div>
                      <div className="todo-controls thesis-task-card-actions">
                        <button
                          className="ghost"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            updateTodo(todo.id, { done: !todo.done })
                          }}
                        >
                          {todo.done ? 'Offen' : 'Erledigt'}
                        </button>
                        <button
                          className="ghost todo-remove"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            removeTodo(todo.id)
                          }}
                        >
                          Löschen
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </article>

            <article className="page-card thesis-surface thesis-checklist-card">
              <div className="thesis-panel-head">
                <h2>
                  <ListChecks size={14} /> Checkliste
                </h2>
                <span>
                  {checklistDone}/{checklist.length}
                </span>
              </div>
              <div className="checklist thesis-checklist-list">
                {checklist.map((item) => (
                  <label key={item.id} className="checklist-item">
                    <span className="uiverse-checkbox">
                      <input type="checkbox" checked={item.done} onChange={() => toggleChecklist(item.id)} />
                      <span className="checkmark" />
                    </span>
                    <div>
                      <div className="checklist-title">{item.title}</div>
                      <div className="checklist-sub">{item.detail}</div>
                    </div>
                  </label>
                ))}
              </div>
            </article>
          </section>
        )}

        {selectedTodo && (
          <div className="modal-backdrop" onClick={() => setSelectedTodo(null)}>
            <div className="modal thesis-task-modal" onClick={(event) => event.stopPropagation()}>
              <h2>{selectedTodo.title}</h2>
              <p>
                <strong>Status:</strong> {selectedTodo.done ? 'Erledigt' : 'Offen'}
              </p>
              <p>
                <strong>Deadline:</strong> {selectedTodo.date}
              </p>
              <p>
                <strong>Beschreibung:</strong> {selectedTodo.detail || 'Keine Beschreibung'}
              </p>
              <p>
                <strong>Verlinktes Dokument:</strong>{' '}
                {selectedTodo.linkedDocumentId ? documentNameById.get(selectedTodo.linkedDocumentId) || 'Nicht gefunden' : 'Keins'}
              </p>
              <div className="modal-actions">
                <button className="primary" type="button" onClick={() => setSelectedTodo(null)}>
                  Schließen
                </button>
              </div>
            </div>
          </div>
        )}

        {activeView === 'quality' && (
          <section className="thesis-stage-grid thesis-stage-grid--quality">
            <article className={`page-card thesis-surface thesis-quality-card ${qualityLocked ? 'locked' : 'unlocked'}`}>
              <div className="thesis-panel-head">
                <h2>
                  <Sparkles size={16} /> Elea Quality Score
                </h2>
                <span>{qualityLocked ? 'Locked' : 'Basic/Pro aktiv'}</span>
              </div>
              <div className="thesis-quality-main">
                <div className="thesis-quality-value">{qualityLocked ? '--' : `${eleaScoreValue}/10`}</div>
                <p className="thesis-quality-copy">
                  <strong>PhD-Level Quality Score:</strong> Lassen Sie Ihre Abschlussarbeit (Bachelor, Master, PhD) -
                  vollständig oder in Teilen - blitzschnell auf höchste wissenschaftliche Standards prüfen. Jeder
                  Bereich erhält Score (1-10), präzise Feedback und Optimierungstipps für Top-Noten.
                </p>
                <div className="score-bar thesis-quality-bar">
                  <div className="score-fill" style={{ width: `${qualityLocked ? 0 : eleaScorePercent}%` }} />
                </div>
              </div>

              <div className="thesis-quality-sections">
                <div className="thesis-quality-block">
                  <h3>Abgedeckte Features</h3>
                  <p>
                    Struktur, Inhalt, Methodik, Ergebnisse, Sprache, Zitationen, Originalität, Visuals, Ethik & mehr.
                  </p>
                </div>
                <div className="thesis-quality-block">
                  <h3>Mega-Vorteile</h3>
                  <ul>
                    <li>
                      <strong>Zeitersparnis:</strong> 80% weniger Review-Zeit (Stunden statt Tage im Vergleich zu
                      manuellem Feedback).
                    </li>
                    <li>
                      <strong>Erfolgsboost:</strong> +25-40% bessere Noten durch präzise Schwächen-Analyse und Tipps
                      (basierend auf Rubriken).
                    </li>
                    <li>
                      <strong>Sofort-Insights:</strong> Scores + personalisierte Verbesserungen für Fragmente oder
                      Volltexte.
                    </li>
                    <li>
                      <strong>Top-Qualität:</strong> PhD-ähnliche Bewertung hebt Sie von der Masse ab, ideal für
                      Abgabe.
                    </li>
                  </ul>
                </div>
              </div>
            </article>

            <article className="page-card thesis-surface thesis-overview-analytics">
              <div className="thesis-panel-head">
                <h2>
                  <Activity size={16} /> Quality Analytics
                </h2>
                <span>Score Treiber</span>
              </div>

              <div className="thesis-chart-grid">
                <div className="thesis-chart-card">
                  <h3>
                    <Target size={14} /> Rubrik-Scores
                  </h3>
                  <div className="thesis-bars">
                    {rubricScores.map((item) => (
                      <div key={item.label} className="thesis-bar-row">
                        <div className="thesis-bar-head">
                          <span>{item.label}</span>
                          <strong>{item.value.toFixed(1)}/10</strong>
                        </div>
                        <div className="thesis-bar-track">
                          <span style={{ width: `${item.value * 10}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="thesis-chart-card thesis-chart-ring">
                  <h3>
                    <Activity size={14} /> Momentum
                  </h3>
                  <div className="thesis-ring-wrap">
                    <svg className="thesis-ring" viewBox="0 0 118 118">
                      <circle className="thesis-ring-track" cx="59" cy="59" r="46" />
                      <circle
                        className="thesis-ring-progress"
                        cx="59"
                        cy="59"
                        r="46"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                      />
                    </svg>
                    <strong>{progressValue}% Fokus-Level</strong>
                  </div>
                </div>
              </div>
            </article>
          </section>
        )}

        {activeView === 'study' && (
          <section className="thesis-stage-grid thesis-stage-grid--study">
            <article className="page-card thesis-surface thesis-study-card">
              <div className="thesis-panel-head">
                <h2>
                  <GraduationCap size={16} /> Lernlabor
                </h2>
                <button className="ghost" type="button" onClick={() => studyUploadRef.current?.click()} disabled={studyBusy}>
                  <UploadCloud size={12} /> PDF hochladen
                </button>
                <input
                  ref={studyUploadRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="upload-input"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (!file) return
                    void analyzePdfToStudyMaterial(file)
                  }}
                />
              </div>

              <div className="thesis-study-card-body">
                <div
                  className={`thesis-dropzone ${studyBusy ? 'busy' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault()
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const file = event.dataTransfer.files?.[0]
                    if (!file) return
                    void analyzePdfToStudyMaterial(file)
                  }}
                >
                  <p>
                    <strong>Drag & Drop:</strong> PDF (max. 20 MB, 50 Seiten)
                  </p>
                  <small>Die Analyse nutzt nur Dateien, die du in diesem Bereich hochlaedst.</small>
                </div>

                {studyError && <div className="todo-empty thesis-task-error">{studyError}</div>}

                {studyMaterials.length === 0 ? (
                  <div className="todo-empty thesis-task-empty">Noch keine PDFs hochgeladen.</div>
                ) : (
                  <div className="thesis-study-list">
                    {studyMaterials.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`thesis-study-item ${studyActiveId === item.id ? 'active' : ''}`}
                        onClick={() => {
                          setStudyActiveId(item.id)
                          setStudyActiveTab('learn')
                          resetStudyQuizState()
                        }}
                      >
                        <div className="thesis-study-item-main">
                          <strong title={item.name}>{item.name}</strong>
                          <span>
                            {formatBytes(item.size)} · {item.pageCount ? `${item.pageCount} Seiten` : 'PDF'}
                          </span>
                        </div>
                        <span className={`thesis-chip ${item.status}`}>
                          {item.status === 'processing'
                            ? 'Analysiere...'
                            : item.status === 'ready'
                              ? 'Bereit'
                              : 'Fehler'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>

            <article className="page-card thesis-surface thesis-study-result">
              <div className="thesis-panel-head">
                <h2>
                  <FileText size={16} /> Ergebnis
                </h2>
                <span>{activeStudyMaterial ? activeStudyMaterial.name : 'Bitte PDF auswaehlen'}</span>
              </div>

              <div className="thesis-study-result-body">
                {studyProgress && (
                  <div className="thesis-study-progress">
                    <div className="thesis-study-progress-head">
                      <span>{studyProgress.label}</span>
                      <strong>{studyProgress.percent}%</strong>
                    </div>
                    <div className="score-bar">
                      <div className="score-fill" style={{ width: `${studyProgress.percent}%` }} />
                    </div>
                  </div>
                )}

                {!activeStudyMaterial ? (
                  <div className="todo-empty thesis-task-empty">Waehle links eine PDF aus oder lade eine hoch.</div>
                ) : activeStudyMaterial.status === 'processing' ? (
                  <div className="todo-empty thesis-task-empty">Groq analysiert... Das kann kurz dauern.</div>
                ) : activeStudyMaterial.status === 'error' ? (
                  <div className="todo-empty thesis-task-error">{activeStudyMaterial.error || 'Analyse fehlgeschlagen.'}</div>
                ) : (
                  <>
                  <div className="thesis-study-tabs">
                    <button
                      type="button"
                      className={`ghost ${studyActiveTab === 'learn' ? 'active' : ''}`}
                      onClick={() => setStudyActiveTab('learn')}
                    >
                      Lerne das Thema
                    </button>
                    <button
                      type="button"
                      className={`ghost ${studyActiveTab === 'test' ? 'active' : ''}`}
                      onClick={() => {
                        setStudyActiveTab('test')
                        resetStudyQuizState()
                      }}
                    >
                      Teste dich
                    </button>
                    <button
                      type="button"
                      className={`ghost ${studyActiveTab === 'weakness' ? 'active' : ''}`}
                      onClick={() => setStudyActiveTab('weakness')}
                    >
                      Schwächen-Analyse
                    </button>
                  </div>

                  {studyActiveTab === 'learn' && (
                    <div className="thesis-study-learn">
                      {activeStudyMaterial.tutor ? (
                        <>
                          <h3 className="thesis-study-title">{activeStudyMaterial.tutor.title}</h3>
                          {activeStudyMaterial.tutor.intro && <p className="thesis-study-intro">{activeStudyMaterial.tutor.intro}</p>}
                          {activeStudyMaterial.tutor.keyTakeaways && activeStudyMaterial.tutor.keyTakeaways.length > 0 && (
                            <div className="thesis-study-takeaways">
                              <h4>Key Takeaways</h4>
                              <ul>
                                {activeStudyMaterial.tutor.keyTakeaways.slice(0, 12).map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="thesis-study-sections">
                            {(activeStudyMaterial.tutor.sections ?? []).map((sec) => (
                              <details key={sec.heading} className="thesis-study-section" open>
                                <summary>{sec.heading}</summary>
                                {sec.bullets.length > 0 && (
                                  <>
                                    <h5>Erklaerung</h5>
                                    <ul>
                                      {sec.bullets.slice(0, 18).map((b) => (
                                        <li key={b}>{b}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {sec.definitions.length > 0 && (
                                  <>
                                    <h5>Definitionen</h5>
                                    <ul>
                                      {sec.definitions.slice(0, 12).map((d) => (
                                        <li key={d}>{d}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {sec.examples.length > 0 && (
                                  <>
                                    <h5>Beispiele</h5>
                                    <ul>
                                      {sec.examples.slice(0, 10).map((e) => (
                                        <li key={e}>{e}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {sec.questions.length > 0 && (
                                  <>
                                    <h5>Lernfragen</h5>
                                    <ul>
                                      {sec.questions.slice(0, 8).map((q) => (
                                        <li key={q}>{q}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                              </details>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="todo-empty thesis-task-empty">Keine Lern-Doku verfuegbar.</div>
                      )}
                    </div>
                  )}

                  {studyActiveTab === 'test' && (
                    <div className="thesis-study-test">
                      {!activeStudyMaterial.quiz ? (
                        <div className="todo-empty thesis-task-empty">Kein Quiz verfuegbar.</div>
                      ) : (
                        <>
                          <div className="thesis-study-test-head">
                            <div className="thesis-study-level">
                              <span>Level</span>
                              <select
                                className="todo-date thesis-task-select"
                                value={studyQuizLevel}
                                onChange={(event) => {
                                  setStudyQuizLevel(event.target.value as typeof studyQuizLevel)
                                  resetStudyQuizState()
                                }}
                              >
                                <option value="easy">Einfach</option>
                                <option value="medium">Mittel</option>
                                <option value="hard">Schwer</option>
                              </select>
                            </div>
                            <div className="thesis-study-timer">
                              <span>Timer</span>
                              <strong>
                                {studyQuizStarted
                                  ? `${Math.floor(studyQuizSecondsLeft / 60)
                                      .toString()
                                      .padStart(2, '0')}:${(studyQuizSecondsLeft % 60).toString().padStart(2, '0')}`
                                  : '--:--'}
                              </strong>
                            </div>
                            {!studyQuizStarted ? (
                              <button className="primary" type="button" onClick={startStudyQuiz}>
                                Quiz starten
                              </button>
                            ) : (
                              <button
                                className="ghost"
                                type="button"
                                onClick={() => {
                                  setStudyQuizDone(true)
                                  setStudyQuizStarted(false)
                                }}
                              >
                                Abgeben
                              </button>
                            )}
                          </div>

                          {(() => {
                            const questions = activeStudyMaterial.quiz?.[studyQuizLevel] ?? []
                            const answered = Object.keys(studyQuizAnswers).length
                            const correct = questions.filter((q, idx) => studyQuizAnswers[idx] === q.correct).length

                            return (
                              <>
                                <div className="thesis-study-score">
                                  <span>
                                    Score: <strong>{studyQuizDone ? `${correct}/${questions.length}` : `${answered}/${questions.length} beantwortet`}</strong>
                                  </span>
                                </div>
                                <div className="thesis-study-questions">
                                  {questions.map((q, idx) => {
                                    const picked = studyQuizAnswers[idx]
                                    const showFeedback = studyQuizDone
                                    return (
                                      <div key={`${idx}-${q.question}`} className="thesis-study-q">
                                        <p>
                                          <strong>{idx + 1}.</strong> {q.question}
                                        </p>
                                        <div className="thesis-study-options">
                                          {q.options.map((opt, oIdx) => {
                                            const isPicked = picked === oIdx
                                            const isCorrect = oIdx === q.correct
                                            const cls =
                                              !showFeedback && isPicked
                                                ? 'picked'
                                                : showFeedback && isPicked && isCorrect
                                                  ? 'ok'
                                                  : showFeedback && isPicked && !isCorrect
                                                    ? 'bad'
                                                    : showFeedback && !isPicked && isCorrect
                                                      ? 'correct'
                                                      : ''
                                            return (
                                              <button
                                                key={`${idx}-${oIdx}`}
                                                type="button"
                                                className={`ghost thesis-study-option ${cls}`}
                                                disabled={!studyQuizStarted}
                                                onClick={() => {
                                                  setStudyQuizAnswers((prev) => ({ ...prev, [idx]: oIdx }))
                                                }}
                                              >
                                                {opt}
                                              </button>
                                            )
                                          })}
                                        </div>
                                        {showFeedback && q.explanation && <small className="thesis-study-explain">{q.explanation}</small>}
                                      </div>
                                    )
                                  })}
                                </div>
                              </>
                            )
                          })()}
                        </>
                      )}
                    </div>
                  )}

                  {studyActiveTab === 'weakness' && (
                    <div className="thesis-study-weakness">
                      <p className="thesis-subline">
                        Jede Quizfrage wird einem Kapitel zugeordnet. Unter 60% Trefferquote markiert Elea das Kapitel als Schwäche und empfiehlt gezieltes Training.
                      </p>
                      <div className="thesis-study-weakness-meta">
                        <span>
                          Beantwortete Fragen: <strong>{answeredQuizQuestionsCount}</strong>/50
                        </span>
                        <span>
                          Schwache Kapitel: <strong>{weakChapterPerformance.length}</strong>
                        </span>
                      </div>

                      {studyWeaknessNotice && (
                        <div className={`todo-empty ${studyWeaknessNotice.type === 'error' ? 'thesis-task-error' : 'thesis-task-empty'}`}>
                          {studyWeaknessNotice.text}
                        </div>
                      )}

                      {chapterPerformance.length === 0 ? (
                        <div className="todo-empty thesis-task-empty">Noch keine Kapitelanalyse vorhanden. Starte zuerst Quizrunden im Lernlabor.</div>
                      ) : (
                        <div className="thesis-weakness-list">
                          {chapterPerformance.slice(0, 8).map((item) => {
                            const levelClass = item.percent < 60 ? 'risk-high' : item.percent < 75 ? 'risk-mid' : 'risk-good'
                            return (
                              <article key={item.chapter} className={`thesis-weakness-item ${levelClass}`}>
                                <header>
                                  <strong>{item.chapter}</strong>
                                  <span>{item.percent}%</span>
                                </header>
                                <p>
                                  {item.correct}/{item.total} korrekt · {item.wrong} Fehler
                                </p>
                                {item.percent < 60 && <small>Empfehlung: {chapterRecommendation(item.chapter)}</small>}
                              </article>
                            )
                          })}
                        </div>
                      )}

                      <div className="thesis-actions-row">
                        <button
                          className="primary"
                          type="button"
                          onClick={createWeaknessQuiz}
                          disabled={studyWeaknessBusy || answeredQuizQuestionsCount < 50}
                        >
                          {studyWeaknessBusy ? 'Schwächen-Quiz wird erstellt...' : 'Schwächen-Quiz erstellen'}
                        </button>
                        <button className="ghost" type="button" onClick={() => setStudyActiveTab('test')}>
                          Zu den Quiz
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              </div>
            </article>
          </section>
        )}

        {activeView === 'workbench' && (
          <section className="thesis-stage-grid thesis-stage-grid--workbench">
            <article className="page-card thesis-surface thesis-notes-panel">
              <div className="thesis-panel-head">
                <h2>
                  <NotepadText size={16} /> Notizen
                </h2>
                <span>Live Sync</span>
              </div>
              <p className="thesis-subline">Hier kannst du Notizen erstellen, priorisieren und direkt mit Aufgaben oder Dokumenten verknüpfen.</p>
              <div className="thesis-actions-row">
                <button className="ghost" type="button" onClick={startVoiceCapture} disabled={isTranscribing}>
                  <Mic size={12} /> {isRecording ? 'Aufnahme stoppen' : isTranscribing ? 'Transkribiere...' : 'Sprach-Input'}
                </button>
                <button className="ghost" type="button" onClick={() => noteDocUploadRef.current?.click()}>
                  <UploadCloud size={12} /> Dokument hochladen
                </button>
                <input
                  ref={noteDocUploadRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="upload-input"
                  onChange={(event) => {
                    uploadNoteDocument(event.target.files)
                    event.target.value = ''
                  }}
                />
              </div>
              <div className="thesis-note-grid">
                <label className="thesis-note-box" htmlFor="note-title">
                  <span>Titel</span>
                  <input
                    id="note-title"
                    className="todo-input"
                    value={noteDraft.title}
                    onChange={(event) => setNoteDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="z. B. Forschungsfrage schärfen"
                  />
                </label>
                <label className="thesis-note-box" htmlFor="note-content">
                  <span>Inhalt</span>
                  <textarea
                    id="note-content"
                    value={noteDraft.content}
                    onChange={(event) => setNoteDraft((prev) => ({ ...prev, content: event.target.value }))}
                    placeholder="Notiz in Sekunden erfassen..."
                  />
                </label>
                <div className="thesis-task-create-row">
                  <label className="thesis-note-box" htmlFor="note-subject">
                    <span>Fach</span>
                    <input
                      id="note-subject"
                      className="todo-input"
                      value={noteDraft.subject}
                      onChange={(event) => setNoteDraft((prev) => ({ ...prev, subject: event.target.value }))}
                      placeholder="z. B. Empirische Methoden"
                    />
                  </label>
                  <label className="thesis-note-box" htmlFor="note-priority">
                    <span>Priorität</span>
                    <select
                      id="note-priority"
                      className="todo-date thesis-task-select"
                      value={noteDraft.priority}
                      onChange={(event) =>
                        setNoteDraft((prev) => ({ ...prev, priority: event.target.value as ThesisNote['priority'] }))
                      }
                    >
                      <option value="high">Hoch</option>
                      <option value="medium">Mittel</option>
                      <option value="low">Niedrig</option>
                    </select>
                  </label>
                </div>
                <div className="thesis-task-create-row">
                  <label className="thesis-note-box" htmlFor="note-tags">
                    <span>Tags (Komma getrennt)</span>
                    <input
                      id="note-tags"
                      className="todo-input"
                      value={noteDraft.tags}
                      onChange={(event) => setNoteDraft((prev) => ({ ...prev, tags: event.target.value }))}
                      placeholder="methodik, statistik, deadline"
                    />
                  </label>
                  <label className="thesis-note-box" htmlFor="note-link-doc">
                    <span>Dokument verknüpfen</span>
                    <select
                      id="note-link-doc"
                      className="todo-date thesis-task-select"
                      value={noteDraft.linkedDocumentId}
                      onChange={(event) => setNoteDraft((prev) => ({ ...prev, linkedDocumentId: event.target.value }))}
                    >
                      <option value="">Kein Dokument</option>
                      {documents.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="thesis-note-box" htmlFor="note-link-task">
                  <span>Aufgabe verknüpfen</span>
                  <select
                    id="note-link-task"
                    className="todo-date thesis-task-select"
                    value={noteDraft.linkedTodoId}
                    onChange={(event) => setNoteDraft((prev) => ({ ...prev, linkedTodoId: event.target.value }))}
                  >
                    <option value="">Keine Aufgabe</option>
                    {todos.map((todo) => (
                      <option key={todo.id} value={todo.id}>
                        {todo.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {noteError && <div className="todo-empty thesis-task-error">{noteError}</div>}
              <div className="thesis-actions-row">
                <button className="primary" type="button" onClick={() => createNote('text')}>
                  Notiz speichern
                </button>
                <button className="ghost" type="button" onClick={resetNoteDraft}>
                  Zurücksetzen
                </button>
              </div>
            </article>

            <article className="page-card thesis-surface thesis-reco-card">
              <div className="thesis-panel-head">
                <h2>
                  <CircleAlert size={14} /> Notizen-Feed
                </h2>
                <span>{notes.length} Einträge</span>
              </div>
              {notes.length === 0 ? (
                <div className="todo-empty thesis-task-empty">
                  Noch keine Notizen vorhanden. Erstelle deine erste Notiz per Text oder Sprach-Input.
                </div>
              ) : (
                <div className="thesis-doc-list">
                  {notes.map((note) => (
                    <article
                      key={note.id}
                      className="todo-item thesis-note-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedNote(note)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedNote(note)
                        }
                      }}
                    >
                      <div className="todo-main">
                        <strong>{note.title}</strong>
                        <p className="thesis-note-preview">{note.content}</p>
                        <div className="thesis-task-card-meta">
                          <span>Fach: {note.subject || 'Nicht gesetzt'}</span>
                          <span>Tags: {note.tags.length > 0 ? note.tags.join(', ') : 'Keine'}</span>
                          <span>
                            Verknüpfung: {note.linkedDocumentId ? 'Dokument' : note.linkedTodoId ? 'Aufgabe' : 'Keine'}
                          </span>
                          <span>Eingabe: {note.inputType === 'voice' ? 'Sprache' : 'Text'}</span>
                        </div>
                      </div>
                      <div className="todo-controls thesis-doc-actions">
                        <button
                          className="ghost"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            updateNotePriority(note.id, note.priority === 'high' ? 'medium' : note.priority === 'medium' ? 'low' : 'high')
                          }}
                        >
                          Priorität: {note.priority}
                        </button>
                        <button
                          className="ghost todo-remove"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            removeNote(note.id)
                          }}
                        >
                          Löschen
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </section>
        )}
      </main>

      {selectedNote && (
        <div className="modal-backdrop" onClick={() => setSelectedNote(null)}>
          <div className="modal thesis-task-modal thesis-note-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{selectedNote.title}</h2>
            <p>
              <strong>Inhalt:</strong>
            </p>
            <p className="thesis-note-modal-content">{selectedNote.content}</p>
            <p>
              <strong>Fach:</strong> {selectedNote.subject || 'Nicht gesetzt'}
            </p>
            <p>
              <strong>Tags:</strong> {selectedNote.tags.length > 0 ? selectedNote.tags.join(', ') : 'Keine'}
            </p>
            <p>
              <strong>Verknüpfung:</strong>{' '}
              {selectedNote.linkedDocumentId ? 'Dokument' : selectedNote.linkedTodoId ? 'Aufgabe' : 'Keine'}
            </p>
            <p>
              <strong>Eingabe:</strong> {selectedNote.inputType === 'voice' ? 'Sprache' : 'Text'}
            </p>
            <div className="modal-actions">
              <button className="primary" type="button" onClick={() => setSelectedNote(null)}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default MyThesisPage



