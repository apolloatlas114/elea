import { STORAGE_KEYS, parseJson } from './storage'

type VoiceTone = 'hoch' | 'tief'

type TimedNumber = {
  value: number
  recordedAt: string
}

type ProductivityQuiz = {
  answerSpeedSeconds: TimedNumber[]
  attempts: Array<{ total: number; answered: number; finishedAt: string }>
}

type ProductivityVoice = {
  samples: Array<{
    wpm: number
    pauseSeconds: number
    fillerRatio: number
    tone: VoiceTone
    recordedAt: string
  }>
}

type ProductivityMental = {
  opens: string[]
  saves: string[]
  clickSpeedMs: Array<{ value: number; recordedAt: string }>
  checkInSignatures: Array<{ signature: string; recordedAt: string }>
}

export type ProductivityMetrics = {
  updatedAt: string
  quiz: ProductivityQuiz
  voice: ProductivityVoice
  mental: ProductivityMental
}

export type ProductivitySnapshot = {
  score: number
  quizFlowShare: number
  quizUnsureShare: number
  quizBlockade: boolean
  voiceWpm: number
  voicePauseSeconds: number
  voiceFillerRatio: number
  voiceTone: VoiceTone
  mentalClickSpeedMs: number
  mentalPatternRepeatShare: number
  mentalSkipRate: number
}

const nowIso = () => new Date().toISOString()
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const capList = <T,>(list: T[], max: number) => list.slice(Math.max(0, list.length - max))

const defaultMetrics = (): ProductivityMetrics => ({
  updatedAt: nowIso(),
  quiz: {
    answerSpeedSeconds: [],
    attempts: [],
  },
  voice: {
    samples: [],
  },
  mental: {
    opens: [],
    saves: [],
    clickSpeedMs: [],
    checkInSignatures: [],
  },
})

