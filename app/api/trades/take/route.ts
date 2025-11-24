import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createSupabaseClient } from "@/lib/supabase/client"
import { assertUserWithinSignalQuota } from "@/lib/supabase/quota"
import { checkRateLimit, getClientIP } from "@/lib/rateLimit"

// Rate limiting: 10 trades per user per minute (production-ready for 400+ users)
const TRADE_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
}

/**
 * POST /api/trades/take
 * Creates a new trade from a signal
 * Production-ready with proper error handling, rate limiting, and security
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authentication check
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Rate limiting (prevent abuse)
    const rateLimitKey = `trade:user:${userId}`
    const rateLimit = checkRateLimit(rateLimitKey, TRADE_RATE_LIMIT.maxRequests, TRADE_RATE_LIMIT.windowMs)

    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { 
          status: 429, 
          headers: { "Retry-After": retryAfter.toString() } 
        }
      )
    }

    // 3. Parse and validate request body
    let body
    try {
      body = await req.json()
    } catch (parseError) {
      console.error("[v0] Invalid JSON in request body:", parseError)
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const { signalId } = body

    if (!signalId || typeof signalId !== "string") {
      return NextResponse.json({ error: "Invalid signal ID" }, { status: 400 })
    }

    // 4. Initialize Supabase client
   const supabase = createServerClient(cookies); // or whatever helper you use

const { data, error } = await supabase
  .from('trades')
  .insert({
    user_id: user.id,        // must match auth.uid()
    signal_id,
    symbol,
    direction,
    entry_price,
    exit_price,
    timeframe,
    status: 'open'
  });


    // 5. Check user quota (plan limits)
    const quotaCheck = await assertUserWithinSignalQuota(userId)
    if (!quotaCheck.allowed) {
      return NextResponse.json({ error: "Quota exceeded" }, { status: 403 })
    }

    // 6. Fetch signal details
    const { data: signal, error: signalError } = await supabase
      .from("signals")
      .select("*, symbol_id, symbols(fmp_symbol, display_symbol, name)")
      .eq("id", signalId)
      .single()

    if (signalError || !signal) {
      console.error("[v0] Signal fetch error:", signalError?.code, signalError?.message)
      return NextResponse.json({ error: "Signal not found" }, { status: 404 })
    }

    // 7. Validate signal is active
    if (signal.status && signal.status !== "active" && signal.status !== "pending") {
      return NextResponse.json({ error: "Signal is no longer active" }, { status: 400 })
    }

    // 8. Check for duplicate trade (prevent double-taking)
    const { data: existingTrade } = await supabase
      .from("trades")
      .select("id")
      .eq("user_id", userId)
      .eq("signal_id", signalId)
      .eq("status", "open")
      .maybeSingle()

    if (existingTrade) {
      return NextResponse.json({ error: "You already took this signal" }, { status: 400 })
    }

    // 9. Get user's risk settings for position sizing
    const { data: user } = await supabase
      .from("users")
      .select("risk_percent, approx_balance")
      .eq("id", userId)
      .single()

    const riskPercent = (user?.risk_percent || 1.0) / 100
    const balance = parseFloat(String(user?.approx_balance || "500"))
    const riskAmount = balance * riskPercent

    // 10. Calculate position size
    const entry = typeof signal.entry === "number" ? signal.entry : parseFloat(String(signal.entry || "0"))
    const sl = typeof signal.sl === "number" ? signal.sl : parseFloat(String(signal.sl || "0"))
    const riskPerUnit = Math.abs(entry - sl)
    const size = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0

    // 11. Build trade data object
    const tradeData: any = {
      user_id: userId,
      signal_id: signalId,
      symbol: signal.symbol || "UNKNOWN",
      direction: signal.direction,
      entry_price: entry,
      sl: sl,
      tp1: signal.tp1 !== null && signal.tp1 !== undefined 
        ? (typeof signal.tp1 === "number" ? signal.tp1 : parseFloat(String(signal.tp1)))
        : null,
      tp2: signal.tp2 !== null && signal.tp2 !== undefined 
        ? (typeof signal.tp2 === "number" ? signal.tp2 : parseFloat(String(signal.tp2)))
        : null,
      tp3: signal.tp3 !== null && signal.tp3 !== undefined 
        ? (typeof signal.tp3 === "number" ? signal.tp3 : parseFloat(String(signal.tp3)))
        : null,
      status: "open",
      opened_at: new Date().toISOString(),
      size: size > 0 ? size : null,
    }

    // Add optional fields
    if (signal.symbol_id) tradeData.symbol_id = signal.symbol_id
    if (signal.timeframe) tradeData.timeframe = signal.timeframe

    // 12. Create trade
    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .insert(tradeData)
      .select()
      .single()

    if (tradeError) {
      // Log full error details server-side only
      console.error("[v0] Trade creation error:", {
        code: tradeError.code,
        message: tradeError.message,
        details: tradeError.details,
        hint: tradeError.hint,
      })
      
      // Return generic error to client (never expose internal details)
      return NextResponse.json({ error: "Failed to create trade" }, { status: 500 })
    }

    // 13. Success response
    return NextResponse.json({ 
      trade: trade,
      taken: true,
    }, { status: 200 })

  } catch (error: any) {
    // Log full error server-side only
    console.error("[v0] Unexpected error in /api/trades/take:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    })
    
    // Return generic error to client (never expose internal details)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


