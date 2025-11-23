import { NextResponse } from "next/server"
import { type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { cookies } from "next/headers"
import { checkRateLimit, getClientIP } from "@/lib/rateLimit"

// Rate limiting: 10 trades per user per minute
const TRADE_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
}

type Body = {
  signalId: string
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized. Please sign in with Telegram." }, { status: 401 })
    }

    // Rate limiting per user
    const rateLimit = checkRateLimit(`trade:${userId}`, TRADE_RATE_LIMIT.maxRequests, TRADE_RATE_LIMIT.windowMs)
    if (!rateLimit.allowed) {
      console.warn(`[v0] Trade rate limit exceeded for user: ${userId}`)
      return NextResponse.json(
        { 
          error: "Too many requests. Please wait before taking another signal.",
          retry_after: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers: {
            "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
          }
        }
      )
    }

    const body = (await request.json()) as Body

    if (!body.signalId) {
      return NextResponse.json({ error: "Missing signalId" }, { status: 400 })
    }

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection failed", details: error.message }, { status: 500 })
    }

    // Get the signal details
    const { data: signal, error: sigErr } = await supabase
      .from("signals")
      .select("*")
      .eq("id", body.signalId)
      .single()

    if (sigErr || !signal) {
      console.error("[v0] Signal not found", sigErr)
      return NextResponse.json({ 
        error: "Signal not found", 
        details: sigErr?.message 
      }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("trades")
      .insert({
        user_id: userId,
        signal_id: body.signalId,
        symbol: signal.symbol,
        direction: signal.direction,
        entry_price: signal.entry,
        timeframe: signal.type,
        status: "open",
        opened_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error inserting trade:", error)
      return NextResponse.json({ 
        error: "Failed to record trade", 
        details: error.message 
      }, { status: 500 })
    }

    return NextResponse.json({ trade: data })
  } catch (error: any) {
    console.error("[v0] Unexpected error in /api/trades/mark-taken:", error)
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error.message 
    }, { status: 500 })
  }
}
