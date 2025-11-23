import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabaseServer"

/**
 * GET /api/ai/conversations/current
 * Returns the most recent conversation with its last 30 messages for the current user
 */
export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ conversation: null, messages: [] })
    }

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ conversation: null, messages: [] })
    }

    // Get the latest conversation for this user (from today or last 24 hours)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id, title, created_at")
      .eq("user_id", userId)
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (convoErr) {
      console.error("[v0] Error loading conversation:", convoErr)
      return NextResponse.json({ conversation: null, messages: [] })
    }

    if (!convo) {
      return NextResponse.json({ conversation: null, messages: [] })
    }

    // Load last 30 messages for this conversation
    const { data: msgs, error: msgErr } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", convo.id)
      .order("created_at", { ascending: true })
      .limit(30)

    if (msgErr) {
      console.error("[v0] Error loading messages:", msgErr)
      return NextResponse.json({ conversation: convo, messages: [] })
    }

    return NextResponse.json({
      conversation: convo,
      messages: msgs ?? [],
    })
  } catch (err: any) {
    console.error("[v0] Unexpected error in /api/ai/conversations/current:", err)
    return NextResponse.json({ conversation: null, messages: [] })
  }
}

