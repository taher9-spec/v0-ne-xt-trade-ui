import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getAllSignals } from "@/lib/supabase/signals"

/**
 * GET /api/signals/all
 * Returns all signals (not just today's) for the /signals page
 * Requires authenticated user
 */
export async function GET(req: NextRequest) {
  try {
    // Allow both authenticated and unauthenticated users (for free plan visibility)
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    const searchParams = req.nextUrl.searchParams
    const limit = parseInt(searchParams.get("limit") || "100", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)
    const statusFilter = (searchParams.get("status") || "all") as "all" | "active" | "history"
    const symbolFilter = searchParams.get("symbol") || undefined
    const timeframeFilter = searchParams.get("timeframe") || undefined

    // Use helper function to get all signals with filters
    const signals = await getAllSignals({
      symbol: symbolFilter,
      status: statusFilter,
      timeframe: timeframeFilter,
      limit,
      offset,
    })

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

