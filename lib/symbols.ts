import { supabaseServer } from "./supabaseServer"

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
    const supabase = supabaseServer()
    const { data, error } = await supabase
      .from("symbols")
      .select("*")
      .eq("is_active", true)
      .order("display_symbol", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching symbols:", error)
      return []
    }

    return (data || []) as Symbol[]
  } catch (error: any) {
    console.error("[v0] getAllSymbols error:", error)
    return []
  }
}

/**
 * Get symbol by ID
 */
export async function getSymbolById(id: string): Promise<Symbol | null> {
  try {
    const supabase = supabaseServer()
    const { data, error } = await supabase
      .from("symbols")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !data) {
      console.error("[v0] Error fetching symbol by ID:", error)
      return null
    }

    return data as Symbol
  } catch (error: any) {
    console.error("[v0] getSymbolById error:", error)
    return null
  }
}

/**
 * Get symbol by FMP symbol string
 */
export async function getSymbolByFmpSymbol(fmpSymbol: string): Promise<Symbol | null> {
  try {
    const supabase = supabaseServer()
    const { data, error } = await supabase
      .from("symbols")
      .select("*")
      .eq("fmp_symbol", fmpSymbol)
      .maybeSingle()

    if (error || !data) {
      console.error("[v0] Error fetching symbol by FMP symbol:", error)
      return null
    }

    return data as Symbol
  } catch (error: any) {
    console.error("[v0] getSymbolByFmpSymbol error:", error)
    return null
  }
}

/**
 * Create or update a symbol
 */
export async function upsertSymbol(symbol: {
  fmp_symbol: string
  display_symbol: string
  name?: string | null
  asset_class: "forex" | "crypto" | "stock" | "index" | "commodity"
  is_active?: boolean
}): Promise<Symbol | null> {
  try {
    const supabase = supabaseServer()
    const { data, error } = await supabase
      .from("symbols")
      .upsert(
        {
          ...symbol,
          is_active: symbol.is_active ?? true,
        },
        {
          onConflict: "fmp_symbol",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single()

    if (error) {
      console.error("[v0] Error upserting symbol:", error)
      return null
    }

    return data as Symbol
  } catch (error: any) {
    console.error("[v0] upsertSymbol error:", error)
    return null
  }
}

