
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Use environment variables - no hardcoded fallbacks for security
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing required Supabase environment variables. Please check your .env file.')
}

// Use Supabase directly (Vercel rewrites/proxies can cause auth/key mismatches).
const effectiveUrl = supabaseUrl

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
