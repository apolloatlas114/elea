import { supabase, supabaseEnabled } from './supabaseClient'

export type AuthUser = {
  id: string
  email: string
}

export type RegisterResult = {
  user: AuthUser | null
  email: string
  needsEmailConfirmation: boolean
}

const LOCAL_USER_KEY = 'elea_local_user'

const createLocalUser = (email: string): AuthUser => {
  const id = `local_${Math.random().toString(36).slice(2, 10)}`
  return { id, email }
}

export const getCurrentUser = async (): Promise<AuthUser | null> => {
  if (supabaseEnabled && supabase) {
    const { data } = await supabase.auth.getUser()
    const user = data.user
    if (!user || !user.email) return null
    return { id: user.id, email: user.email }
  }

  const raw = localStorage.getItem(LOCAL_USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const signUp = async (email: string, password: string): Promise<RegisterResult> => {
  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error || !data.user || !data.user.email) {
      throw new Error(error?.message ?? 'Signup fehlgeschlagen')
    }

    if (!data.session) {
      return {
        user: null,
        email: data.user.email,
        needsEmailConfirmation: true,
      }
    }

    return {
      user: { id: data.user.id, email: data.user.email },
      email: data.user.email,
      needsEmailConfirmation: false,
    }
  }

  const user = createLocalUser(email)
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user))
  return {
    user,
    email: user.email,
    needsEmailConfirmation: false,
  }
}

export const signIn = async (email: string, password: string): Promise<AuthUser> => {
  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user || !data.user.email) {
      throw new Error(error?.message ?? 'Login fehlgeschlagen')
    }
    return { id: data.user.id, email: data.user.email }
  }

  const user = createLocalUser(email)
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user))
  return user
}

export const signOut = async () => {
  if (supabaseEnabled && supabase) {
    await supabase.auth.signOut()
    return
  }
  localStorage.removeItem(LOCAL_USER_KEY)
}
