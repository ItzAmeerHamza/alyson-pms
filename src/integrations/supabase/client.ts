
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Use environment variables - no hardcoded fallbacks for security
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing required Supabase environment variables. Please check your .env file.')
}

// In production, route through Vercel rewrites to avoid blocked supabase.co domains.
// The /supabase/* paths are proxied to the real Supabase in vercel.json.
const isProduction = typeof window !== 'undefined'
  && window.location.hostname !== 'localhost'
  && window.location.hostname !== '127.0.0.1'
const effectiveUrl = isProduction
  ? `${window.location.origin}/supabase`
  : supabaseUrl

export const supabase = createClient<Database>(
  effectiveUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
  }
)
