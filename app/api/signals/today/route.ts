import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { cookies } from "next/headers"
import type { Signal } from "@/lib/types"

export async function GET(req: NextRequest) {
  try {
    // Require authenticated user (same pattern as /api/trades/*)
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = req.nextUrl.searchParams
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const symbolId = searchParams.get("symbolId")

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection failed", details: error.message, signals: [] }, { status: 500 })
    }

    // Fetch signals from today (today at 00:00 UTC)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const startOfTodayUtc = today.toISOString()

    // Build query - join with symbols if symbol_id exists
    // Query signals with status='active' and activated_at >= today (or created_at if activated_at is null)
    let query = supabase
      .from("signals")
      .select("*, symbol_id, symbols(fmp_symbol, display_symbol, name, asset_class)")
      .eq("status", "active")
      .order("activated_at", { ascending: false, nullsFirst: false })
      .limit(limit)

    // Filter by activated_at >= today (prefer activated_at, fallback to created_at)
    // Use .or() to check both activated_at and created_at
    query = query.or(`activated_at.gte.${startOfTodayUtc},and(activated_at.is.null,created_at.gte.${startOfTodayUtc})`)

    // Filter by symbolId if provided
    if (symbolId) {
      query = query.eq("symbol_id", symbolId)
    }

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
