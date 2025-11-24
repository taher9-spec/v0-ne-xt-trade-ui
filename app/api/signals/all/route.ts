import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { cookies } from "next/headers"
import type { Signal } from "@/lib/types"

/**
 * GET /api/signals/all
 * Returns all signals (not just today's) for the /signals page
 * Requires authenticated user
 */
export async function GET(req: NextRequest) {
  try {
    // Require authenticated user
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = req.nextUrl.searchParams
    const limit = parseInt(searchParams.get("limit") || "100", 10)

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection failed", details: error.message, signals: [] }, { status: 500 })
    }

    // Fetch all signals, ordered by created_at desc
    let query = supabase
      .from("signals")
      .select("*, symbol_id, symbols(fmp_symbol, display_symbol, name, asset_class)")
      .order("created_at", { ascending: false })
      .limit(limit)

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching signals from Supabase:", error)
      return NextResponse.json({ 
        error: "Failed to fetch signals", 
        details: error.message,
        signals: []
      }, { status: 500 })
    }

    // Ensure we return an array, never null or undefined
    const signals = (Array.isArray(data) ? data : []) as Signal[]
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

