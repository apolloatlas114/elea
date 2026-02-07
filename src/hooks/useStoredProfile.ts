import { useEffect, useState } from 'react'
import type { Profile } from '../lib/storage'
import { STORAGE_KEYS, parseJson } from '../lib/storage'
import { useAuth } from '../context/AuthContext'
import { loadProfile } from '../lib/supabaseData'

export const useStoredProfile = () => {
  const [profile, setProfile] = useState<Profile | null>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.profile), null)
  )
  const { user } = useAuth()

  useEffect(() => {
    const sync = () => {
      const next = parseJson<Profile | null>(localStorage.getItem(STORAGE_KEYS.profile), null)
      setProfile((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }

    const timer = setInterval(sync, 1000)
    window.addEventListener('storage', sync)
    return () => {
      clearInterval(timer)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!user) return () => {}
    loadProfile(user.id).then((remote) => {
      if (!active || !remote) return
      setProfile(remote)
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(remote))
    })
    return () => {
      active = false
    }
  }, [user?.id])

  return profile
}
