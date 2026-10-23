import { createClient } from '@supabase/supabase-js'

export const hasSupabaseConfig = Boolean(__SUPABASE_URL__ && __SUPABASE_ANON_KEY__)

export const supabase = createClient(__SUPABASE_URL__ || 'https://placeholder.supabase.co', __SUPABASE_ANON_KEY__ || 'placeholder-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
