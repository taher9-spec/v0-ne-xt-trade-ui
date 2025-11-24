import { createSupabaseClient } from "./client"

/**
 * Check if user is within signal quota
 * For now always returns true, but ready to implement checks later
 * 
 * TODO: Implement actual quota checking based on:
 * - User's plan (free, starter, pro, elite)
 * - signals_used_today field in users table
 * - Plan limits (e.g., free = 2 signals/day, starter = 10/day, etc.)
 */
export async function assertUserWithinSignalQuota(userId: string): Promise<{
  allowed: boolean
  reason?: string
}> {
  try {
    const supabase = createSupabaseClient()

    // TODO: Read user's plan and signals_used_today
    // const { data: user } = await supabase
    //   .from("users")
    //   .select("plan_code, signals_used_today")
    //   .eq("id", userId)
    //   .single()
    //
    // if (!user) {
    //   return { allowed: false, reason: "User not found" }
    // }
    //
    // const planLimits: Record<string, number> = {
    //   free: 2,
    //   starter: 10,
    //   pro: 50,
    //   elite: -1, // unlimited
    // }
    //
    // const limit = planLimits[user.plan_code || "free"] || 2
    // if (limit === -1) {
    //   return { allowed: true } // Unlimited
    // }
    //
    // const used = user.signals_used_today || 0
    // if (used >= limit) {
    //   return {
    //     allowed: false,
    //     reason: `Daily signal limit reached (${used}/${limit}). Upgrade your plan for more signals.`,
    //   }
    // }

    // For now, always allow
    return { allowed: true }
  } catch (error: any) {
    console.error("[supabase/quota] assertUserWithinSignalQuota error:", error)
    // On error, allow (fail open) - can be changed to fail closed if needed
    return { allowed: true }
  }
}

