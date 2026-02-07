import { useEffect, useMemo, useState } from 'react'
import { STORAGE_KEYS, parseJson } from '../lib/storage'
import type { SchoolContent, SchoolModule, SchoolProgress } from '../lib/storage'
import { useAuth } from '../context/AuthContext'
import { loadSchoolContent, loadSchoolProgress, saveSchoolProgress } from '../lib/supabaseData'

const createLessonMap = (modules: SchoolModule[]) => {
  const map: Record<string, boolean> = {}
  modules.forEach((module) => {
    module.lessons.forEach((lesson) => {
      map[lesson.id] = false
    })
  })
  return map
}

const durationToMinutes = (duration: string) => {
  const parts = duration.split(':').map((value) => Number(value))
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return parts[0] + parts[1] / 60
  }
  const fallback = Number(duration)
  return Number.isNaN(fallback) ? 0 : fallback
}

const formatMinutes = (value: number) => {
  const rounded = Math.round(value)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  return `${hours}h ${minutes}m`
}

const SchoolPage = () => {
  const [content, setContent] = useState<SchoolContent>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.schoolContent), { modules: [] })
  )
  const [contentLoaded, setContentLoaded] = useState(false)
  const [progress, setProgress] = useState<SchoolProgress>(() =>
    parseJson<SchoolProgress>(localStorage.getItem(STORAGE_KEYS.schoolProgress), { lessons: {} })
  )
  const [synced, setSynced] = useState(false)
  const { user } = useAuth()

  const modules = content.modules ?? []

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.schoolContent, JSON.stringify(content))
  }, [content])

  useEffect(() => {
    let active = true
    if (!user) {
      setContentLoaded(true)
      return () => {}
    }
    loadSchoolContent().then((remote) => {
      if (!active) return
      if (remote) setContent(remote)
      setContentLoaded(true)
    })
    return () => {
      active = false
    }
  }, [user?.id])

  useEffect(() => {
    const base = createLessonMap(modules)
    setProgress((prev) => {
      const merged = { ...base, ...prev.lessons }
      const same = Object.keys(merged).length === Object.keys(prev.lessons).length
      if (same) return prev
      return { ...prev, lessons: merged }
    })
  }, [modules])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.schoolProgress, JSON.stringify(progress))
    if (!synced || !user) return
    saveSchoolProgress(user.id, progress).catch((error) => {
      console.error('School-Progress speichern fehlgeschlagen', error)
    })
  }, [progress, synced, user])

  useEffect(() => {
    let active = true
    if (!user) {
      setSynced(true)
      return () => {}
    }
    loadSchoolProgress(user.id).then((remote) => {
      if (!active) return
      if (remote) {
        const base = createLessonMap(modules)
        setProgress({
          lessons: { ...base, ...remote.lessons },
          lastLessonId: remote.lastLessonId,
        })
      }
      setSynced(true)
    })
    return () => {
      active = false
    }
  }, [user?.id, modules])

  const lessons = useMemo(
    () =>
      modules.flatMap((module) =>
        module.lessons.map((lesson) => ({
          ...lesson,
          moduleId: module.id,
          moduleTitle: module.title,
        }))
      ),
    [modules]
  )

  const completedLessons = lessons.filter((lesson) => progress.lessons[lesson.id]).length
  const totalLessons = lessons.length
  const overallProgress = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100)

  const totalMinutes = lessons.reduce((sum, lesson) => sum + durationToMinutes(lesson.duration), 0)
  const watchedMinutes = lessons.reduce(
    (sum, lesson) => sum + (progress.lessons[lesson.id] ? durationToMinutes(lesson.duration) : 0),
    0
  )

  const nextLesson = lessons.find((lesson) => !progress.lessons[lesson.id]) ?? lessons[0]
  const activeLesson = lessons.find((lesson) => lesson.id === progress.lastLessonId) ?? nextLesson
  const activeEmbed = activeLesson?.embedUrl?.trim() ?? ''

  const toggleLesson = (lessonId: string) => {
    setProgress((prev) => ({
      ...prev,
      lessons: {
        ...prev.lessons,
        [lessonId]: !prev.lessons[lessonId],
      },
    }))
  }

  const setActiveLesson = (lessonId: string) => {
    setProgress((prev) => ({
      ...prev,
      lastLessonId: lessonId,
    }))
  }

  if (!contentLoaded) {
    return (
      <div className="page school-page">
        <div className="page-card">
          <h1>Online School</h1>
          <p>Inhalte werden geladen...</p>
        </div>
      </div>
    )
  }

  if (modules.length === 0) {
    return (
      <div className="page school-page">
        <div className="page-card">
          <h1>Online School</h1>
          <p>Noch keine Videos oder Module vorhanden.</p>
          <div className="muted">Sobald Inhalte hinterlegt sind, erscheinen sie hier automatisch.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page school-page">
      <div className="page-card school-overview">
        <div className="school-intro">
          <h1>Online School</h1>
          <p>Dein strukturierter Lernpfad mit Videos, Aufgaben und messbarem Fortschritt.</p>
          <div className="school-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${overallProgress}%` }} />
            </div>
            <div className="progress-meta">
              {completedLessons}/{totalLessons} Lektionen abgeschlossen - {overallProgress}% Gesamtfortschritt
            </div>
          </div>
          <div className="school-metrics">
            <div className="metric-card">
              <span>Gesehene Zeit</span>
              <strong>{formatMinutes(watchedMinutes)}</strong>
            </div>
            <div className="metric-card">
              <span>Gesamtzeit</span>
              <strong>{formatMinutes(totalMinutes)}</strong>
            </div>
            <div className="metric-card">
              <span>Naechste Lektion</span>
              <strong>{nextLesson?.title ?? 'Alles erledigt'}</strong>
            </div>
          </div>
        </div>
        <div className="school-player">
          {activeEmbed ? (
            <div className="player-embed">
              <iframe
                src={activeEmbed}
                title={activeLesson?.title ?? 'Video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="player-thumb">Video</div>
          )}
          <div className="player-meta">
            <div>
              <div className="player-title">{activeLesson?.title ?? 'Video auswaehlen'}</div>
              <div className="player-sub">
                {activeLesson?.moduleTitle ?? ''} - {activeLesson?.duration ?? ''}
              </div>
            </div>
            <span className="player-pill">
              {activeLesson && progress.lessons[activeLesson.id] ? 'Fertig' : 'Weiter'}
            </span>
          </div>
          <div className="player-actions">
            <button
              className="primary"
              onClick={() => {
                if (activeLesson?.id) setActiveLesson(activeLesson.id)
              }}
            >
              Video starten
            </button>
            <button
              className="ghost"
              onClick={() => {
                if (activeLesson?.id) toggleLesson(activeLesson.id)
              }}
            >
              {activeLesson && progress.lessons[activeLesson.id] ? 'Als offen markieren' : 'Als gesehen markieren'}
            </button>
          </div>
        </div>
      </div>

      <div className="page-card school-curriculum">
        <div className="panel-head">
          <h2>Curriculum</h2>
          <div className="muted">Lektion anklicken, Fortschritt abhaken</div>
        </div>
        <div className="school-modules">
          {modules.map((module, index) => {
            const completed = module.lessons.filter((lesson) => progress.lessons[lesson.id]).length
            const progressValue =
              module.lessons.length === 0 ? 0 : Math.round((completed / module.lessons.length) * 100)
            return (
              <div key={module.id} className="module-card">
                <div className="module-head">
                  <div>
                    <div className="module-title">
                      {String(index + 1).padStart(2, '0')} {module.title}
                    </div>
                    <div className="module-sub">{module.summary}</div>
                  </div>
                  <div className="module-progress">
                    <span>
                      {completed}/{module.lessons.length} Lektionen
                    </span>
                    <div className="progress-bar small">
                      <div className="progress-fill" style={{ width: `${progressValue}%` }} />
                    </div>
                  </div>
                </div>
                <div className="lesson-grid">
                  {module.lessons.map((lesson) => {
                    const isCompleted = progress.lessons[lesson.id]
                    return (
                      <div key={lesson.id} className={`lesson-card ${isCompleted ? 'completed' : ''}`}>
                        <div className="lesson-row">
                          <div className="lesson-title">{lesson.title}</div>
                          <div className="lesson-duration">{lesson.duration}</div>
                        </div>
                        <div className="lesson-sub">{lesson.summary}</div>
                        <div className="lesson-actions">
                          <button className="lesson-play" onClick={() => setActiveLesson(lesson.id)}>
                            &gt;
                          </button>
                          <label className="lesson-check">
                            <span className="uiverse-checkbox">
                              <input
                                type="checkbox"
                                checked={isCompleted}
                                onChange={() => toggleLesson(lesson.id)}
                              />
                              <span className="checkmark" />
                            </span>
                            Fertig
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default SchoolPage
