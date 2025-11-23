import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"

export async function GET() {
  try {
    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection failed", details: error.message, signals: [] }, { status: 500 })
    }

    // Fetch signals from today (last 24 hours) that are active or pending
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from("signals")
      .select("*, symbol_id, symbols(fmp_symbol, display_symbol, name, asset_class)")
      .gte("created_at", today.toISOString())
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching signals from Supabase:", error)
      return NextResponse.json({ 
        error: "Failed to fetch signals", 
        details: error.message,
        signals: []
      }, { status: 500 })
    }

    // Ensure we return an array, never null or undefined
    const signals = Array.isArray(data) ? data : []
    console.log(`[v0] Returning ${signals.length} signals from database`)
    
    return NextResponse.json({ signals }, { 
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      }
    })
  } catch (error: any) {
    console.error("[v0] Unexpected error in signals API:", error)
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error.message,
      signals: [] 
    }, { status: 500 })
  }
}
