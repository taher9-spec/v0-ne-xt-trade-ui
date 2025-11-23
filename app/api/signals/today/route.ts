import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()

  // Fetch signals from last 24 hours
  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching signals", error)
    return NextResponse.json({ error: "Failed to fetch signals" }, { status: 500 })
  }

  return NextResponse.json({ signals: data ?? [] })
}
