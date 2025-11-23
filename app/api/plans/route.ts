import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"

export async function GET() {
  try {
    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection failed", details: error.message }, { status: 500 })
    }

    const { data, error } = await supabase.from("plans").select("*").order("sort_order", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching plans:", error)
      return NextResponse.json({ error: "Failed to fetch plans", details: error.message }, { status: 500 })
    }

    return NextResponse.json({ plans: data ?? [] })
  } catch (error: any) {
    console.error("[v0] Unexpected error in /api/plans:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}
