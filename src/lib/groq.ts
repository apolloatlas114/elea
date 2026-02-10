type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type GroqChatResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

export const groqChatJson = async <T,>(args: {
  apiKey: string
  model: string
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}): Promise<{ raw: string; parsed: T | null }> => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model,
      temperature: args.temperature ?? 0.2,
      max_tokens: args.maxTokens ?? 2048,
      messages: [
        { role: 'system', content: args.system } satisfies GroqChatMessage,
        { role: 'user', content: args.user } satisfies GroqChatMessage,
      ],
    }),
  })

  const payload = (await response.json().catch(() => ({}))) as GroqChatResponse & { error?: { message?: string } }
  if (!response.ok) {
    const message = typeof payload?.error?.message === 'string' ? payload.error.message : 'Groq request failed.'
    throw new Error(message)
  }

  const content = payload?.choices?.[0]?.message?.content ?? ''
  const raw = typeof content === 'string' ? content.trim() : ''
  if (!raw) return { raw: '', parsed: null }

  // Best-effort JSON parsing even if the model wraps it in code fences.
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as T
    return { raw, parsed }
  } catch {
    return { raw, parsed: null }
  }
}

const isModelError = (message: string) => {
  const needle = message.toLowerCase()
  return (
    needle.includes('decommission') ||
    needle.includes('no longer supported') ||
    needle.includes('model') && needle.includes('deprecated') ||
    needle.includes('invalid model')
  )
}

export const groqChatJsonWithFallback = async <T,>(args: {
  apiKey: string
  models: string[]
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}): Promise<{ raw: string; parsed: T | null; modelUsed: string }> => {
  const models = args.models.filter((m) => typeof m === 'string' && m.trim().length > 0)
  if (models.length === 0) {
    throw new Error('Kein Groq-Modell konfiguriert.')
  }

  let lastError: unknown = null
  for (const model of models) {
    try {
      const result = await groqChatJson<T>({
        apiKey: args.apiKey,
        model,
        system: args.system,
        user: args.user,
        temperature: args.temperature,
        maxTokens: args.maxTokens,
      })
      return { ...result, modelUsed: model }
    } catch (error) {
      lastError = error
      const msg = error instanceof Error ? error.message : String(error)
      // Only fall back for model-related issues; propagate other failures (rate limit, auth, etc).
      if (!isModelError(msg)) {
        throw error
      }
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('Groq request failed.'))
}
