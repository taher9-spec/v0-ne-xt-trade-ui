import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase.from("plans").select("*").order("sort_order", { ascending: true })

  if (error) {
    console.error("[v0] Error fetching plans", error)
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 })
  }

  return NextResponse.json({ plans: data ?? [] })
}
