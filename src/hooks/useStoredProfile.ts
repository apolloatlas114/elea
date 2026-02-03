import { useEffect, useState } from 'react'
import type { Profile } from '../lib/storage'
import { STORAGE_KEYS, parseJson } from '../lib/storage'

export const useStoredProfile = () => {
  const [profile, setProfile] = useState<Profile | null>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.profile), null)
  )

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

  return profile
}
