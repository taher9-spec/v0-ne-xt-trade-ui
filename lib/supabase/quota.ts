import { supabaseServer } from "../supabaseServer"

/**
 * Check if user is within signal quota based on their plan limits
 * 
 * Implementation:
 * - Reads user's plan_code from users table
 * - Gets plan's signals_per_day limit from plans.features JSONB
 * - Counts trades created today by the user
 * - Compares used vs limit
 */
export async function assertUserWithinSignalQuota(userId: string): Promise<{
  allowed: boolean
  reason?: string
}> {
  try {
    const supabase = supabaseServer()

    // 1. Get user's plan_code
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("plan_code")
      .eq("id", userId)
      .single()

    if (userError || !user) {
      console.error("[supabase/quota] User fetch error:", userError)
      return { allowed: false, reason: "User not found" }
    }

    const planCode = user.plan_code || "free"

    // 2. Get plan's signals_per_day limit from features JSONB
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("features")
      .eq("code", planCode)
      .single()

    if (planError || !plan) {
      console.error("[supabase/quota] Plan fetch error:", planError)
      // Fallback to free plan limits if plan not found
      const limit = 2
      const used = await countTradesToday(supabase, userId)
      if (used >= limit) {
        return {
          allowed: false,
          reason: `Daily signal limit reached (${used}/${limit}). Upgrade your plan for more signals.`,
        }
      }
      return { allowed: true }
    }

    // Extract signals_per_day from features JSONB
    const features = plan.features as any
    const signalsPerDay = features?.signals_per_day

    // Handle unlimited plans (elite plan has "unlimited" as string)
    if (signalsPerDay === "unlimited" || signalsPerDay === -1) {
      return { allowed: true }
    }

    // Parse limit (should be a number)
    const limit = typeof signalsPerDay === "number" ? signalsPerDay : parseInt(String(signalsPerDay || "2"), 10)
    if (isNaN(limit) || limit <= 0) {
      // Invalid limit, default to free plan (2)
      const defaultLimit = 2
      const used = await countTradesToday(supabase, userId)
      if (used >= defaultLimit) {
        return {
          allowed: false,
          reason: `Daily signal limit reached (${used}/${defaultLimit}). Upgrade your plan for more signals.`,
        }
      }
      return { allowed: true }
    }

    // 3. Count trades created today by this user
    const used = await countTradesToday(supabase, userId)

    // 4. Check if user has exceeded limit
    if (used >= limit) {
      return {
        allowed: false,
        reason: `Daily signal limit reached (${used}/${limit}). Upgrade your plan for more signals.`,
      }
    }

    return { allowed: true }
  } catch (error: any) {
    console.error("[supabase/quota] assertUserWithinSignalQuota error:", error)
    // On error, allow (fail open) - can be changed to fail closed if needed
    return { allowed: true }
  }
}

/**
 * Count how many trades the user has created today (UTC)
 */
async function countTradesToday(supabase: any, userId: string): Promise<number> {
  try {
    // Get start of today in UTC
    const now = new Date()
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
    const startOfTodayISO = startOfToday.toISOString()

    // Count trades created today
    const { count, error } = await supabase
      .from("trades")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("opened_at", startOfTodayISO)

    if (error) {
      console.error("[supabase/quota] Count trades error:", error)
      return 0 // On error, assume 0 (fail open)
    }

    return count || 0
  } catch (error: any) {
    console.error("[supabase/quota] countTradesToday error:", error)
    return 0 // On error, assume 0 (fail open)
  }
}

