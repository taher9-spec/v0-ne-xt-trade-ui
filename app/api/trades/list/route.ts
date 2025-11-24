import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getUserTrades } from "@/lib/supabase/trades"

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ trades: [], stats: null })
    }

    // Use helper function to get user trades with computed PnL
    const { trades, stats } = await getUserTrades(userId, 50)

    return NextResponse.json({ trades, stats })
  } catch (error: any) {
    console.error("[v0] Unexpected error in /api/trades/list:", error)
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error.message 
    }, { status: 500 })
  }
}
