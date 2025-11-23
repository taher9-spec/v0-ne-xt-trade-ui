import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { cookies } from "next/headers"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ trades: [], stats: null })
    }

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection failed", details: error.message }, { status: 500 })
    }

    const { data: trades, error } = await supabase
      .from("trades")
      .select("*")
      .eq("user_id", userId)
      .order("opened_at", { ascending: false })
      .limit(100)

    if (error) {
      console.error("[v0] Error fetching trades from Supabase:", error)
      return NextResponse.json({ 
        error: "Failed to fetch trades", 
        details: error.message 
      }, { status: 500 })
    }

    // Calculate stats
    const total = trades?.length ?? 0
    const wins = trades?.filter((t) => (t.result_r ?? 0) > 0).length ?? 0
    const losses = trades?.filter((t) => (t.result_r ?? 0) < 0).length ?? 0
    const open = trades?.filter((t) => t.status === "open").length ?? 0
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0"

    const stats = {
      total,
      wins,
      losses,
      open,
      winRate: parseFloat(winRate),
    }

    return NextResponse.json({ trades: trades ?? [], stats })
  } catch (error: any) {
    console.error("[v0] Unexpected error in /api/trades/list:", error)
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error.message 
    }, { status: 500 })
  }
}
