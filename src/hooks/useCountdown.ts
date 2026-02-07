import { useEffect, useMemo, useState } from 'react'
import { parseDeadlineDate } from '../lib/storage'

export const useCountdown = (targetDate?: string | null) => {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const target = useMemo(() => parseDeadlineDate(targetDate) ?? new Date(), [targetDate])
  const diff = Math.max(target.getTime() - now.getTime(), 0)

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const minutes = Math.floor((diff / (1000 * 60)) % 60)
  const seconds = Math.floor((diff / 1000) % 60)

  return { days, hours, minutes, seconds }
}
