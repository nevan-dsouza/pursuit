import { createClient } from '@supabase/supabase-js'
import { SUPABASE_KEY, SUPABASE_URL } from './config'

/** Null when opened as a local file: Google sign-in needs a real URL, so the app runs on-device only. */
export const cloud = location.protocol === 'file:' ? null : createClient(SUPABASE_URL, SUPABASE_KEY)
