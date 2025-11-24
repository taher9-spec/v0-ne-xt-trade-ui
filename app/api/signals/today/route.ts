import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getTodaySignals } from "@/lib/supabase/signals"

export async function GET(req: NextRequest) {
  try {
    // Require authenticated user
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = req.nextUrl.searchParams
    const limit = parseInt(searchParams.get("limit") || "50", 10)

    // Use helper function to get today's signals
    const signals = await getTodaySignals(limit)

    // Filter by symbolId if provided (client-side filter after fetch)
    const symbolId = searchParams.get("symbolId")
    const filteredSignals = symbolId
      ? signals.filter((s) => s.symbol_id === symbolId)
      : signals

    console.log(`[v0] Returning ${filteredSignals.length} signals from database`)
    
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
