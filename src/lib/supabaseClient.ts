import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseEnabled = Boolean(supabaseUrl && supabaseKey)

if (!supabaseEnabled) {
  console.warn('Supabase env vars fehlen: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

export const supabase = supabaseEnabled ? createClient(supabaseUrl as string, supabaseKey as string) : null
