import { supabase, supabaseEnabled } from './supabaseClient'

type Plan = 'free' | 'basic' | 'pro'

type ActivityEventType =
  | 'login_success'
  | 'register_success'
  | 'logout'
  | 'page_view'
  | 'upload'
  | 'checkout_started'
  | 'error'

type ActivityEventInput = {
  eventType: ActivityEventType
  userId?: string | null
  email?: string | null
  pagePath?: string | null
  metadata?: Record<string, unknown>
}

type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical'

type SecurityEventInput = {
  severity: SecuritySeverity
  category: string
  title: string
  userId?: string | null
  details?: Record<string, unknown>
}

type OpsTaskInput = {
  title: string
  assigneeEmail?: string | null
  relatedUserId?: string | null
  relatedDocumentId?: string | null
  dueAt?: string | null
  notes?: string | null
}

type FinanceEventInput = {
  userId?: string | null
  plan: Plan
  amountCents: number
  status: 'initiated' | 'paid' | 'failed'
  source: string
  currency?: string
}

type ActivityRow = {
  user_id: string | null
  email: string | null
  event_type: string
  page_path: string | null
  session_id: string | null
  device_type: string | null
  os_name: string | null
  browser_name: string | null
  country: string | null
  city: string | null
  created_at: string
}

type ProfileRow = {
  user_id: string
  studiengang: string | null
  hochschule: string | null
  abgabedatum: string | null
  status: number | null
  zielnote: string | null
}

type PlanRow = {
  user_id: string
  plan: Plan
}

type TodoRow = {
  id: string
  user_id: string | null
  title: string
  due_date: string | null
  created_at: string
}

type ThesisDocRow = {
  id: string
  user_id: string | null
  name: string
  uploaded_at: string
  size: number
}

type FinanceRow = {
  id: string
  user_id: string | null
  plan: Plan
  amount_cents: number
  currency: string
  status: 'initiated' | 'paid' | 'failed'
  source: string
  created_at: string
}

type ScoreJobRow = {
  id: string
  user_id: string | null
  document_id: string | null
  status: 'queued' | 'running' | 'done' | 'failed'
  score: number | null
  assigned_to_email: string | null
  created_at: string
  updated_at: string
}

type SecurityRow = {
  id: string
  severity: SecuritySeverity
  category: string
  title: string
  details: Record<string, unknown> | null
  resolved: boolean
  created_at: string
}

type OpsTaskRow = {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'blocked' | 'done'
  priority: 'low' | 'medium' | 'high' | 'critical'
  assignee_email: string | null
  related_user_id: string | null
  related_document_id: string | null
  due_at: string | null
  notes: string | null
  created_at: string
}

export type AdminUserSummary = {
  userId: string
  email: string
  plan: Plan
  study: string
  deadline: string
  tasks: number
  documents: number
  devices: number
  latestLocation: string
  lastSeen: string
}

export type AdminOpsUpload = {
  id: string
  userId: string
  userEmail: string
  fileName: string
  sizeMB: number
  uploadedAt: string
  taskStatus: 'offen' | 'zugewiesen'
}

export type AdminOpsTask = {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'blocked' | 'done'
  priority: 'low' | 'medium' | 'high' | 'critical'
  assigneeEmail: string
  dueAt: string
  relatedUserId: string
  relatedDocumentId: string
  notes: string
}

export type AdminSecurityAlert = {
  id: string
  severity: SecuritySeverity
  category: string
  title: string
  createdAt: string
  resolved: boolean
}

export type AdminSnapshot = {
  usersTotal: number
  plans: Record<Plan, number>
  trafficPageViews30d: number
  trafficUniqueSessions30d: number
  trafficDaily: Array<{ day: string; views: number }>
  topPages: Array<{ path: string; views: number }>
  deviceSplit: Array<{ label: string; count: number }>
  countrySplit: Array<{ label: string; count: number }>
  activeUsers30d: number
  finance: {
    grossPaidEur: number
    initiatedCount: number
    paidCount: number
    failedCount: number
  }
  scoreJobs: {
    queued: number
    running: number
    done: number
    failed: number
  }
  security: {
    openCount: number
    criticalCount: number
  }
  users: AdminUserSummary[]
  uploads: AdminOpsUpload[]
  tasks: AdminOpsTask[]
  alerts: AdminSecurityAlert[]
}

const isEnabled = () => supabaseEnabled && supabase

const safeArray = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : [])

