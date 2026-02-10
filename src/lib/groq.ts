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

