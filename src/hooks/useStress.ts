import { useEffect, useState } from 'react'
import type { StressEntry } from '../lib/storage'
import { STORAGE_KEYS, parseJson, toLocalIsoDate, todayIso } from '../lib/storage'
import { insertMentalHealthLog, loadMentalHealthLogs } from '../lib/supabaseData'

const DEFAULT_STRESS = 35
const DAILY_LIMIT = 2
const LOG_DAYS = 14

export const useStress = (userId?: string | null) => {
  const [value, setValue] = useState<number>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.stressValue), DEFAULT_STRESS)
  )
  const [log, setLog] = useState<StressEntry[]>(() =>
    parseJson(localStorage.getItem(STORAGE_KEYS.stress), [])
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.stressValue, JSON.stringify(value))
  }, [value])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.stress, JSON.stringify(log))
  }, [log])

  useEffect(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (LOG_DAYS - 1))
    const cutoffIso = toLocalIsoDate(cutoff)
    const filtered = log.filter((entry) => entry.date >= cutoffIso)
    if (filtered.length !== log.length) {
      setLog(filtered)
    }
  }, [log])

  useEffect(() => {
    const sync = () => {
      setValue(parseJson(localStorage.getItem(STORAGE_KEYS.stressValue), DEFAULT_STRESS))
      setLog(parseJson(localStorage.getItem(STORAGE_KEYS.stress), []))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  useEffect(() => {
    let active = true
    if (!userId) return () => {}
    loadMentalHealthLogs(userId).then((remote) => {
      if (!active || remote.length === 0) return
      setLog(remote)
      setValue(remote[remote.length - 1].value)
    })
    return () => {
      active = false
    }
  }, [userId])

  const today = todayIso()
  const todayCount = log.filter((entry) => entry.date === today).length
  const canSave = todayCount < DAILY_LIMIT

  const save = () => {
    if (!canSave) return false
    const entry: StressEntry = { date: today, value }
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (LOG_DAYS - 1))
    const cutoffIso = toLocalIsoDate(cutoff)
    setLog((prev) => [...prev, entry].filter((item) => item.date >= cutoffIso))
    if (userId) {
      insertMentalHealthLog(userId, entry).catch((error) => {
        console.error('Mental-Health Log speichern fehlgeschlagen', error)
      })
    }
    return true
  }

  return { value, setValue, log, save, canSave, todayCount, dailyLimit: DAILY_LIMIT }
}
