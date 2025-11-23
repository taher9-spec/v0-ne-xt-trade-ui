import { createClient } from "@supabase/supabase-js"

export const supabaseServer = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    const error = "NEXT_PUBLIC_SUPABASE_URL is missing"
    console.error("[v0]", error)
    throw new Error(error)
  }

  if (!serviceRoleKey) {
    const error = "SUPABASE_SERVICE_ROLE_KEY is missing"
    console.error("[v0]", error)
    throw new Error(error)
  }

  // Validate URL format
  try {
    new URL(supabaseUrl)
  } catch {
    const error = `Invalid Supabase URL format: ${supabaseUrl}`
    console.error("[v0]", error)
    throw new Error(error)
  }

  try {
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })
    return client
  } catch (error: any) {
    console.error("[v0] Failed to create Supabase client:", error)
    throw new Error(`Failed to initialize Supabase: ${error.message}`)
  }
}
