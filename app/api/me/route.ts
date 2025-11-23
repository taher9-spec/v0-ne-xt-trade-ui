import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabaseServer"

export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value
    if (!userId) {
      return NextResponse.json({ user: null })
    }

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection failed", details: error.message }, { status: 500 })
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, telegram_id, username, full_name, photo_url, plan_code, approx_balance, risk_percent, main_market, session_expires_at")
      .eq("id", userId)
      .single()

    if (error) {
      console.error("[v0] Error fetching user:", error)
      return NextResponse.json({ user: null })
    }

    if (!user) {
      return NextResponse.json({ user: null })
    }

    // Check if session is expired
    if (user.session_expires_at) {
      const expiresAt = new Date(user.session_expires_at)
      if (expiresAt < new Date()) {
        console.log("[v0] Session expired for user:", userId)
        return NextResponse.json({ user: null })
      }
    }

    return NextResponse.json({ user })
  } catch (error: any) {
    console.error("[v0] Unexpected error in /api/me:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}
