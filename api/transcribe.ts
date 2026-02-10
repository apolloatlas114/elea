export const config = {
  runtime: 'edge',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY
  const model = process.env.GROQ_TRANSCRIPTION_MODEL || process.env.VITE_GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo'
  if (!apiKey) {
    return json({ error: 'GROQ_API_KEY fehlt auf dem Server.' }, 500)
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return json({ error: 'Keine Audio-Datei empfangen.' }, 400)
  }

  const upstreamForm = new FormData()
  upstreamForm.append('file', file, file.name || 'audio.webm')
  upstreamForm.append('model', model)
  upstreamForm.append('language', 'de')
  upstreamForm.append('response_format', 'json')

  const upstream = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: upstreamForm,
  })

  const payload = await upstream.json().catch(() => ({}))
  if (!upstream.ok) {
    return json(
      {
        error:
          typeof payload?.error?.message === 'string'
            ? payload.error.message
            : 'Transkription fehlgeschlagen.',
      },
      upstream.status
    )
  }

  const text = typeof payload?.text === 'string' ? payload.text : ''
  return json({ text })
}
