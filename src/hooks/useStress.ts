import { useEffect, useState } from 'react'
import type { StressEntry } from '../lib/storage'
import { STORAGE_KEYS, parseJson, todayIso } from '../lib/storage'

const DEFAULT_STRESS = 35

export const useStress = () => {
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
    const sync = () => {
      setValue(parseJson(localStorage.getItem(STORAGE_KEYS.stressValue), DEFAULT_STRESS))
      setLog(parseJson(localStorage.getItem(STORAGE_KEYS.stress), []))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const save = () => {
    const entry: StressEntry = { date: todayIso(), value }
    setLog((prev) => [...prev.slice(-6), entry])
  }

  return { value, setValue, log, save }
}