const parseIsoSafe = (value: string) => {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export const loadProductivityMetrics = (): ProductivityMetrics => {
  const raw = parseJson<Partial<ProductivityMetrics> | null>(localStorage.getItem(STORAGE_KEYS.productivityMetrics), null)
  if (!raw) return defaultMetrics()

  return {
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
    quiz: {
      answerSpeedSeconds: Array.isArray(raw.quiz?.answerSpeedSeconds)
        ? raw.quiz!.answerSpeedSeconds
            .map((entry) => {
              if (typeof entry === 'number') {
                return { value: entry, recordedAt: nowIso() } satisfies TimedNumber
              }
              const row = entry as Partial<TimedNumber>
              return {
                value: Number(row?.value ?? 0),
                recordedAt: typeof row?.recordedAt === 'string' ? row.recordedAt : nowIso(),
              } satisfies TimedNumber
            })
            .filter((entry) => Number.isFinite(entry.value) && entry.value >= 0)
        : [],
      attempts: Array.isArray(raw.quiz?.attempts)
        ? raw.quiz!.attempts
            .map((entry) => ({
              total: Number(entry?.total ?? 0),
              answered: Number(entry?.answered ?? 0),
              finishedAt: typeof entry?.finishedAt === 'string' ? entry.finishedAt : nowIso(),
            }))
            .filter((entry) => Number.isFinite(entry.total) && entry.total > 0 && Number.isFinite(entry.answered) && entry.answered >= 0)
        : [],
    },
    voice: {
      samples: Array.isArray(raw.voice?.samples)
        ? raw.voice!.samples
            .map((entry) => {
              const tone: VoiceTone = entry?.tone === 'hoch' ? 'hoch' : 'tief'
              return {
                wpm: Number(entry?.wpm ?? 0),
                pauseSeconds: Number(entry?.pauseSeconds ?? 0),
                fillerRatio: Number(entry?.fillerRatio ?? 0),
                tone,
                recordedAt: typeof entry?.recordedAt === 'string' ? entry.recordedAt : nowIso(),
              }
            })
            .filter((entry) => Number.isFinite(entry.wpm) && entry.wpm >= 0)
        : [],
    },
    mental: {
      opens: Array.isArray(raw.mental?.opens)
        ? raw.mental!.opens.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : Number.isFinite(raw.mental?.opens)
          ? Array.from({ length: Number(raw.mental?.opens) }, () => nowIso())
          : [],
      saves: Array.isArray(raw.mental?.saves)
        ? raw.mental!.saves.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : Number.isFinite(raw.mental?.saves)
          ? Array.from({ length: Number(raw.mental?.saves) }, () => nowIso())
          : [],
      clickSpeedMs: Array.isArray(raw.mental?.clickSpeedMs)
        ? raw.mental!.clickSpeedMs
            .map((entry) => {
              if (typeof entry === 'number') {
                return { value: entry, recordedAt: nowIso() }
              }
              const row = entry as { value?: unknown; recordedAt?: unknown }
              return {
                value: Number(row?.value ?? 0),
                recordedAt: typeof row?.recordedAt === 'string' ? row.recordedAt : nowIso(),
              }
            })
            .filter((entry) => Number.isFinite(entry.value) && entry.value >= 0)
        : [],
      checkInSignatures: Array.isArray(raw.mental?.checkInSignatures)
        ? raw.mental!.checkInSignatures
            .map((entry) => {
              if (typeof entry === 'string') {
                return { signature: entry, recordedAt: nowIso() }
              }
              const row = entry as { signature?: unknown; recordedAt?: unknown }
              return {
                signature: typeof row?.signature === 'string' ? row.signature : '',
                recordedAt: typeof row?.recordedAt === 'string' ? row.recordedAt : nowIso(),
              }
            })
            .filter((entry) => entry.signature.length > 0)
        : [],
    },
  }
}

const saveMetrics = (metrics: ProductivityMetrics) => {
  localStorage.setItem(
    STORAGE_KEYS.productivityMetrics,
    JSON.stringify({
      ...metrics,
      updatedAt: nowIso(),
    } satisfies ProductivityMetrics)
  )
}

const updateMetrics = (mutator: (current: ProductivityMetrics) => ProductivityMetrics) => {
  const current = loadProductivityMetrics()
  const next = mutator(current)
  saveMetrics(next)
  return next
}

export const recordQuizAnswerSpeed = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return
  updateMetrics((current) => ({
    ...current,
    quiz: {
      ...current.quiz,
      answerSpeedSeconds: capList(
        [...current.quiz.answerSpeedSeconds, { value: Number(seconds.toFixed(1)), recordedAt: nowIso() }],
        400
      ),
    },
  }))
}

export const recordQuizAttempt = ({ total, answered }: { total: number; answered: number }) => {
  if (!Number.isFinite(total) || total <= 0) return
  const safeAnswered = clamp(Math.round(answered), 0, Math.round(total))
  updateMetrics((current) => ({
    ...current,
    quiz: {
      ...current.quiz,
      attempts: capList(
        [...current.quiz.attempts, { total: Math.round(total), answered: safeAnswered, finishedAt: nowIso() }],
        160
      ),
    },
  }))
}

const toWordList = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-zA-Z0-9äöüß\s-]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

const toFillerRatio = (words: string[]) => {
  if (words.length === 0) return 0
  const fillers = words.filter((word) => word === 'äh' || word === 'ähm' || word === 'aeh' || word === 'aehm').length
  return fillers / words.length
}

export const recordVoiceInputAnalysis = ({
  transcript,
  durationSeconds,
}: {
  transcript: string
  durationSeconds: number
}) => {
  if (!transcript.trim()) return
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return

  const words = toWordList(transcript)
  const minutes = durationSeconds / 60
  const wpm = minutes > 0 ? words.length / minutes : 0
  const estimatedSpeechSeconds = words.length / 2.2
  const pauseSeconds = Math.max(0, durationSeconds - estimatedSpeechSeconds)
  const fillerRatio = toFillerRatio(words)
  const tone: VoiceTone = wpm >= 120 ? 'hoch' : 'tief'

  updateMetrics((current) => ({
    ...current,
    voice: {
      ...current.voice,
      samples: capList(
        [
          ...current.voice.samples,
          {
            wpm: Number(wpm.toFixed(1)),
            pauseSeconds: Number(pauseSeconds.toFixed(1)),
            fillerRatio: Number(fillerRatio.toFixed(4)),
            tone,
            recordedAt: nowIso(),
          },
        ],
        160
      ),
    },
  }))
}

