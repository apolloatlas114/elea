export type Plan = 'free' | 'basic' | 'pro'

export type Profile = {
  studiengang: string
  hochschule?: string
  abgabedatum: string
  status: '0' | '30' | '50' | '80'
  zielnote: '0,7' | '1,0' | '1,3' | '1,7' | '2,0' | '2,3' | '2,7' | '3,0'
}

export type StressEntry = {
  date: string
  value: number
}

export const STORAGE_KEYS = {
  profile: 'elea_profile',
  stress: 'elea_stress',
  stressValue: 'elea_stress_value',
  plan: 'elea_plan',
  lektorat: 'elea_lektorat',
  commitmentSeen: 'elea_commitment_seen',
}

export const parseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

export const formatCountdown = (days: number, hours: number, minutes: number, seconds: number) =>
  `Noch ${days} Tage · ${hours}h · ${minutes}min · ${seconds}s`
