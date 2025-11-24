import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getTodaySignals } from "@/lib/supabase/signals"

export async function GET(req: NextRequest) {
  try {
    // Allow both authenticated and unauthenticated users (for free plan visibility)
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    const searchParams = req.nextUrl.searchParams
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const timeframeFilter = searchParams.get("timeframe")

    // Fetch latest active signals (frontend handles plan gating)
    const signals = await getTodaySignals(limit)

    // Filter by symbolId if provided
    const symbolId = searchParams.get("symbolId")
    let filteredSignals = symbolId ? signals.filter((s) => s.symbol_id === symbolId) : signals

    if (timeframeFilter) {
      filteredSignals = filteredSignals.filter(
        (s) => (s.timeframe || "").toLowerCase() === timeframeFilter.toLowerCase()
      )
    }

    console.log(`[v0] Returning ${filteredSignals.length} signals from database (user: ${userId || 'guest'})`)
    
    return NextResponse.json({ signals: filteredSignals }, { 
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
