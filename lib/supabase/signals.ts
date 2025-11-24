import { createSupabaseClient } from "./client"
import type { Signal } from "@/lib/types"

/**
 * Get today's active signals
 * SELECT * FROM signals WHERE status = 'active' AND activated_at::date = current_date
 */
export async function getTodaySignals(limit: number = 50): Promise<Signal[]> {
  try {
    const supabase = createSupabaseClient()

    // Get today's date at 00:00 UTC
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const startOfTodayUtc = today.toISOString()

    // Query signals with status='active' and activated_at >= today
    const { data, error } = await supabase
      .from("signals")
      .select("*, symbol_id, symbols(fmp_symbol, display_symbol, name, asset_class)")
      .eq("status", "active")
      .gte("activated_at", startOfTodayUtc)
      .order("activated_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[supabase/signals] Error fetching today's signals:", error)
      return []
    }

    return (data || []) as Signal[]
  } catch (error: any) {
    console.error("[supabase/signals] getTodaySignals error:", error)
    return []
  }
}

/**
 * Get all signals with optional filters
 * Used by the "All Signals" page
 */
export async function getAllSignals(options: {
  symbol?: string
  status?: "all" | "active" | "history"
  limit?: number
  offset?: number
} = {}): Promise<Signal[]> {
  try {
    const supabase = createSupabaseClient()

    const { symbol, status = "all", limit = 100, offset = 0 } = options

    // Build query
    let query = supabase
      .from("signals")
      .select("*, symbol_id, symbols(fmp_symbol, display_symbol, name, asset_class)")

    // Apply status filter
    if (status === "active") {
      query = query.eq("status", "active")
    } else if (status === "history") {
      query = query.in("status", ["closed", "expired", "hit_tp", "stopped_out"])
    }
    // "all" = no status filter

    // Apply symbol filter
    if (symbol) {
      query = query.eq("symbol", symbol)
    }

    // Order and paginate
    const { data, error } = await query
      .order("activated_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("[supabase/signals] Error fetching all signals:", error)
      return []
    }

    return (data || []) as Signal[]
  } catch (error: any) {
    console.error("[supabase/signals] getAllSignals error:", error)
    return []
  }
}