export const recordMentalCheckerOpen = () => {
  updateMetrics((current) => ({
    ...current,
    mental: {
      ...current.mental,
      opens: capList([...current.mental.opens, nowIso()], 400),
    },
  }))
}

export const recordMentalCheckerSave = () => {
  updateMetrics((current) => ({
    ...current,
    mental: {
      ...current.mental,
      saves: capList([...current.mental.saves, nowIso()], 400),
    },
  }))
}

export const recordMentalClickSpeed = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return
  updateMetrics((current) => ({
    ...current,
    mental: {
      ...current.mental,
      clickSpeedMs: capList(
        [...current.mental.clickSpeedMs, { value: Math.round(milliseconds), recordedAt: nowIso() }],
        320
      ),
    },
  }))
}

export const recordMentalPattern = ({ mood, value, energy }: { mood: string; value: number; energy: number }) => {
  if (!mood) return
  const signature = `${mood}|${Math.round(value / 10) * 10}|${Math.round(energy / 10) * 10}`
  updateMetrics((current) => ({
    ...current,
    mental: {
      ...current.mental,
      checkInSignatures: capList([...current.mental.checkInSignatures, { signature, recordedAt: nowIso() }], 160),
    },
  }))
}

const average = (values: number[]) => {
  if (values.length === 0) return 0
  const sum = values.reduce((total, value) => total + value, 0)
  return sum / values.length
}

const toScaled = (value: number, min: number, max: number, reverse = false) => {
  if (max <= min) return 50
  const normalized = clamp((value - min) / (max - min), 0, 1)
  const scaled = reverse ? (1 - normalized) * 100 : normalized * 100
  return clamp(Math.round(scaled), 0, 100)
}

