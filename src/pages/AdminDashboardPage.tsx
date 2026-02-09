import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, AlertTriangle, Bell, ChartColumn, CircleCheck, FileText, RefreshCw, Search, Shield, Sparkles, Users } from 'lucide-react'
import LoadingTicker from '../components/LoadingTicker'
import { useAuth } from '../context/AuthContext'
import { hasConfiguredAdminEmails } from '../lib/admin'
import { type AdminSnapshot, createOpsTask, loadAdminSnapshot } from '../lib/adminData'

type Range = '7d' | '30d' | '90d'

const rangeToDays: Record<Range, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

const formatDate = (value: string) => {
  if (!value) return 'n/a'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const stateClass = (state: string) => {
  if (state === 'running' || state === 'in_progress') return 'is-running'
  if (state === 'queued' || state === 'todo') return 'is-queued'
  if (state === 'failed' || state === 'blocked') return 'is-failed'
  return 'is-done'
}

const severityClass = (severity: string) => {
  if (severity === 'critical') return 'is-failed'
  if (severity === 'high') return 'is-queued'
  return 'is-running'
}

const AdminDashboardPage = () => {
  const { user } = useAuth()
  const [range, setRange] = useState<Range>('30d')
  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [search, setSearch] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [assigneeEmail, setAssigneeEmail] = useState('')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [taskRelatedUserId, setTaskRelatedUserId] = useState('')
  const [taskRelatedDocId, setTaskRelatedDocId] = useState('')
  const [taskNotes, setTaskNotes] = useState('')
  const [taskMessage, setTaskMessage] = useState('')
  const [submittingTask, setSubmittingTask] = useState(false)

  const firstName = useMemo(() => {
    const email = user?.email ?? ''
    const local = email.split('@')[0] ?? ''
    if (!local) return 'Admin'
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((chunk) => `${chunk[0]?.toUpperCase() ?? ''}${chunk.slice(1)}`)
      .join(' ')
  }, [user?.email])

  const loadSnapshot = async () => {
    setLoading(true)
    const next = await loadAdminSnapshot()
    setSnapshot(next)
    setLoading(false)
  }

  useEffect(() => {
    void loadSnapshot()
  }, [])

  const filteredUsers = useMemo(() => {
    if (!snapshot) return []
    const needle = search.trim().toLowerCase()
    if (!needle) return snapshot.users
    return snapshot.users.filter((row) =>
      [row.email, row.study, row.userId, row.latestLocation].join(' ').toLowerCase().includes(needle)
    )
  }, [snapshot, search])

  const filteredUploads = useMemo(() => {
    if (!snapshot) return []
    const needle = search.trim().toLowerCase()
    if (!needle) return snapshot.uploads
    return snapshot.uploads.filter((row) =>
      [row.fileName, row.userEmail, row.userId, row.id].join(' ').toLowerCase().includes(needle)
    )
  }, [snapshot, search])

  const trafficDaily = useMemo(() => {
    if (!snapshot) return []
    const totalDays = rangeToDays[range]
    return snapshot.trafficDaily.slice(-totalDays)
  }, [snapshot, range])

  const maxTraffic = useMemo(() => Math.max(1, ...trafficDaily.map((item) => item.views)), [trafficDaily])

  const taskStatusCounts = useMemo(() => {
    const rows = snapshot?.tasks ?? []
    return {
      todo: rows.filter((row) => row.status === 'todo').length,
      progress: rows.filter((row) => row.status === 'in_progress').length,
      blocked: rows.filter((row) => row.status === 'blocked').length,
      done: rows.filter((row) => row.status === 'done').length,
    }
  }, [snapshot?.tasks])

  const planTotal = (snapshot?.plans.free ?? 0) + (snapshot?.plans.basic ?? 0) + (snapshot?.plans.pro ?? 0)
  const planPercent = (value: number) => (planTotal > 0 ? Math.round((value / planTotal) * 100) : 0)

  const handleAssignFromUpload = (upload: NonNullable<AdminSnapshot['uploads']>[number]) => {
    setTaskTitle(`Review: ${upload.fileName}`)
    setAssigneeEmail('')
    setTaskDueAt('')
    setTaskRelatedUserId(upload.userId)
    setTaskRelatedDocId(upload.id)
    setTaskNotes(`Upload von ${upload.userEmail}`)
    setTaskMessage('Upload in Task-Form übernommen.')
  }

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setTaskMessage('')
    if (!taskTitle.trim()) {
      setTaskMessage('Bitte einen Task-Titel eintragen.')
      return
    }
    setSubmittingTask(true)
    const result = await createOpsTask({
      title: taskTitle.trim(),
      assigneeEmail: assigneeEmail.trim() || null,
      dueAt: taskDueAt || null,
      relatedUserId: taskRelatedUserId || null,
      relatedDocumentId: taskRelatedDocId || null,
      notes: taskNotes.trim() || null,
    })
    setSubmittingTask(false)
    if (!result.ok) {
      setTaskMessage(result.message)
      return
    }
    setTaskTitle('')
    setAssigneeEmail('')
    setTaskDueAt('')
    setTaskRelatedUserId('')
    setTaskRelatedDocId('')
    setTaskNotes('')
    setTaskMessage('Task wurde erstellt.')
    await loadSnapshot()
  }

  if (loading && !snapshot) {
    return (
      <div className="page">
        <LoadingTicker
          className="page-loader"
          prefix="Admin lädt"
          words={['KPIs', 'Traffic', 'Uploads', 'Security', 'Aufgaben']}
        />
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-icon" aria-hidden="true">
            <Shield size={16} />
          </div>
          <div>
            <p className="admin-brand-kicker">ELEA</p>
            <p className="admin-brand-name">Founder Console</p>
          </div>
        </div>

        <div className="admin-nav-group">
          <p className="admin-nav-title">Core</p>
          <button className="admin-nav-item active" type="button">
            <ChartColumn size={16} />
            <span>Master Dashboard</span>
          </button>
          <button className="admin-nav-item" type="button">
            <Sparkles size={16} />
            <span>Elea Score Ops</span>
          </button>
          <button className="admin-nav-item" type="button">
            <Users size={16} />
            <span>User Intelligence</span>
          </button>
          <button className="admin-nav-item" type="button">
            <FileText size={16} />
            <span>Upload Queue</span>
          </button>
        </div>

        <div className="admin-nav-group">
          <p className="admin-nav-title">Risk & System</p>
          <button className="admin-nav-item" type="button">
            <Activity size={16} />
            <span>Traffic Analytics</span>
          </button>
          <button className="admin-nav-item" type="button">
            <AlertTriangle size={16} />
            <span>Security Alerts</span>
          </button>
          <button className="admin-nav-item" type="button">
            <Bell size={16} />
            <span>Audit & Events</span>
          </button>
        </div>

        <div className="admin-sidebar-note">
          <p>Umgebung</p>
          <strong>Production</strong>
          {!hasConfiguredAdminEmails() && <span>Hinweis: `VITE_ADMIN_EMAILS` ist noch nicht gesetzt.</span>}
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div className="admin-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="User, Upload, ID oder Ort suchen..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="admin-header-actions">
            <button className="admin-chip" type="button" onClick={() => void loadSnapshot()}>
              <RefreshCw size={14} />
              {loading ? (
                <LoadingTicker variant="inline" prefix="Lade" words={['KPIs', 'Traffic', 'Uploads', 'Scores', 'Alerts']} />
              ) : (
                <span>Refresh</span>
              )}
            </button>
            <button className="admin-chip" type="button">
              <Bell size={14} />
              <span>{snapshot?.security.openCount ?? 0} offene Alerts</span>
            </button>
            <button className="admin-avatar-chip" type="button">
              <span>{firstName}</span>
            </button>
          </div>
        </header>

        <div className="admin-kpi-grid">
          <article className="admin-kpi-card">
            <p>Accounts gesamt</p>
            <strong>{snapshot?.usersTotal ?? 0}</strong>
            <small>aktive User 30d: {snapshot?.activeUsers30d ?? 0}</small>
          </article>
          <article className="admin-kpi-card">
            <p>Traffic 30d</p>
            <strong>{snapshot?.trafficPageViews30d ?? 0}</strong>
            <small>Unique Sessions: {snapshot?.trafficUniqueSessions30d ?? 0}</small>
          </article>
          <article className="admin-kpi-card">
            <p>Finanz-Metrik (EUR)</p>
            <strong>{snapshot?.finance.grossPaidEur.toFixed(2) ?? '0.00'} €</strong>
            <small>
              paid: {snapshot?.finance.paidCount ?? 0} | started: {snapshot?.finance.initiatedCount ?? 0}
            </small>
          </article>
          <article className="admin-kpi-card highlight">
            <p>Sicherheitslage</p>
            <strong>{snapshot?.security.openCount ?? 0} offen</strong>
            <small>kritisch: {snapshot?.security.criticalCount ?? 0}</small>
          </article>
        </div>

        <div className="admin-content-grid admin-master-grid">
          <article className="admin-card admin-card-chart">
            <div className="admin-card-head">
              <h2>Traffic Verlauf</h2>
              <div className="admin-range-switch" role="tablist" aria-label="Zeitraum">
                {(['7d', '30d', '90d'] as Range[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={range === option ? 'active' : ''}
                    onClick={() => setRange(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="admin-bars" aria-label="Balkendiagramm Traffic">
              {trafficDaily.length === 0 && <p className="admin-empty">Keine Traffic-Daten in diesem Zeitraum.</p>}
              {trafficDaily.map((item) => (
                <div key={item.day} className="admin-bar-col">
                  <div className="admin-bar-track">
                    <div className="admin-bar-fill" style={{ height: `${(item.views / maxTraffic) * 100}%` }} />
                  </div>
                  <span>{item.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="admin-card admin-card-score">
            <div className="admin-card-head">
              <h2>PhD-Level Quality Score</h2>
              <span className="admin-pill">Founder Focus</span>
            </div>
            <p>
              Lassen Sie Ihre Abschlussarbeit (Bachelor, Master, PhD) vollständig oder in Teilen blitzschnell auf höchste
              wissenschaftliche Standards prüfen.
            </p>
            <ul>
              <li>Struktur, Inhalt, Methodik, Ergebnisse, Sprache, Zitationen, Originalität, Visuals, Ethik.</li>
              <li>80% weniger Review-Zeit im Vergleich zu manueller Analyse.</li>
              <li>+25-40% Notenpotenzial durch präzise Schwächen- und Verbesserungsanalyse.</li>
            </ul>
          </article>

          <article className="admin-card admin-card-channel">
            <div className="admin-card-head">
              <h2>Plan-Verteilung</h2>
            </div>
            <div className="admin-channel-list">
              <div className="admin-channel-row">
                <span>FREE</span>
                <strong>
                  {snapshot?.plans.free ?? 0} ({planPercent(snapshot?.plans.free ?? 0)}%)
                </strong>
              </div>
              <div className="admin-channel-row">
                <span>BASIC</span>
                <strong>
                  {snapshot?.plans.basic ?? 0} ({planPercent(snapshot?.plans.basic ?? 0)}%)
                </strong>
              </div>
              <div className="admin-channel-row">
                <span>PRO</span>
                <strong>
                  {snapshot?.plans.pro ?? 0} ({planPercent(snapshot?.plans.pro ?? 0)}%)
                </strong>
              </div>
            </div>
          </article>

          <article className="admin-card admin-card-jobs">
            <div className="admin-card-head">
              <h2>Score Job Queue</h2>
              <span className="admin-pill muted">Live</span>
            </div>
            <div className="admin-jobs">
              <div className="admin-job-row">
                <div className="admin-job-main">
                  <p>Queued</p>
                </div>
                <div className="admin-job-meta">
                  <span className="admin-state is-queued">{snapshot?.scoreJobs.queued ?? 0}</span>
                </div>
              </div>
              <div className="admin-job-row">
                <div className="admin-job-main">
                  <p>Running</p>
                </div>
                <div className="admin-job-meta">
                  <span className="admin-state is-running">{snapshot?.scoreJobs.running ?? 0}</span>
                </div>
              </div>
              <div className="admin-job-row">
                <div className="admin-job-main">
                  <p>Done</p>
                </div>
                <div className="admin-job-meta">
                  <span className="admin-state is-done">{snapshot?.scoreJobs.done ?? 0}</span>
                </div>
              </div>
              <div className="admin-job-row">
                <div className="admin-job-main">
                  <p>Failed</p>
                </div>
                <div className="admin-job-meta">
                  <span className="admin-state is-failed">{snapshot?.scoreJobs.failed ?? 0}</span>
                </div>
              </div>
            </div>
          </article>

          <article className="admin-card admin-card-security">
            <div className="admin-card-head">
              <h2>Security Alerts</h2>
              <span className="admin-pill muted">{snapshot?.alerts.length ?? 0} total</span>
            </div>
            <div className="admin-list-scroll">
              {(snapshot?.alerts ?? []).slice(0, 8).map((alert) => (
                <div key={alert.id} className="admin-list-row">
                  <div>
                    <strong>{alert.title}</strong>
                    <small>{alert.category}</small>
                  </div>
                  <div className="admin-job-meta">
                    <span className={`admin-state ${severityClass(alert.severity)}`}>{alert.severity}</span>
                    <small>{formatDate(alert.createdAt)}</small>
                  </div>
                </div>
              ))}
              {(snapshot?.alerts.length ?? 0) === 0 && <p className="admin-empty">Keine Security-Events vorhanden.</p>}
            </div>
          </article>

          <article className="admin-card admin-card-users">
            <div className="admin-card-head">
              <h2>User Accounts</h2>
              <span className="admin-pill muted">{filteredUsers.length} sichtbar</span>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Plan</th>
                    <th>Devices</th>
                    <th>Uploads</th>
                    <th>Tasks</th>
                    <th>Ort</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.slice(0, 16).map((row) => (
                    <tr key={row.userId}>
                      <td>
                        <div className="admin-cell-main">
                          <strong>{row.email}</strong>
                          <small>{row.study}</small>
                        </div>
                      </td>
                      <td>{row.plan.toUpperCase()}</td>
                      <td>{row.devices}</td>
                      <td>{row.documents}</td>
                      <td>{row.tasks}</td>
                      <td>{row.latestLocation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && <p className="admin-empty">Keine User-Daten gefunden.</p>}
            </div>
          </article>

          <article className="admin-card admin-card-uploads">
            <div className="admin-card-head">
              <h2>Upload Operations</h2>
              <span className="admin-pill muted">{filteredUploads.length} Uploads</span>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Datei</th>
                    <th>User</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUploads.slice(0, 14).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="admin-cell-main">
                          <strong>{row.fileName}</strong>
                          <small>{formatDate(row.uploadedAt)}</small>
                        </div>
                      </td>
                      <td>{row.userEmail}</td>
                      <td>{row.sizeMB} MB</td>
                      <td>{row.taskStatus}</td>
                      <td>
                        <button type="button" className="admin-mini-btn" onClick={() => handleAssignFromUpload(row)}>
                          Task anlegen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUploads.length === 0 && <p className="admin-empty">Keine Uploads vorhanden.</p>}
            </div>
          </article>

          <article className="admin-card admin-card-tasks">
            <div className="admin-card-head">
              <h2>Ops Tasks</h2>
              <span className="admin-pill muted">
                todo {taskStatusCounts.todo} | in-progress {taskStatusCounts.progress} | blocked {taskStatusCounts.blocked}
              </span>
            </div>
            <div className="admin-list-scroll">
              {(snapshot?.tasks ?? []).slice(0, 12).map((task) => (
                <div key={task.id} className="admin-list-row">
                  <div>
                    <strong>{task.title}</strong>
                    <small>{task.assigneeEmail || 'unassigned'}</small>
                  </div>
                  <div className="admin-job-meta">
                    <span className={`admin-state ${stateClass(task.status)}`}>{task.status}</span>
                    <small>{task.dueAt ? formatDate(task.dueAt) : 'kein due date'}</small>
                  </div>
                </div>
              ))}
              {(snapshot?.tasks.length ?? 0) === 0 && <p className="admin-empty">Noch keine Ops-Tasks vorhanden.</p>}
            </div>
          </article>

          <article className="admin-card admin-card-task-form">
            <div className="admin-card-head">
              <h2>Task erstellen / zuweisen</h2>
            </div>
            <form className="admin-task-form" onSubmit={handleCreateTask}>
              <input
                type="text"
                placeholder="Task Titel"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
              />
              <input
                type="email"
                placeholder="Assignee E-Mail (optional)"
                value={assigneeEmail}
                onChange={(event) => setAssigneeEmail(event.target.value)}
              />
              <input type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} />
              <input
                type="text"
                placeholder="Related User ID (optional)"
                value={taskRelatedUserId}
                onChange={(event) => setTaskRelatedUserId(event.target.value)}
              />
              <input
                type="text"
                placeholder="Related Document ID (optional)"
                value={taskRelatedDocId}
                onChange={(event) => setTaskRelatedDocId(event.target.value)}
              />
              <textarea
                placeholder="Notizen / Nächste Schritte"
                value={taskNotes}
                onChange={(event) => setTaskNotes(event.target.value)}
              />
              <button type="submit" disabled={submittingTask}>
                {submittingTask ? 'Speichere...' : 'Task speichern'}
              </button>
              {taskMessage && <p className="admin-task-message">{taskMessage}</p>}
            </form>
          </article>

          <article className="admin-card admin-card-health">
            <div className="admin-card-head">
              <h2>Traffic Insights</h2>
            </div>
            <div className="admin-health-grid">
              {(snapshot?.deviceSplit ?? []).slice(0, 4).map((item) => (
                <div key={`device-${item.label}`}>
                  <span>Device {item.label}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
              {(snapshot?.countrySplit ?? []).slice(0, 4).map((item) => (
                <div key={`country-${item.label}`}>
                  <span>Country {item.label}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
            <p className="admin-health-note">
              <CircleCheck size={14} />
              Top Pages: {(snapshot?.topPages ?? []).slice(0, 3).map((row) => row.path).join(' | ') || 'n/a'}
            </p>
          </article>
        </div>
      </section>
    </div>
  )
}

export default AdminDashboardPage
