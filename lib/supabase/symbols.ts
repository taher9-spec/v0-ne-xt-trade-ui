import { createSupabaseClient } from "./client"

export interface Symbol {
  id: string
  fmp_symbol: string
  display_symbol: string
  name: string | null
  asset_class: "forex" | "crypto" | "stock" | "index" | "commodity"
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Get all active symbols from Supabase
 */
export async function getAllSymbols(): Promise<Symbol[]> {
  try {
    const supabase = createSupabaseClient()
    const { data, error } = await supabase
      .from("symbols")
      .select("*")
      .eq("is_active", true)
      .order("display_symbol", { ascending: true })

    if (error) {
      console.error("[supabase/symbols] Error fetching symbols:", error)
      return []
    }

    return (data || []) as Symbol[]
  } catch (error: any) {
    console.error("[supabase/symbols] getAllSymbols error:", error)
    return []
  }
}

