import {
  Activity,
  BarChart3,
  CalendarDays,
  CircleAlert,
  FileText,
  Filter,
  FolderOpen,
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
import { useStoredProfile } from '../hooks/useStoredProfile'
import { useStress } from '../hooks/useStress'
import {
  loadAssessment,
  loadPlan,
  loadThesisNotes,
  loadThesisChecklist,
  loadThesisDocuments,
  loadTodos,
  replaceThesisNotes,
  replaceThesisChecklist,
  replaceThesisDocuments,
  replaceTodos,
} from '../lib/supabaseData'
import { STORAGE_KEYS, normalizeThesisNotes, normalizeTodos, parseDeadlineDate, parseJson, todayIso } from '../lib/storage'
import type { AssessmentResult, Plan, ThesisChecklistItem, ThesisDocument, ThesisNote, TodoItem } from '../lib/storage'

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
type ThesisView = 'overview' | 'documents' | 'tasks' | 'quality' | 'workbench'
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
  const [docQuery, setDocQuery] = useState('')
  const [docFilter, setDocFilter] = useState<DocFilter>('all')
  const [todoView, setTodoView] = useState<TodoView>('all')
  const [activeView, setActiveView] = useState<ThesisView>('overview')
  const [todoFormOpen, setTodoFormOpen] = useState(false)
  const [todoError, setTodoError] = useState('')
  const [selectedTodo, setSelectedTodo] = useState<TodoItem | null>(null)
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaChunksRef = useRef<Blob[]>([])
  const recordingTimeoutRef = useRef<number | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)

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
    let active = true
    if (!user) {
      setSynced(true)
      return () => {}
    }

    Promise.all([loadTodos(user.id), loadThesisDocuments(user.id), loadThesisChecklist(user.id), loadThesisNotes(user.id)]).then(
      ([remoteTodos, remoteDocs, remoteChecklist, remoteNotes]) => {
        if (!active) return
        setTodos(normalizeTodos(remoteTodos))
        setDocuments(remoteDocs)
        setChecklist(mergeChecklist(remoteChecklist))
        setNotes(normalizeThesisNotes(remoteNotes))
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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
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
          const prevSig = JSON.stringify(prev.map((note) => [note.id, note.updatedAt]))
          const nextSig = JSON.stringify(normalized.map((note) => [note.id, note.updatedAt]))
          return prevSig === nextSig ? prev : normalized
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
    const planImpact = plan === 'free' ? 0 : plan === 'basic' ? 8 : 13
    const stressPenalty = Math.round(Math.max(stress.value - 58, 0) * 0.24)

    return clamp(statusValue + uploadsImpact + checklistImpact + todoImpact + planImpact - stressPenalty, 6, 100)
  }, [profile?.status, documents.length, checklistRate, todosWeek, plan, stress.value])

  const eleaScorePercent = useMemo(() => {
    const statusValue = Number(profile?.status ?? '0')
    const base = 42 + statusValue * 0.34 + checklistRate * 0.26 + Math.min(documents.length * 2.6, 15)
    const stressImpact = Math.max(stress.value - 55, 0) * 0.19
    const planBoost = plan === 'pro' ? 8 : plan === 'basic' ? 4 : 0
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
    const logValues = stress.log.slice(-8).map((entry) => clamp(100 - entry.value, 10, 95))
    if (logValues.length >= 5) return logValues

    return [
      clamp(progressValue - 18, 20, 95),
      clamp(progressValue - 12, 20, 95),
      clamp(progressValue - 8, 20, 95),
      clamp(progressValue - 4, 20, 95),
      clamp(progressValue - 2, 20, 95),
      clamp(progressValue, 20, 95),
      clamp(progressValue + 1, 20, 95),
      clamp(progressValue + 2, 20, 95),
    ]
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

  const startVoiceCapture = async () => {
    if (isTranscribing) return

    if (isRecording && mediaRecorderRef.current) {
      if (recordingTimeoutRef.current) {
        window.clearTimeout(recordingTimeoutRef.current)
        recordingTimeoutRef.current = null
      }
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      return
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNoteError('Sprachaufnahme wird auf diesem Gerät nicht unterstützt. Bitte Text eingeben.')
      return
    }

    try {
      setNoteError('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      mediaChunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          mediaChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        try {
          if (recordingTimeoutRef.current) {
            window.clearTimeout(recordingTimeoutRef.current)
            recordingTimeoutRef.current = null
          }
          setIsTranscribing(true)
          const audioType = recorder.mimeType || 'audio/webm'
          const ext = audioType.includes('mp4') ? 'm4a' : 'webm'
          const audioBlob = new Blob(mediaChunksRef.current, { type: audioType })
          if (audioBlob.size === 0) {
            setNoteError('Keine Audioaufnahme erkannt.')
            return
          }

          const formData = new FormData()
          formData.append('file', audioBlob, `note-${Date.now()}.${ext}`)

          const endpoint = import.meta.env.VITE_TRANSCRIBE_ENDPOINT || '/api/transcribe'
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
              throw new Error(
                'Kein Transkript: API-Route nicht erreichbar und VITE_GROQ_API_KEY fehlt in .env.local.'
              )
            }
            const groqForm = new FormData()
            groqForm.append('file', audioBlob, `note-${Date.now()}.${ext}`)
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
            setNoteError('Keine Sprache erkannt. Bitte erneut aufnehmen.')
            return
          }

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
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop())
            mediaStreamRef.current = null
          }
          mediaRecorderRef.current = null
          mediaChunksRef.current = []
          setIsRecording(false)
        }
      }

      recorder.start()
      setIsRecording(true)
      setNoteError('Aufnahme läuft... tippe erneut auf Sprach-Input zum Stoppen.')
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
      }, 30000)
    } catch {
      setNoteError('Mikrofonzugriff nicht möglich. Bitte Berechtigung prüfen.')
      setIsRecording(false)
    }
  }

  const toggleChecklist = (id: string) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)))
  }

  const circumference = 2 * Math.PI * 46
  const dashOffset = circumference - (progressValue / 100) * circumference

  const performanceBars = useMemo(() => {
    const labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']
    const values = sparklineValues.slice(-8)
    return values.map((value, index) => ({
      label: labels[index] ?? `W${index + 1}`,
      value,
    }))
  }, [sparklineValues])

  const docMixGradient = useMemo(() => {
    if (documents.length === 0) return 'conic-gradient(#dbe8e7 0deg 360deg)'
    const colors = ['#28a394', '#46baa9', '#72d1c3', '#a9e7de']
    let angle = 0
    const stops = docTypeStats.map((item, index) => {
      const start = angle
      angle += (item.percent / 100) * 360
      return `${colors[index % colors.length]} ${start}deg ${angle}deg`
    })
    return `conic-gradient(${stops.join(', ')})`
  }, [docTypeStats, documents.length])

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
    { id: 'workbench', label: 'Notizen', icon: <NotepadText size={15} />, meta: `${notesTotalCount}` },
  ]

  return (
    <section className="page thesis-page thesis-shell">
      <aside className="page-card thesis-surface thesis-left-rail">
        <div className="thesis-rail-head">
          <p className="thesis-kicker">ELEA Thesis</p>
          <h1>My Thesis</h1>
          <p className="thesis-subline">Dein zentraler Arbeitsbereich für Fortschritt, Fokus und Abgabe.</p>
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
                  <span>Wochensprint</span>
                  <strong>{todosWeek} geplant</strong>
                  <small>
                    Heute {todosToday} · {overdueTodos > 0 ? `${overdueTodos} überfällig` : 'keine überfälligen'}
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
                    <span>letzte 8 Signale</span>
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

                <div className="thesis-pro-mix-card">
                  <h4>Dokument-Mix</h4>
                  <div className="thesis-pro-donut-wrap">
                    <div className="thesis-pro-donut" style={{ backgroundImage: docMixGradient }}>
                      <span>{documents.length}</span>
                    </div>
                    <div className="thesis-pro-donut-legend">
                      {docTypeStats.map((item) => (
                        <div key={item.label} className="thesis-pro-legend-row">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="thesis-pro-mix-summary">
                    <div className="thesis-pro-mix-kpi">
                      <span>Checklist</span>
                      <strong>
                        {checklistDone}/{checklist.length}
                      </strong>
                    </div>
                    <div className="thesis-pro-mix-kpi">
                      <span>Abgabereife</span>
                      <strong>{checklistRate}%</strong>
                    </div>
                  </div>
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
                    <article key={note.id} className="todo-item thesis-note-item">
                      <div className="todo-main">
                        <strong>{note.title}</strong>
                        <p>{note.content}</p>
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
                          onClick={() =>
                            updateNotePriority(note.id, note.priority === 'high' ? 'medium' : note.priority === 'medium' ? 'low' : 'high')
                          }
                        >
                          Priorität: {note.priority}
                        </button>
                        <button className="ghost todo-remove" type="button" onClick={() => removeNote(note.id)}>
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
    </section>
  )
}

export default MyThesisPage



