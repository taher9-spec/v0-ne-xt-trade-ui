import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabaseServer"

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

    // Get the latest conversation for this user
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id, title, created_at")
      .eq("user_id", userId)
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

    // Load all messages for this conversation
    const { data: msgs, error: msgErr } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", convo.id)
      .order("created_at", { ascending: true })

    if (msgErr) {
      console.error("[v0] Error loading messages:", msgErr)
      return NextResponse.json({ conversation: convo, messages: [] })
    }

    return NextResponse.json({
      conversation: convo,
      messages: msgs ?? [],
    })
  } catch (err: any) {
    console.error("[v0] Unexpected error in /api/ai/conversation/latest:", err)
    return NextResponse.json({ conversation: null, messages: [] })
  }
}

