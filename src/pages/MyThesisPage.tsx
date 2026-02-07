import { useEffect, useMemo, useState } from 'react'
import { STORAGE_KEYS, normalizeTodos, parseJson, todayIso } from '../lib/storage'
import type { AssessmentResult, Plan, ThesisChecklistItem, ThesisDocument, TodoItem } from '../lib/storage'
import { useStoredProfile } from '../hooks/useStoredProfile'
import { useStress } from '../hooks/useStress'
import { useAuth } from '../context/AuthContext'
import {
  loadAssessment,
  loadPlan,
  loadThesisChecklist,
  loadThesisDocuments,
  loadTodos,
  replaceThesisChecklist,
  replaceThesisDocuments,
  replaceTodos,
} from '../lib/supabaseData'

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
  { id: 'title-page', title: 'Title page', detail: 'Cover, author, program', done: false },
  { id: 'abstract', title: 'Abstract', detail: 'Purpose, method, key result', done: false },
  { id: 'introduction', title: 'Introduction', detail: 'Problem, research question', done: false },
  { id: 'method', title: 'Method', detail: 'Design, sample, tools', done: false },
  { id: 'results', title: 'Results', detail: 'Tables, figures, stats', done: false },
  { id: 'discussion', title: 'Discussion', detail: 'Limitations, outlook', done: false },
  { id: 'references', title: 'References', detail: 'Consistent style', done: false },
  { id: 'appendix', title: 'Appendix', detail: 'Instruments, extra data', done: false },
]

const createChecklist = () => checklistBase.map((item) => ({ ...item }))

const mergeChecklist = (stored: ThesisChecklistItem[] | null) => {
  const base = createChecklist()
  if (!stored || stored.length === 0) return base
  const map = new Map(stored.map((item) => [item.id, item.done]))
  return base.map((item) => ({ ...item, done: map.get(item.id) ?? item.done }))
}

