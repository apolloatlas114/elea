import { useEffect, useMemo, useState } from 'react'
import type { MentalCheckInEntry, MentalMood, StressEntry } from '../lib/storage'
import { STORAGE_KEYS, parseJson, toLocalIsoDate, todayIso } from '../lib/storage'
import { insertMentalHealthLog, loadMentalHealthLogs } from '../lib/supabaseData'

const DEFAULT_STRESS = 35
const DEFAULT_ENERGY = 58
const DEFAULT_MOOD: MentalMood = 'focused'
const DAILY_LIMIT = 3
const LOG_DAYS = 21

const moodWeights: Record<MentalMood, number> = {
  focused: 68,
  overwhelmed: 24,
  happy: 82,
  depressed: 12,
  motivated: 76,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const isMentalMood = (value: unknown): value is MentalMood =>
  value === 'focused' || value === 'overwhelmed' || value === 'happy' || value === 'depressed' || value === 'motivated'

const buildCheckInId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mh-${Date.now()}-${Math.random().toString(16).slice(2)}`

const toCheckInsFromUnknown = (value: unknown): MentalCheckInEntry[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const raw = item as Record<string, unknown>
      const date = typeof raw.date === 'string' ? raw.date : ''
      const stress = typeof raw.value === 'number' ? clamp(Math.round(raw.value), 0, 100) : Number.NaN
      if (!date || Number.isNaN(stress)) return null
      const energyRaw = typeof raw.energy === 'number' ? raw.energy : DEFAULT_ENERGY
      const moodRaw = raw.mood
      const createdAtRaw = typeof raw.createdAt === 'string' ? raw.createdAt : ''
      return {
        id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : buildCheckInId(),
        date,
        value: stress,
        energy: clamp(Math.round(energyRaw), 0, 100),
        mood: isMentalMood(moodRaw) ? moodRaw : DEFAULT_MOOD,
        createdAt: createdAtRaw || `${date}T12:00:00.000Z`,
      } satisfies MentalCheckInEntry
    })
    .filter((entry): entry is MentalCheckInEntry => Boolean(entry))
}

const toCheckInsFromStressLog = (entries: StressEntry[]): MentalCheckInEntry[] =>
  entries
    .map((entry, index) => ({
      id: `legacy-${entry.date}-${index}`,
      date: entry.date,
      value: clamp(Math.round(entry.value), 0, 100),
      energy: DEFAULT_ENERGY,
      mood: DEFAULT_MOOD,
      createdAt: `${entry.date}T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
    }))
    .filter((entry) => entry.date.length > 0)

const trimByDays = (entries: MentalCheckInEntry[]) => {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (LOG_DAYS - 1))
  const cutoffIso = toLocalIsoDate(cutoff)
  return entries
    .filter((entry) => entry.date >= cutoffIso)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

const toStressLog = (entries: MentalCheckInEntry[]): StressEntry[] =>
  entries.map((entry) => ({
    date: entry.date,
    value: entry.value,
  }))

const scoreCheckIn = (entry: MentalCheckInEntry) => {
  const stressPart = (100 - entry.value) * 0.55
  const energyPart = entry.energy * 0.25
  const moodPart = moodWeights[entry.mood] * 0.2
  return clamp(Math.round(stressPart + energyPart + moodPart), 0, 100)
}

const summarizeTrend = (scores: number[]) => {
  if (scores.length < 2) return 'noch offen'
  const avg = (rows: number[]) => rows.reduce((sum, value) => sum + value, 0) / Math.max(rows.length, 1)
  const window = Math.max(1, Math.min(3, Math.floor(scores.length / 2)))
  const newer = scores.slice(-window)
  const older = scores.slice(-window * 2, -window)
  const baseline = older.length > 0 ? avg(older) : scores[0]
  const delta = avg(newer) - baseline
  if (delta >= 10) return 'deutlich bergauf'
  if (delta >= 4) return 'leicht bergauf'
  if (delta <= -10) return 'deutlich bergab'
  if (delta <= -4) return 'leicht bergab'
  return 'stabil'
}

