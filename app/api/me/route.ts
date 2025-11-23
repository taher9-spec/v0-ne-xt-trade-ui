import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabaseServer"

export async function GET(_req: NextRequest) {
  const userId = cookies().get("tg_user_id")?.value
  if (!userId) {
    return NextResponse.json({ user: null })
  }

  const supabase = supabaseServer()

  const { data: user, error } = await supabase
    .from("users")
    .select("id, telegram_id, username, photo_url, plan_code, approx_balance, risk_percent, main_market")
    .eq("id", userId)
    .single()

  if (error || !user) {
    return NextResponse.json({ user: null })
  }

  return NextResponse.json({ user })
}
