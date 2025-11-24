import { createClient } from "@supabase/supabase-js"

/**
 * Create Supabase client for client-side use (with Realtime support)
 * This respects RLS policies and is safe for frontend use
 */
export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing")
  }

  if (!supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing")
  }

  try {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  } catch (error: any) {
    console.error("[supabase] Failed to create client:", error)
    throw new Error(`Failed to initialize Supabase: ${error.message}`)
  }
}