export const useStress = (userId?: string | null) => {
  const [value, setValue] = useState<number>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.stressValue), DEFAULT_STRESS)
  )
  const [energy, setEnergy] = useState<number>(DEFAULT_ENERGY)
  const [mood, setMood] = useState<MentalMood>(DEFAULT_MOOD)
  const [checkIns, setCheckIns] = useState<MentalCheckInEntry[]>(() => {
    const modern = toCheckInsFromUnknown(parseJson(localStorage.getItem(STORAGE_KEYS.mentalCheckIns), []))
    if (modern.length > 0) return trimByDays(modern)
    const legacy = toCheckInsFromStressLog(parseJson(localStorage.getItem(STORAGE_KEYS.stress), []))
    return trimByDays(legacy)
  })
  const log = useMemo(() => toStressLog(checkIns), [checkIns])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.stressValue, JSON.stringify(value))
  }, [value])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.mentalCheckIns, JSON.stringify(checkIns))
    localStorage.setItem(STORAGE_KEYS.stress, JSON.stringify(log))
  }, [checkIns, log])

  useEffect(() => {
    const filtered = trimByDays(checkIns)
    if (filtered.length !== checkIns.length || filtered.some((entry, index) => entry.id !== checkIns[index]?.id)) {
      setCheckIns(filtered)
    }
  }, [checkIns])

  useEffect(() => {
    const sync = () => {
      setValue(parseJson(localStorage.getItem(STORAGE_KEYS.stressValue), DEFAULT_STRESS))
      const synced = toCheckInsFromUnknown(parseJson(localStorage.getItem(STORAGE_KEYS.mentalCheckIns), []))
      if (synced.length > 0) {
        setCheckIns(trimByDays(synced))
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  useEffect(() => {
    let active = true
    if (!userId) return () => {}
    loadMentalHealthLogs(userId).then((remote) => {
      if (!active || remote.length === 0) return
      setCheckIns((current) => {
        const remoteCheckIns = toCheckInsFromStressLog(remote)
        const merged = [...current]
        const seen = new Set(current.map((entry) => `${entry.date}-${entry.value}-${entry.createdAt}`))
        remoteCheckIns.forEach((entry) => {
          const key = `${entry.date}-${entry.value}-${entry.createdAt}`
          if (seen.has(key)) return
          seen.add(key)
          merged.push(entry)
        })
        return trimByDays(merged)
      })
      setValue(remote[remote.length - 1].value)
    })
    return () => {
      active = false
    }
  }, [userId])

  const today = todayIso()
  const todayCount = checkIns.filter((entry) => entry.date === today).length
  const canSave = todayCount < DAILY_LIMIT

  const saveCheckIn = (next?: { mood?: MentalMood; value?: number; energy?: number }) => {
    if (!canSave) return false
    const nextValue = clamp(Math.round(next?.value ?? value), 0, 100)
    const nextEnergy = clamp(Math.round(next?.energy ?? energy), 0, 100)
    const nextMood = next?.mood && isMentalMood(next.mood) ? next.mood : mood
    const entry: MentalCheckInEntry = {
      id: buildCheckInId(),
      date: today,
      value: nextValue,
      energy: nextEnergy,
      mood: nextMood,
      createdAt: new Date().toISOString(),
    }
    setCheckIns((prev) => trimByDays([...prev, entry]))
    setValue(nextValue)
    setEnergy(nextEnergy)
    setMood(nextMood)
    if (userId) {
      insertMentalHealthLog(userId, { date: entry.date, value: entry.value }).catch((error) => {
        console.error('Mental-Health Log speichern fehlgeschlagen', error)
      })
    }
    return entry
  }

  const save = () => {
    const saved = saveCheckIn()
    if (!saved) return false
    return true
  }

  const checkIns7d = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 6)
    const cutoffIso = toLocalIsoDate(cutoff)
    return checkIns.filter((entry) => entry.date >= cutoffIso)
  }, [checkIns])

  const mentalScore7d = useMemo(() => {
    if (checkIns7d.length === 0) return clamp(Math.round((100 - value) * 0.7 + energy * 0.3), 0, 100)
    const points = checkIns7d.map(scoreCheckIn)
    const sum = points.reduce((acc, item) => acc + item, 0)
    return clamp(Math.round(sum / points.length), 0, 100)
  }, [checkIns7d, energy, value])

  const trend7d = useMemo(() => summarizeTrend(checkIns7d.map(scoreCheckIn)), [checkIns7d])

  return {
    value,
    setValue,
    energy,
    setEnergy,
    mood,
    setMood,
    log,
    checkIns,
    checkIns7d,
    mentalScore7d,
    trend7d,
    save,
    saveCheckIn,
    canSave,
    todayCount,
    dailyLimit: DAILY_LIMIT,
  }
}