const safeSelect = async <T>(
  table: string,
  columns: string,
  mutate?: (query: any) => any
): Promise<T[]> => {
  if (!isEnabled()) return []
  try {
    let query: any = supabase!.from(table).select(columns)
    if (mutate) {
      query = mutate(query)
    }
    const { data, error } = await query
    if (error || !data) return []
    return data as T[]
  } catch {
    return []
  }
}

const now = () => new Date()

const agoIso = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

const normalizeText = (value: string | null | undefined, fallback = 'Unbekannt') => {
  if (!value || value.trim().length === 0) return fallback
  return value
}

const uaDevice = (ua: string) => {
  const input = ua.toLowerCase()
  if (/mobile|iphone|android/.test(input)) return 'mobile'
  if (/ipad|tablet/.test(input)) return 'tablet'
  return 'desktop'
}

const uaBrowser = (ua: string) => {
  const input = ua.toLowerCase()
  if (input.includes('edg/')) return 'Edge'
  if (input.includes('chrome/')) return 'Chrome'
  if (input.includes('safari/') && !input.includes('chrome/')) return 'Safari'
  if (input.includes('firefox/')) return 'Firefox'
  return 'Unknown'
}

const uaOs = (ua: string) => {
  const input = ua.toLowerCase()
  if (input.includes('windows')) return 'Windows'
  if (input.includes('mac os')) return 'macOS'
  if (input.includes('android')) return 'Android'
  if (input.includes('iphone') || input.includes('ipad')) return 'iOS'
  if (input.includes('linux')) return 'Linux'
  return 'Unknown'
}

const getSessionId = () => {
  const key = 'elea_session_id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const next = `sess_${Math.random().toString(36).slice(2, 11)}`
  localStorage.setItem(key, next)
  return next
}

const getDeviceFingerprint = () => {
  const key = 'elea_device_id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const ua = navigator.userAgent ?? 'unknown'
  const raw = `${ua}|${navigator.language}|${navigator.platform}`
  const next = `dev_${btoa(raw).replace(/[^a-zA-Z0-9]/g, '').slice(0, 18)}`
  localStorage.setItem(key, next)
  return next
}

export const trackActivityEvent = async (input: ActivityEventInput) => {
  if (!isEnabled()) return

  const ua = navigator.userAgent ?? 'Unknown'
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Unknown'
  const locale = navigator.language ?? 'Unknown'

  void supabase!.from('user_activity_events').insert({
    user_id: input.userId ?? null,
    email: input.email ?? null,
    event_type: input.eventType,
    page_path: input.pagePath ?? null,
    referrer: document.referrer || null,
    session_id: getSessionId(),
    device_fingerprint: getDeviceFingerprint(),
    device_type: uaDevice(ua),
    os_name: uaOs(ua),
    browser_name: uaBrowser(ua),
    country: locale.split('-')[1] ?? null,
    city: null,
    metadata: {
      timezone,
      locale,
      ...input.metadata,
    },
  })
}

export const recordSecurityEvent = async (input: SecurityEventInput) => {
  if (!isEnabled()) return
  void supabase!.from('security_events').insert({
    severity: input.severity,
    category: input.category,
    title: input.title,
    user_id: input.userId ?? null,
    details: input.details ?? {},
    resolved: false,
  })
}

export const recordFinanceEvent = async (input: FinanceEventInput) => {
  if (!isEnabled()) return
  void supabase!.from('finance_events').insert({
    user_id: input.userId ?? null,
    plan: input.plan,
    amount_cents: input.amountCents,
    currency: input.currency ?? 'EUR',
    status: input.status,
    source: input.source,
  })
}

export const createOpsTask = async (input: OpsTaskInput) => {
  if (!isEnabled()) return { ok: false as const, message: 'Supabase nicht konfiguriert' }
  const { error } = await supabase!.from('ops_tasks').insert({
    title: input.title,
    status: 'todo',
    priority: 'medium',
    assignee_email: input.assigneeEmail ?? null,
    related_user_id: input.relatedUserId ?? null,
    related_document_id: input.relatedDocumentId ?? null,
    due_at: input.dueAt ?? null,
    notes: input.notes ?? null,
  })
  if (error) return { ok: false as const, message: error.message }
  return { ok: true as const }
}

const dayKey = (iso: string) => iso.slice(0, 10)

const formatEur = (value: number) => Math.round(value * 100) / 100

const defaultSnapshot = (): AdminSnapshot => ({
  usersTotal: 0,
  plans: { free: 0, basic: 0, pro: 0 },
  trafficPageViews30d: 0,
  trafficUniqueSessions30d: 0,
  trafficDaily: [],
  topPages: [],
  deviceSplit: [],
  countrySplit: [],
  activeUsers30d: 0,
  finance: {
    grossPaidEur: 0,
    initiatedCount: 0,
    paidCount: 0,
    failedCount: 0,
  },
  scoreJobs: { queued: 0, running: 0, done: 0, failed: 0 },
  security: { openCount: 0, criticalCount: 0 },
  users: [],
  uploads: [],
  tasks: [],
  alerts: [],
})

