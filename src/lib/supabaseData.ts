import type {
  AssessmentResult,
  BookingEntry,
  DeadlineLogEntry,
  Plan,
  Profile,
  SchoolContent,
  SchoolProgress,
  StressEntry,
  ThesisDocument,
  ThesisChecklistItem,
  TodoItem,
} from './storage'
import { todayIso } from './storage'
import { supabase, supabaseEnabled } from './supabaseClient'

const isEnabled = () => supabaseEnabled && supabase

export const loadProfile = async (userId: string): Promise<Profile | null> => {
  if (!isEnabled()) return null
  const { data, error } = await supabase!
    .from('profiles')
    .select('studiengang,hochschule,abgabedatum,status,zielnote')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null

  return {
    studiengang: data.studiengang ?? '',
    hochschule: data.hochschule ?? '',
    abgabedatum: data.abgabedatum ?? todayIso(),
    status: String(data.status ?? 0) as Profile['status'],
    zielnote: (data.zielnote ?? '1,3') as Profile['zielnote'],
  }
}

export const saveProfile = async (userId: string, profile: Profile) => {
  if (!isEnabled()) return
  await supabase!
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        studiengang: profile.studiengang,
        hochschule: profile.hochschule ?? null,
        abgabedatum: profile.abgabedatum,
        status: Number(profile.status),
        zielnote: profile.zielnote,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
}

export const loadPlan = async (userId: string): Promise<Plan | null> => {
  if (!isEnabled()) return null
  const { data, error } = await supabase!.from('user_plans').select('plan').eq('user_id', userId).maybeSingle()
  if (error || !data) return null
  return (data.plan ?? 'free') as Plan
}

export const savePlan = async (userId: string, plan: Plan) => {
  if (!isEnabled()) return
  await supabase!
    .from('user_plans')
    .upsert({ user_id: userId, plan, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
}

export const hasPaidCoachingPlan = async (userId: string, plan: Plan): Promise<boolean> => {
  if (plan === 'free') return false
  if (!isEnabled()) return false

  const { data, error } = await supabase!
    .from('finance_events')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .eq('plan', plan)
    .limit(1)

  if (error) return false
  return (data?.length ?? 0) > 0
}

export const loadAssessment = async (userId: string): Promise<AssessmentResult | null> => {
  if (!isEnabled()) return null
  const { data, error } = await supabase!
    .from('assessment_results')
    .select('answers,score,recommended_plan,reasons,completed_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null

  return {
    answers: (data.answers ?? {}) as Record<string, string>,
    score: data.score ?? 0,
    recommendedPlan: (data.recommended_plan ?? 'free') as Plan,
    reasons: (data.reasons ?? []) as string[],
    completedAt: data.completed_at ?? new Date().toISOString(),
  }
}

export const saveAssessment = async (userId: string, assessment: AssessmentResult) => {
  if (!isEnabled()) return
  await supabase!
    .from('assessment_results')
    .upsert(
      {
        user_id: userId,
        answers: assessment.answers,
        score: assessment.score,
        recommended_plan: assessment.recommendedPlan,
        reasons: assessment.reasons,
        completed_at: assessment.completedAt,
      },
      { onConflict: 'user_id' }
    )
}

export const loadSchoolProgress = async (userId: string): Promise<SchoolProgress | null> => {
  if (!isEnabled()) return null
  const { data, error } = await supabase!
    .from('school_progress')
    .select('lessons,last_lesson_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null

  return {
    lessons: (data.lessons ?? {}) as Record<string, boolean>,
    lastLessonId: data.last_lesson_id ?? undefined,
  }
}

export const loadSchoolContent = async (): Promise<SchoolContent | null> => {
  if (!isEnabled()) return null
  const { data, error } = await supabase!
    .from('school_content')
    .select('modules')
    .eq('id', 'default')
    .maybeSingle()
  if (error || !data) return null
  return { modules: (data.modules ?? []) as SchoolContent['modules'] }
}

export const saveSchoolProgress = async (userId: string, progress: SchoolProgress) => {
  if (!isEnabled()) return
  await supabase!
    .from('school_progress')
    .upsert(
      {
        user_id: userId,
        lessons: progress.lessons,
        last_lesson_id: progress.lastLessonId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
}

export const loadTodos = async (userId: string): Promise<TodoItem[]> => {
  if (!isEnabled()) return []
  const { data, error } = await supabase!
    .from('todos')
    .select('id,title,detail,due_date')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    title: row.title ?? '',
    detail: row.detail ?? '',
    date: row.due_date ?? todayIso(),
    done: false,
  }))
}

export const replaceTodos = async (userId: string, todos: TodoItem[]) => {
  if (!isEnabled()) return
  await supabase!.from('todos').delete().eq('user_id', userId)
  if (todos.length === 0) return
  const payload = todos.map((todo) => ({
    id: todo.id,
    user_id: userId,
    title: todo.title,
    detail: todo.detail,
    due_date: todo.date,
  }))
  await supabase!.from('todos').insert(payload)
}

export const loadThesisDocuments = async (userId: string): Promise<ThesisDocument[]> => {
  if (!isEnabled()) return []
  const { data, error } = await supabase!
    .from('thesis_documents')
    .select('id,name,size,type,last_modified,uploaded_at')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false })
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    name: row.name ?? '',
    size: row.size ?? 0,
    type: row.type ?? '',
    lastModified: row.last_modified ?? 0,
    uploadedAt: row.uploaded_at ?? new Date().toISOString(),
  }))
}