export const computeProductivitySnapshot = (metrics: ProductivityMetrics): ProductivitySnapshot => {
  const answerSpeeds = metrics.quiz.answerSpeedSeconds.map((entry) => entry.value)
  const flowShare = answerSpeeds.length > 0 ? answerSpeeds.filter((value) => value < 8).length / answerSpeeds.length : 0
  const unsureShare = answerSpeeds.length > 0 ? answerSpeeds.filter((value) => value > 20).length / answerSpeeds.length : 0
  const averageAnswerSpeed = average(answerSpeeds)
  const quizSpeedScore = answerSpeeds.length > 0 ? toScaled(averageAnswerSpeed, 8, 20, true) : 55

  const lastAttempts = metrics.quiz.attempts.slice(-6)
  const unfinishedStreak = (() => {
    let streak = 0
    for (let index = lastAttempts.length - 1; index >= 0; index -= 1) {
      const attempt = lastAttempts[index]
      if (attempt.answered < attempt.total) streak += 1
      else break
    }
    return streak
  })()
  const quizBlockade = unfinishedStreak >= 3
  const quizAbortRate =
    lastAttempts.length > 0 ? lastAttempts.filter((attempt) => attempt.answered < attempt.total).length / lastAttempts.length : 0
  const quizAbortScore = 100 - Math.round(quizAbortRate * 100)
  const quizScore = Math.round((quizSpeedScore * 0.7) + (quizAbortScore * 0.3) - (quizBlockade ? 12 : 0))

  const voiceSamples = metrics.voice.samples.slice(-12)
  const avgWpm = average(voiceSamples.map((sample) => sample.wpm))
  const avgPause = average(voiceSamples.map((sample) => sample.pauseSeconds))
  const avgFiller = average(voiceSamples.map((sample) => sample.fillerRatio))
  const lastTone: VoiceTone = voiceSamples.length > 0 ? voiceSamples[voiceSamples.length - 1].tone : 'tief'
  const wpmScore = voiceSamples.length > 0 ? toScaled(avgWpm, 90, 140) : 55
  const pauseScore = voiceSamples.length > 0 ? toScaled(avgPause, 0.5, 3.5) : 55
  const fillerScore = voiceSamples.length > 0 ? toScaled(avgFiller, 0.03, 0.2, true) : 55
  const voiceScore = Math.round((wpmScore * 0.45) + (pauseScore * 0.25) + (fillerScore * 0.3))

  const clickSamples = metrics.mental.clickSpeedMs.slice(-30).map((entry) => entry.value)
  const avgClickMs = average(clickSamples)
  const clickScore = clickSamples.length > 0 ? toScaled(avgClickMs, 220, 2400, true) : 55

  const signatures = metrics.mental.checkInSignatures.slice(-18).map((entry) => entry.signature)
  const signatureCount = new Map<string, number>()
  signatures.forEach((signature) => {
    signatureCount.set(signature, (signatureCount.get(signature) ?? 0) + 1)
  })
  const repeated = Array.from(signatureCount.values()).filter((count) => count >= 2).reduce((sum, count) => sum + count, 0)
  const patternRepeatShare = signatures.length > 0 ? repeated / signatures.length : 0
  const patternScore = signatures.length > 0 ? clamp(Math.round(patternRepeatShare * 100), 0, 100) : 55

  const skipRate =
    metrics.mental.opens.length > 0
      ? clamp((metrics.mental.opens.length - metrics.mental.saves.length) / metrics.mental.opens.length, 0, 1)
      : 0
  const skipPenalty = skipRate > 0.3 ? Math.round((skipRate - 0.3) * 100) : 0
  const mentalScore = clamp(Math.round((clickScore * 0.45) + (patternScore * 0.55) - skipPenalty), 0, 100)

  const finalScore = clamp(Math.round((quizScore * 0.4) + (voiceScore * 0.3) + (mentalScore * 0.3)), 0, 100)

  return {
    score: finalScore,
    quizFlowShare: Number((flowShare * 100).toFixed(1)),
    quizUnsureShare: Number((unsureShare * 100).toFixed(1)),
    quizBlockade,
    voiceWpm: Number(avgWpm.toFixed(1)),
    voicePauseSeconds: Number(avgPause.toFixed(1)),
    voiceFillerRatio: Number((avgFiller * 100).toFixed(1)),
    voiceTone: lastTone,
    mentalClickSpeedMs: Math.round(avgClickMs),
    mentalPatternRepeatShare: Number((patternRepeatShare * 100).toFixed(1)),
    mentalSkipRate: Number((skipRate * 100).toFixed(1)),
  }
}

export const filterProductivityMetricsByDays = (metrics: ProductivityMetrics, days: number): ProductivityMetrics => {
  const now = Date.now()
  const start = now - Math.max(days, 1) * 24 * 60 * 60 * 1000
  const inWindow = (iso: string) => {
    const time = parseIsoSafe(iso)
    return time >= start && time <= now
  }

  return {
    ...metrics,
    quiz: {
      answerSpeedSeconds: metrics.quiz.answerSpeedSeconds.filter((entry) => inWindow(entry.recordedAt)),
      attempts: metrics.quiz.attempts.filter((entry) => inWindow(entry.finishedAt)),
    },
    voice: {
      samples: metrics.voice.samples.filter((entry) => inWindow(entry.recordedAt)),
    },
    mental: {
      opens: metrics.mental.opens.filter(inWindow),
      saves: metrics.mental.saves.filter(inWindow),
      clickSpeedMs: metrics.mental.clickSpeedMs.filter((entry) => inWindow(entry.recordedAt)),
      checkInSignatures: metrics.mental.checkInSignatures.filter((entry) => inWindow(entry.recordedAt)),
    },
  }
}

