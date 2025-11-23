import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId")

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: trades, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .order("opened_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("[v0] Error fetching trades", error)
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 })
  }

  // Calculate stats
  const stats = {
    total: trades?.length ?? 0,
    wins: trades?.filter((t) => (t.result_r ?? 0) > 0).length ?? 0,
    losses: trades?.filter((t) => (t.result_r ?? 0) < 0).length ?? 0,
    open: trades?.filter((t) => t.status === "open").length ?? 0,
  }

  return NextResponse.json({ trades: trades ?? [], stats })
}