export const replaceThesisDocuments = async (userId: string, documents: ThesisDocument[]) => {
  if (!isEnabled()) return
  await supabase!.from('thesis_documents').delete().eq('user_id', userId)
  if (documents.length === 0) return
  const payload = documents.map((doc) => ({
    id: doc.id,
    user_id: userId,
    name: doc.name,
    size: doc.size,
    type: doc.type,
    last_modified: doc.lastModified,
    uploaded_at: doc.uploadedAt,
  }))
  await supabase!.from('thesis_documents').insert(payload)
}

export const loadThesisChecklist = async (userId: string): Promise<ThesisChecklistItem[] | null> => {
  if (!isEnabled()) return null
  const { data, error } = await supabase!
    .from('thesis_checklist')
    .select('items')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return (data.items ?? []) as ThesisChecklistItem[]
}

export const replaceThesisChecklist = async (userId: string, items: ThesisChecklistItem[]) => {
  if (!isEnabled()) return
  await supabase!
    .from('thesis_checklist')
    .upsert(
      { user_id: userId, items, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
}

export const loadBookings = async (userId: string): Promise<BookingEntry[]> => {
  if (!isEnabled()) return []
  const { data, error } = await supabase!
    .from('phd_bookings')
    .select('booking_date,booking_time,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data.map((row) => ({
    date: row.booking_date,
    time: row.booking_time,
    createdAt: row.created_at,
  }))
}

export const saveBooking = async (userId: string, booking: BookingEntry) => {
  if (!isEnabled()) return
  await supabase!.from('phd_bookings').insert({
    user_id: userId,
    booking_date: booking.date,
    booking_time: booking.time,
    created_at: booking.createdAt,
  })
}

export const appendDeadlineLog = async (userId: string, entry: DeadlineLogEntry) => {
  if (!isEnabled()) return
  await supabase!
    .from('deadline_logs')
    .upsert(
      {
        user_id: userId,
        deadline_date: entry.date,
        recorded_at: entry.recordedAt,
      },
      { onConflict: 'user_id,deadline_date' }
    )
}

export const loadMentalHealthLogs = async (userId: string): Promise<StressEntry[]> => {
  if (!isEnabled()) return []
  const { data, error } = await supabase!
    .from('mental_health_logs')
    .select('value,logged_at,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(60)
  if (error || !data) return []
  return data.map((row) => ({
    date: row.logged_at,
    value: row.value,
  }))
}

export const insertMentalHealthLog = async (userId: string, entry: StressEntry) => {
  if (!isEnabled()) return
  await supabase!.from('mental_health_logs').insert({
    user_id: userId,
    value: entry.value,
    logged_at: entry.date,
  })
}
