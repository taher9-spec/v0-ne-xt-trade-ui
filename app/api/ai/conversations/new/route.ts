import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabaseServer"

/**
 * POST /api/ai/conversations/new
 * Creates a new conversation row for the current user
 * Returns { id }
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    // Allow anonymous users (user_id will be null)
    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection failed" }, { status: 500 })
    }

    const body = await req.json().catch(() => ({}))
    const title = body.title || "New Conversation"

    const { data: newConvo, error: convoError } = await supabase
      .from("conversations")
      .insert({
        user_id: userId || null,
        title: typeof title === "string" ? title.slice(0, 80) : "New Conversation",
        signal_id: body.signalId || null,
        trade_id: body.tradeId || null,
      })
      .select("id")
      .single()

    if (convoError) {
      console.error("[v0] Failed to create conversation:", convoError)
      return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 })
    }

    return NextResponse.json({ id: newConvo.id })
  } catch (err: any) {
    console.error("[v0] Unexpected error in /api/ai/conversations/new:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

