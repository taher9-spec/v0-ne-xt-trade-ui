import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getTodaySignals } from "@/lib/supabase/signals"
import { supabaseServer } from "@/lib/supabaseServer"

export async function GET(req: NextRequest) {
  try {
    // Allow both authenticated and unauthenticated users (for free plan visibility)
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    // If user is authenticated, fetch their plan info for logging
    let userInfo = "guest"
    if (userId) {
      try {
        const supabase = supabaseServer()
        const { data: user } = await supabase
          .from("users")
          .select("username, plan_code")
          .eq("id", userId)
          .single()
        
        if (user) {
          userInfo = `${user.username || 'user'} (${user.plan_code || 'no-plan'})`
        } else {
          userInfo = userId.substring(0, 8) + "..."
        }
      } catch (e: any) {
        // If fetching user fails, just use userId
        console.warn(`[v0] Could not fetch user info for logging: ${e.message}`)
        userInfo = userId.substring(0, 8) + "..."
      }
    }

    const searchParams = req.nextUrl.searchParams
    // Default to 100 to show more signals, but allow override
    const limit = parseInt(searchParams.get("limit") || "100", 10)
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

    console.log(`[v0] Returning ${filteredSignals.length} signals from database (user: ${userInfo})`)
    
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