export const loadAdminSnapshot = async (): Promise<AdminSnapshot> => {
  if (!isEnabled()) return defaultSnapshot()

  const [
    profiles,
    plans,
    todos,
    docs,
    activity,
    financeRows,
    jobs,
    alerts,
    tasks,
  ] = await Promise.all([
    safeSelect<ProfileRow>('profiles', 'user_id,studiengang,hochschule,abgabedatum,status,zielnote'),
    safeSelect<PlanRow>('user_plans', 'user_id,plan'),
    safeSelect<TodoRow>('todos', 'id,user_id,title,due_date,created_at'),
    safeSelect<ThesisDocRow>('thesis_documents', 'id,user_id,name,uploaded_at,size'),
    safeSelect<ActivityRow>(
      'user_activity_events',
      'user_id,email,event_type,page_path,session_id,device_type,os_name,browser_name,country,city,created_at',
      (query) => query.gte('created_at', agoIso(30)).order('created_at', { ascending: false }).limit(2000)
    ),
    safeSelect<FinanceRow>('finance_events', 'id,user_id,plan,amount_cents,currency,status,source,created_at'),
    safeSelect<ScoreJobRow>(
      'score_jobs',
      'id,user_id,document_id,status,score,assigned_to_email,created_at,updated_at',
      (query) => query.order('updated_at', { ascending: false }).limit(120)
    ),
    safeSelect<SecurityRow>(
      'security_events',
      'id,severity,category,title,details,resolved,created_at',
      (query) => query.order('created_at', { ascending: false }).limit(120)
    ),
    safeSelect<OpsTaskRow>(
      'ops_tasks',
      'id,title,status,priority,assignee_email,related_user_id,related_document_id,due_at,notes,created_at',
      (query) => query.order('created_at', { ascending: false }).limit(160)
    ),
  ])

  const planMap = new Map<string, Plan>()
  safeArray(plans).forEach((row) => planMap.set(row.user_id, row.plan))

  const activityByUser = new Map<string, ActivityRow[]>()
  const emailByUser = new Map<string, string>()
  const sessions = new Set<string>()
  const pageViews = safeArray(activity).filter((row) => row.event_type === 'page_view')
  const pageCountMap = new Map<string, number>()
  const deviceCountMap = new Map<string, number>()
  const countryCountMap = new Map<string, number>()
  const dailyCountMap = new Map<string, number>()

  safeArray(activity).forEach((row) => {
    if (row.session_id) sessions.add(row.session_id)
    if (row.user_id) {
      const bucket = activityByUser.get(row.user_id) ?? []
      bucket.push(row)
      activityByUser.set(row.user_id, bucket)
      if (row.email) emailByUser.set(row.user_id, row.email)
    }
    const device = normalizeText(row.device_type, 'unknown')
    deviceCountMap.set(device, (deviceCountMap.get(device) ?? 0) + 1)
    const country = normalizeText(row.country, 'unknown')
    countryCountMap.set(country, (countryCountMap.get(country) ?? 0) + 1)
  })

  pageViews.forEach((row) => {
    const path = normalizeText(row.page_path, '/unknown')
    pageCountMap.set(path, (pageCountMap.get(path) ?? 0) + 1)
    const day = dayKey(row.created_at)
    dailyCountMap.set(day, (dailyCountMap.get(day) ?? 0) + 1)
  })

  const todosByUser = new Map<string, number>()
  safeArray(todos).forEach((row) => {
    if (!row.user_id) return
    todosByUser.set(row.user_id, (todosByUser.get(row.user_id) ?? 0) + 1)
  })

  const docsByUser = new Map<string, ThesisDocRow[]>()
  safeArray(docs).forEach((row) => {
    if (!row.user_id) return
    const bucket = docsByUser.get(row.user_id) ?? []
    bucket.push(row)
    docsByUser.set(row.user_id, bucket)
  })

  const userSummaries: AdminUserSummary[] = safeArray(profiles)
    .map((profile) => {
      const events = activityByUser.get(profile.user_id) ?? []
      const devices = new Set(events.map((event) => normalizeText(event.device_type, 'unknown')))
      const latest = events[0]
      const location = latest
        ? `${normalizeText(latest.city, latest.country ?? 'Unknown')}, ${normalizeText(latest.country, 'Unknown')}`
        : 'Unknown'
      return {
        userId: profile.user_id,
        email: emailByUser.get(profile.user_id) ?? 'n/a',
        plan: planMap.get(profile.user_id) ?? 'free',
        study: normalizeText(profile.studiengang, 'n/a'),
        deadline: normalizeText(profile.abgabedatum, 'n/a'),
        tasks: todosByUser.get(profile.user_id) ?? 0,
        documents: docsByUser.get(profile.user_id)?.length ?? 0,
        devices: devices.size,
        latestLocation: location,
        lastSeen: latest?.created_at ?? '',
      }
    })
    .sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''))

  const uploadRows: AdminOpsUpload[] = safeArray(docs)
    .map((doc) => {
      const email = (doc.user_id && emailByUser.get(doc.user_id)) ?? 'n/a'
      const hasTask = tasks.some((task) => task.related_document_id === doc.id)
      return {
        id: doc.id,
        userId: doc.user_id ?? '',
        userEmail: email,
        fileName: doc.name,
        sizeMB: Math.round((doc.size / 1024 / 1024) * 100) / 100,
        uploadedAt: doc.uploaded_at,
        taskStatus: hasTask ? ('zugewiesen' as const) : ('offen' as const),
      }
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 20)

  const paidRows = safeArray(financeRows).filter((row) => row.status === 'paid')
  const grossPaidEur = formatEur(
    paidRows
      .filter((row) => row.currency.toUpperCase() === 'EUR')
      .reduce((sum, row) => sum + (row.amount_cents ?? 0) / 100, 0)
  )

  const jobsCount = {
    queued: safeArray(jobs).filter((job) => job.status === 'queued').length,
    running: safeArray(jobs).filter((job) => job.status === 'running').length,
    done: safeArray(jobs).filter((job) => job.status === 'done').length,
    failed: safeArray(jobs).filter((job) => job.status === 'failed').length,
  }

  const alertsRows = safeArray(alerts)
  const openAlerts = alertsRows.filter((row) => !row.resolved)
  const criticalAlerts = openAlerts.filter((row) => row.severity === 'critical')

  const opsRows: AdminOpsTask[] = safeArray(tasks).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assigneeEmail: task.assignee_email ?? '',
    dueAt: task.due_at ?? '',
    relatedUserId: task.related_user_id ?? '',
    relatedDocumentId: task.related_document_id ?? '',
    notes: task.notes ?? '',
  }))

  const topPages = [...pageCountMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path, views]) => ({ path, views }))

  const trafficDaily = [...dailyCountMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, views]) => ({ day, views }))

  const toSplit = (map: Map<string, number>, max = 6) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([label, count]) => ({ label, count }))

  const activeUsers = new Set(safeArray(activity).map((row) => row.user_id).filter(Boolean as unknown as (v: string | null) => v is string))

  return {
    usersTotal: safeArray(profiles).length,
    plans: {
      free: safeArray(plans).filter((row) => row.plan === 'free').length,
      basic: safeArray(plans).filter((row) => row.plan === 'basic').length,
      pro: safeArray(plans).filter((row) => row.plan === 'pro').length,
    },
    trafficPageViews30d: pageViews.length,
    trafficUniqueSessions30d: sessions.size,
    trafficDaily,
    topPages,
    deviceSplit: toSplit(deviceCountMap),
    countrySplit: toSplit(countryCountMap),
    activeUsers30d: activeUsers.size,
    finance: {
      grossPaidEur,
      initiatedCount: safeArray(financeRows).filter((row) => row.status === 'initiated').length,
      paidCount: safeArray(financeRows).filter((row) => row.status === 'paid').length,
      failedCount: safeArray(financeRows).filter((row) => row.status === 'failed').length,
    },
    scoreJobs: jobsCount,
    security: {
      openCount: openAlerts.length,
      criticalCount: criticalAlerts.length,
    },
    users: userSummaries.slice(0, 20),
    uploads: uploadRows,
    tasks: opsRows.slice(0, 30),
    alerts: alertsRows.slice(0, 20).map((row) => ({
      id: row.id,
      severity: row.severity,
      category: row.category,
      title: row.title,
      createdAt: row.created_at,
      resolved: row.resolved,
    })),
  }
}

export const bootstrapAdminSessionEvent = async (userId?: string | null, email?: string | null) => {
  if (!isEnabled()) return
  await trackActivityEvent({
    eventType: 'login_success',
    userId: userId ?? null,
    email: email ?? null,
    pagePath: '/admin/login',
  })
}

export const nowIso = () => now().toISOString()