const MyThesisPage = () => {
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
  const [synced, setSynced] = useState(false)
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
    let active = true
    if (!user) {
      setSynced(true)
      return () => {}
    }
    Promise.all([loadTodos(user.id), loadThesisDocuments(user.id), loadThesisChecklist(user.id)]).then(
      ([remoteTodos, remoteDocs, remoteChecklist]) => {
        if (!active) return
        if (remoteTodos.length > 0) {
          setTodos(normalizeTodos(remoteTodos))
        }
        if (remoteDocs.length > 0) {
          setDocuments(remoteDocs)
        }
        if (remoteChecklist && remoteChecklist.length > 0) {
          setChecklist(mergeChecklist(remoteChecklist))
        }
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

  const progressValue = useMemo(() => {
    const video = 30
    const checklistWeight = 30
    const uploads = 20
    const coaching = plan === 'free' ? 0 : 20
    const base = (Number(profile?.status ?? '0') / 100) * (video + checklistWeight + uploads)
    return Math.min(Math.round(base + coaching), 100)
  }, [plan, profile?.status])

  const qualityScore = useMemo(() => {
    if (!profile) return null
    return Math.min(100, Math.round(progressValue))
  }, [profile, progressValue])

  const showCommitmentBanner =
    profile?.zielnote === '0,7' || profile?.zielnote === '1,0' || profile?.zielnote === '1,3'

  const recommendations = useMemo(() => {
    const items: string[] = []
    if (!profile) {
      items.push('Profil ausfuellen, damit dein Plan startet')
      return items
    }
    const statusValue = Number(profile.status ?? '0')
    if (statusValue < 30) items.push('Expose oder Gliederung finalisieren')
    if (todos.length === 0) items.push('2-3 To-dos fuer diese Woche anlegen')
    if (stress.value > 60) items.push('Mental Health Log pflegen und Pausen planen')
    if (assessment?.recommendedPlan && plan === 'free' && assessment.recommendedPlan !== 'free') {
      items.push('Empfohlenen Plan pruefen')
    }
    if (items.length === 0) items.push('Weiter so - du bist auf Kurs')
    return items
  }, [assessment?.recommendedPlan, plan, profile, stress.value, todos.length])

  const latestDocument = documents[0] ?? null
  const fileLabel = latestDocument ? latestDocument.name : 'Noch kein Dokument hochgeladen'
  const fileSize = latestDocument ? formatBytes(latestDocument.size) : '--'
  const fileDate = latestDocument ? formatDocDate(latestDocument.uploadedAt) : '--'

  const appendDocuments = (files: FileList | null) => {
    if (!files || files.length === 0) return
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

    setDocuments((prev) => {
      const existing = new Set(prev.map((doc) => documentKey(doc)))
      const unique = nextDocs.filter((doc) => !existing.has(documentKey(doc)))
      return unique.length > 0 ? [...unique, ...prev] : prev
    })
  }

  const addTodo = () => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`
    setTodos((prev) => [{ id, title: '', detail: '', date: todayIso() }, ...prev])
  }

  const updateTodo = (id: string, patch: Partial<TodoItem>) => {
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo)))
  }

  const removeTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id))
  }

  const toggleChecklist = (id: string) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)))
  }

  return (
    <div className="page thesis-page">
      <div className="page-card">
        <h1>My Thesis</h1>
        <p>Upload your documents and track the parts you have finished.</p>
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
            <label className="upload-label" htmlFor="thesis-file">
              <div className="upload-title">Drop your documents or click to upload</div>
              <div className="upload-sub">PDF, DOC, or DOCX. Multiple files possible.</div>
            </label>
          </div>
          <div className="upload-summary">
            <div>
              <div className="muted">Letztes Dokument</div>
              <div className="upload-name">{fileLabel}</div>
            </div>
            <div className="upload-meta">
              <div>{fileSize}</div>
              <div>{fileDate}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="page-card">
        <div className="doc-head">
          <h2>Hochgeladene Dokumente</h2>
          <div className="muted">{documents.length} Dateien</div>
        </div>
        {documents.length === 0 ? (
          <div className="doc-empty">Noch keine Dokumente hochgeladen.</div>
        ) : (
          <div className="doc-list">
            {documents.map((doc) => (
              <div key={doc.id} className="doc-item">
                <div>
                  <div className="doc-title">{doc.name}</div>
                  <div className="doc-sub">
                    {formatBytes(doc.size)} - {formatDocDate(doc.uploadedAt)}
                  </div>
                </div>
                <span className="doc-icon">{documentLabel(doc.name)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="page-card">
        <h2>Parts checklist</h2>
        <div className="checklist">
          {checklist.map((section) => (
            <label key={section.id} className="checklist-item">
              <span className="uiverse-checkbox">
                <input type="checkbox" checked={section.done} onChange={() => toggleChecklist(section.id)} />
                <span className="checkmark" />
              </span>
              <div>
                <div className="checklist-title">{section.title}</div>
                <div className="checklist-sub">{section.detail}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div className="page-card">
        <h2>Quality Score & Empfehlungen</h2>
        <div className="hero-actions">
          <div className="score-card">
            <h4>Quality Score</h4>
            <div className="score-value">
              {qualityScore === null ? 'Noch keine Analyse' : `${qualityScore}% (aus Fortschritt)`}
            </div>
            <div className="score-bar">
              <div className="score-fill" style={{ width: `${qualityScore ?? 0}%` }}></div>
            </div>
          </div>
          <div className="recommendations">
            <h4>Empfehlungen</h4>
            <ul>
              {recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {showCommitmentBanner && (
              <div className="commitment-note">Hohe Ziele brauchen Struktur. Coaching kann dir dabei helfen.</div>
            )}
          </div>
        </div>
      </div>
      <div className="page-card">
        <div className="todo-head">
          <h2>Zentrale To-do Liste</h2>
          <button className="primary todo-add" type="button" onClick={addTodo}>
            Aufgabe hinzufuegen
          </button>
        </div>
        <p className="muted">Diese Aufgaben erscheinen im Zeitplan. Weise ein Datum zu.</p>
        <div className="todo-list">
          {todos.length === 0 ? (
            <div className="todo-empty">Noch keine Aufgaben angelegt.</div>
          ) : (
            todos.map((todo) => (
              <div key={todo.id} className="todo-item">
                <div className="todo-main">
                  <input
                    className="todo-input"
                    value={todo.title}
                    placeholder="Aufgabe"
                    onChange={(event) => updateTodo(todo.id, { title: event.target.value })}
                  />
                  <input
                    className="todo-input"
                    value={todo.detail}
                    placeholder="Details oder naechster Schritt"
                    onChange={(event) => updateTodo(todo.id, { detail: event.target.value })}
                  />
                </div>
                <div className="todo-controls">
                  <input
                    className="todo-date"
                    type="date"
                    value={todo.date}
                    onChange={(event) => updateTodo(todo.id, { date: event.target.value })}
                  />
                  <button className="ghost todo-remove" type="button" onClick={() => removeTodo(todo.id)}>
                    Entfernen
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default MyThesisPage
