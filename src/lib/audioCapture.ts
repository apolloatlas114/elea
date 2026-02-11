export type RecordedAudio = {
  blob: Blob
  mimeType: string
  extension: 'webm' | 'm4a' | 'wav'
}

export type MicrophoneCaptureSession = {
  strategy: 'media-recorder' | 'web-audio'
  stop: () => Promise<RecordedAudio>
  cancel: () => Promise<void>
}

const DEFAULT_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

const BrowserAudioContext = () => {
  const scopedWindow = window as Window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext || scopedWindow.webkitAudioContext
}

const stopStream = (stream: MediaStream) => {
  stream.getTracks().forEach((track) => track.stop())
}

const writeAscii = (view: DataView, offset: number, text: string) => {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

const encodeMonoWav = (samples: Float32Array, sampleRate: number) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let byteOffset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(byteOffset, value < 0 ? value * 0x8000 : value * 0x7fff, true)
    byteOffset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

const flattenBuffers = (chunks: Float32Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(total)
  let offset = 0
  chunks.forEach((chunk) => {
    merged.set(chunk, offset)
    offset += chunk.length
  })
  return merged
}

const isLikelyIOS = () => {
  const ua = navigator.userAgent || ''
  const iOSDevice = /iPad|iPhone|iPod/.test(ua)
  const iPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iOSDevice || iPadDesktopMode
}

const pickMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }
  for (const candidate of DEFAULT_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ''
}

const extensionFromMimeType = (mimeType: string): RecordedAudio['extension'] => {
  const value = mimeType.toLowerCase()
  if (value.includes('wav')) return 'wav'
  if (value.includes('mp4') || value.includes('m4a') || value.includes('aac')) return 'm4a'
  return 'webm'
}

const createMediaRecorderSession = (stream: MediaStream): MicrophoneCaptureSession => {
  const mimeType = pickMimeType()
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  const chunks: Blob[] = []
  let canceled = false
  let settled = false
  let doneResolve: ((value: RecordedAudio) => void) | null = null
  let doneReject: ((reason?: unknown) => void) | null = null

  const done = new Promise<RecordedAudio>((resolve, reject) => {
    doneResolve = resolve
    doneReject = reject
  })

  const finalizeReject = (reason: unknown) => {
    if (settled) return
    settled = true
    stopStream(stream)
    doneReject?.(reason)
  }

  const finalizeResolve = (audio: RecordedAudio) => {
    if (settled) return
    settled = true
    stopStream(stream)
    doneResolve?.(audio)
  }

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data)
    }
  }

  recorder.onerror = (event) => {
    const message = event.error?.message || 'Audioaufnahme fehlgeschlagen.'
    finalizeReject(new Error(message))
  }

  recorder.onstop = () => {
    if (canceled) {
      finalizeReject(new Error('Aufnahme abgebrochen.'))
      return
    }

    const outputMimeType = recorder.mimeType || mimeType || 'audio/webm'
    const blob = new Blob(chunks, { type: outputMimeType })
    if (blob.size === 0) {
      finalizeReject(new Error('Keine Audioaufnahme erkannt.'))
      return
    }

    finalizeResolve({
      blob,
      mimeType: outputMimeType,
      extension: extensionFromMimeType(outputMimeType),
    })
  }

  recorder.start(250)

  return {
    strategy: 'media-recorder',
    stop: async () => {
      if (recorder.state !== 'inactive') {
        recorder.stop()
      }
      return done
    },
    cancel: async () => {
      canceled = true
      if (recorder.state !== 'inactive') {
        recorder.stop()
      } else {
        finalizeReject(new Error('Aufnahme abgebrochen.'))
      }
      try {
        await done
      } catch {
        // Ignore cancellation errors.
      }
    },
  }
}

