import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthUser } from '../lib/auth'
import { getCurrentUser, signIn, signOut, signUp } from '../lib/auth'
import { clearUserLocalState, STORAGE_KEYS } from '../lib/storage'

type AuthState = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
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
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const next = await signUp(email, password)
    setUser(next)
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setUser(null)
    clearUserLocalState()
    localStorage.removeItem(STORAGE_KEYS.lastUserId)
  }, [])

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
