import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthUser } from '../lib/auth'
import { getCurrentUser, signIn, signOut, signUp } from '../lib/auth'
import { bootstrapAdminSessionEvent, trackActivityEvent } from '../lib/adminData'
import { clearUserLocalState, STORAGE_KEYS } from '../lib/storage'

type AuthState = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean; email: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((current) => {
        if (active) setUser(current)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const next = await signIn(email, password)
    setUser(next)
    void trackActivityEvent({
      eventType: 'login_success',
      userId: next.id,
      email: next.email,
      pagePath: '/auth',
    })
    void bootstrapAdminSessionEvent(next.id, next.email)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const registration = await signUp(email, password)
    if (registration.user) {
      setUser(registration.user)
    } else {
      setUser(null)
    }

    void trackActivityEvent({
      eventType: 'register_success',
      userId: registration.user?.id ?? null,
      email: registration.email,
      pagePath: '/auth',
      metadata: {
        confirmationRequired: registration.needsEmailConfirmation,
      },
    })

    return {
      needsEmailConfirmation: registration.needsEmailConfirmation,
      email: registration.email,
    }
  }, [])

  const logout = useCallback(async () => {
    if (user) {
      void trackActivityEvent({
        eventType: 'logout',
        userId: user.id,
        email: user.email,
        pagePath: window.location.pathname,
      })
    }
    await signOut()
    setUser(null)
    clearUserLocalState()
    localStorage.removeItem(STORAGE_KEYS.lastUserId)
  }, [user])

  useEffect(() => {
    if (!user) return
    const lastUserId = localStorage.getItem(STORAGE_KEYS.lastUserId)
    if (lastUserId && lastUserId !== user.id) {
      clearUserLocalState()
    }
    localStorage.setItem(STORAGE_KEYS.lastUserId, user.id)
  }, [user?.id])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
    }),
    [user, loading, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