const createWebAudioSession = async (stream: MediaStream): Promise<MicrophoneCaptureSession> => {
  const AudioContextCtor = BrowserAudioContext()
  if (!AudioContextCtor) {
    throw new Error('AudioContext wird auf diesem Browser nicht unterstuetzt.')
  }

  const audioContext = new AudioContextCtor()
  if (audioContext.state === 'suspended') {
    await audioContext.resume().catch(() => {})
  }

  const source = audioContext.createMediaStreamSource(stream)
  const processor = audioContext.createScriptProcessor(4096, 1, 1)
  const muteGain = audioContext.createGain()
  muteGain.gain.value = 0

  const chunks: Float32Array[] = []
  let canceled = false
  let settled = false

  source.connect(processor)
  processor.connect(muteGain)
  muteGain.connect(audioContext.destination)

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0)
    if (!input || input.length === 0) return
    chunks.push(new Float32Array(input))
  }

  const cleanup = async () => {
    try {
      source.disconnect()
    } catch {
      // Ignore cleanup errors.
    }
    try {
      processor.disconnect()
    } catch {
      // Ignore cleanup errors.
    }
    try {
      muteGain.disconnect()
    } catch {
      // Ignore cleanup errors.
    }
    await audioContext.close().catch(() => {})
    stopStream(stream)
  }

  const buildResult = async () => {
    const sampleRate = audioContext.sampleRate || 44100
    const merged = flattenBuffers(chunks)
    await cleanup()
    if (merged.length === 0) {
      throw new Error('Keine Audioaufnahme erkannt.')
    }
    const blob = encodeMonoWav(merged, sampleRate)
    return {
      blob,
      mimeType: 'audio/wav',
      extension: 'wav',
    } satisfies RecordedAudio
  }

  return {
    strategy: 'web-audio',
    stop: async () => {
      if (settled) {
        throw new Error('Aufnahme wurde bereits beendet.')
      }
      settled = true
      if (canceled) {
        throw new Error('Aufnahme abgebrochen.')
      }
      return buildResult()
    },
    cancel: async () => {
      if (settled) return
      canceled = true
      settled = true
      await cleanup()
    },
  }
}

const buildSession = async (stream: MediaStream, order: Array<'media' | 'web'>) => {
  let lastError: unknown = null
  for (const strategy of order) {
    try {
      if (strategy === 'media') {
        if (typeof MediaRecorder === 'undefined') {
          throw new Error('MediaRecorder nicht verfuegbar.')
        }
        return createMediaRecorderSession(stream)
      }
      return await createWebAudioSession(stream)
    } catch (error) {
      lastError = error
    }
  }
  throw (lastError instanceof Error ? lastError : new Error('Audioaufnahme nicht verfuegbar.'))
}

export const startMicrophoneCapture = async (): Promise<MicrophoneCaptureSession> => {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Dieser Browser unterstuetzt keinen Mikrofonzugriff.')
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error('Mikrofon funktioniert nur ueber HTTPS oder localhost.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })

  try {
    const order = isLikelyIOS() ? (['web', 'media'] as const) : (['media', 'web'] as const)
    return await buildSession(stream, [...order])
  } catch (error) {
    stopStream(stream)
    throw error
  }
}

export const getMicrophoneErrorMessage = (error: unknown) => {
  const err = error as Partial<DOMException> & { message?: string }
  const name = typeof err?.name === 'string' ? err.name : ''

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Mikrofon blockiert. Bitte Browser-Berechtigung fuer Mikrofon erlauben und Seite neu laden.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Kein Mikrofon gefunden. Bitte pruefe dein Geraet.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Mikrofon ist aktuell durch eine andere App belegt. Bitte andere Audio-Apps schliessen.'
  }
  if (name === 'OverconstrainedError') {
    return 'Mikrofon-Konfiguration wird auf diesem Geraet nicht unterstuetzt.'
  }
  if (typeof err?.message === 'string' && err.message.trim().length > 0) {
    return err.message
  }
  return 'Mikrofonzugriff nicht moeglich. Bitte Browser-Berechtigung pruefen.'
}
