import { Clock3, FolderTree, GraduationCap, PlayCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { loadSchoolContent, loadSchoolProgress, saveSchoolProgress } from '../lib/supabaseData'
import { STORAGE_KEYS, parseJson } from '../lib/storage'
import type { SchoolContent, SchoolModule, SchoolProgress } from '../lib/storage'

const DEMO_SCHOOL_CONTENT: SchoolContent = {
  modules: [
    {
      id: 'demo-methodik',
      title: 'Methodik Grundlagen',
      summary: 'Forschungsfrage, Aufbau und roter Faden fuer deine Arbeit.',
      lessons: [
        {
          id: 'demo-methodik-v1',
          title: 'V1 Forschungsfrage praezisieren',
          duration: '12:00',
          summary: 'Wie du aus einem Thema eine pruefbare Frage ableitest.',
          embedUrl: 'https://www.youtube.com/watch?v=Q33KBiDriJY',
        },
        {
          id: 'demo-methodik-v2',
          title: 'V2 Aufbau der Methodik',
          duration: '15:00',
          summary: 'Struktur fuer Design, Stichprobe und Vorgehen.',
          embedUrl: 'https://www.youtube.com/watch?v=VfGW0Qiy2I0',
        },
        {
          id: 'demo-methodik-v3',
          title: 'V3 Guetekriterien',
          duration: '10:00',
          summary: 'Reliabilitaet, Validitaet und praktische Einordnung.',
          embedUrl: 'https://www.youtube.com/watch?v=aircAruvnKk',
        },
      ],
    },
    {
      id: 'demo-schreiben',
      title: 'Wissenschaftliches Schreiben',
      summary: 'Klare Kapitel, starke Argumentation, saubere Uebergaenge.',
      lessons: [
        {
          id: 'demo-schreiben-v1',
          title: 'V1 Kapitel logisch aufbauen',
          duration: '11:00',
          summary: 'Von Gliederung zu stringenter Argumentationslinie.',
          embedUrl: 'https://www.youtube.com/watch?v=5MgBikgcWnY',
        },
        {
          id: 'demo-schreiben-v2',
          title: 'V2 Zitate und Quellenarbeit',
          duration: '13:00',
          summary: 'Quellen korrekt einbinden und Plagiate vermeiden.',
          embedUrl: 'https://www.youtube.com/watch?v=PkZNo7MFNFg',
        },
      ],
    },
  ],
}

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

const toEmbedUrl = (url: string) => {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    if (host.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '').trim()
      return id ? `https://www.youtube.com/embed/${id}` : url
    }

    if (host.includes('youtube.com')) {
      if (parsed.pathname.includes('/embed/')) return url
      const id = parsed.searchParams.get('v')?.trim()
      return id ? `https://www.youtube.com/embed/${id}` : url
    }

    return url
  } catch {
    return url
  }
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
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const { user } = useAuth()

  const storedModules = content.modules ?? []
  const isDemoContent = storedModules.length === 0
  const modules = isDemoContent ? DEMO_SCHOOL_CONTENT.modules : storedModules

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
  const activeEmbed = toEmbedUrl(activeLesson?.embedUrl?.trim() ?? '')
  const selectedModule = modules.find((module) => module.id === selectedModuleId) ?? modules[0]
  const selectedLessons = selectedModule?.lessons ?? []
  const nextLessonInSelected = selectedLessons.find((lesson) => !progress.lessons[lesson.id]) ?? selectedLessons[0]

  useEffect(() => {
    if (modules.length === 0) return
    if (selectedModuleId && modules.some((module) => module.id === selectedModuleId)) return
    const fallbackModuleId = activeLesson?.moduleId ?? modules[0]?.id ?? null
    setSelectedModuleId(fallbackModuleId)
  }, [modules, selectedModuleId, activeLesson?.moduleId])

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
      <section className="school-page-shell school-loading-card">
        <h1>Online School</h1>
        <p>Inhalte werden geladen...</p>
      </section>
    )
  }

  return (
    <section className="school-page-shell">
      <aside className="school-side school-side-left">
        <div className="school-side-head">
          <div className="school-side-badge">
            <GraduationCap size={16} />
          </div>
          <div>
            <p className="school-overline">ELEA School</p>
            <h2>Kurse & Lernpfad</h2>
          </div>
        </div>

        <div className="school-side-title-row">
          <h3>Module</h3>
          <span>{modules.length}</span>
        </div>

        <div className="school-module-list">
          {modules.map((module, index) => {
            const completed = module.lessons.filter((lesson) => progress.lessons[lesson.id]).length
            const percent = module.lessons.length === 0 ? 0 : Math.round((completed / module.lessons.length) * 100)
            const firstLessonId = module.lessons[0]?.id
            const active = selectedModule?.id === module.id

            return (
              <button
                key={module.id}
                type="button"
                className={`school-module-button ${active ? 'active' : ''}`}
                onClick={() => {
                  setSelectedModuleId(module.id)
                  if (firstLessonId) setActiveLesson(firstLessonId)
                }}
              >
                <div className="school-module-head">
                  <span>
                    {String(index + 1).padStart(2, '0')} {module.title}
                  </span>
                  <strong>{percent}%</strong>
                </div>
                <p>{module.summary}</p>
              </button>
            )
          })}
        </div>

        <div className="school-side-note">
          <p className="school-side-note-title">YouTube Einbettung</p>
          <p>Deine spaetere Admin-Plattform kann pro Lektion einfach die `embedUrl` speichern.</p>
          {isDemoContent && <p className="school-side-note-demo">Demo-Inhalte aktiv bis echte School-Daten hinterlegt sind.</p>}
        </div>
      </aside>

      <main className="school-main">
        <header className="school-main-head">
          <p className="school-overline">Online School</p>
          <h1>{selectedModule?.title ?? 'Lernmodul'}</h1>
          <p>Waehle oben ein Video (V1, V2, V3 ...). Unten wird die gewaehlte Lektion abgespielt.</p>
        </header>

        <section className="school-lesson-strip">
          {selectedLessons.map((lesson, index) => {
            const isActive = activeLesson?.id === lesson.id
            return (
              <button
                key={lesson.id}
                type="button"
                className={`school-lesson-tile ${isActive ? 'active' : ''}`}
                onClick={() => setActiveLesson(lesson.id)}
              >
                <div className="school-lesson-tile-top">
                  <span className="school-lesson-tag">V{index + 1}</span>
                  <span className="school-lesson-time">
                    <Clock3 size={12} />
                    {lesson.duration}
                  </span>
                </div>
                <strong>{lesson.title}</strong>
                <p>{lesson.summary}</p>
              </button>
            )
          })}
          {selectedLessons.length === 0 && (
            <div className="school-lesson-empty">
              Fuer dieses Modul sind noch keine Videos hinterlegt.
            </div>
          )}
        </section>

        <section className="school-player-card">
          <div className="school-player-frame">
            {activeEmbed ? (
              <iframe
                src={activeEmbed}
                title={activeLesson?.title ?? 'Video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <div className="school-player-empty">
                <PlayCircle size={18} />
                Kein Video-Link hinterlegt
              </div>
            )}
          </div>

          <div className="school-player-meta">
            <div>
              <h3>{activeLesson?.title ?? 'Video auswaehlen'}</h3>
              <p>
                {activeLesson?.moduleTitle ?? 'Kein Modul'} - {activeLesson?.duration ?? '--'}
              </p>
            </div>
            <span className={`school-chip ${activeLesson && progress.lessons[activeLesson.id] ? 'done' : ''}`}>
              {activeLesson && progress.lessons[activeLesson.id] ? 'Fertig' : 'Weiter'}
            </span>
          </div>

          <div className="school-player-actions">
            <button
              type="button"
              className="school-btn school-btn-primary"
              onClick={() => {
                if (activeLesson?.id) toggleLesson(activeLesson.id)
              }}
            >
              {activeLesson && progress.lessons[activeLesson.id] ? 'Als offen markieren' : 'Als gesehen markieren'}
            </button>
            <button
              type="button"
              className="school-btn school-btn-ghost"
              onClick={() => {
                if (nextLessonInSelected?.id) setActiveLesson(nextLessonInSelected.id)
              }}
            >
              Naechste Lektion
            </button>
          </div>
        </section>
      </main>

      <aside className="school-side school-side-right">
        <div className="school-side-title-row">
          <h3>Lernstatus</h3>
        </div>

        <div className="school-stats">
          <div className="school-stat-card">
            <p>Gesamtfortschritt</p>
            <strong>{overallProgress}%</strong>
          </div>
          <div className="school-stat-card">
            <p>Gesehene Zeit</p>
            <strong>{formatMinutes(watchedMinutes)}</strong>
          </div>
          <div className="school-stat-card">
            <p>Gesamtzeit</p>
            <strong>{formatMinutes(totalMinutes)}</strong>
          </div>
        </div>

        <div className="school-quick-card">
          <p className="school-quick-label">Naechste Lektion</p>
          <h4>{nextLesson?.title ?? 'Alles erledigt'}</h4>
          <button
            type="button"
            className="school-btn school-btn-ghost full"
            onClick={() => {
              if (nextLesson?.id) setActiveLesson(nextLesson.id)
            }}
          >
            Jetzt oeffnen
          </button>
        </div>

        <div className="school-quick-card">
          <div className="school-quick-head">
            <FolderTree size={15} />
            <span>Admin-ready Struktur</span>
          </div>
          <p>YouTube-Iframes werden direkt aus der `embedUrl` jeder Lektion geladen.</p>
        </div>
      </aside>
    </section>
  )
}

export default SchoolPage
