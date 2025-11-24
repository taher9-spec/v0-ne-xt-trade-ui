import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createSupabaseClient } from "@/lib/supabase/client"
import { assertUserWithinSignalQuota } from "@/lib/supabase/quota"
import { checkRateLimit, getClientIP } from "@/lib/rateLimit"

// Rate limiting: 10 trades per user per minute
const TRADE_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limiting
    const clientIP = getClientIP(req)
    const rateLimitKey = `trade:user:${userId}`
    const rateLimit = checkRateLimit(rateLimitKey, TRADE_RATE_LIMIT.maxRequests, TRADE_RATE_LIMIT.windowMs)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retry_after: Math.ceil((rateLimit.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() } }
      )
    }

    const body = await req.json()
    const { signalId } = body

    if (!signalId) {
      return NextResponse.json({ error: "signalId is required" }, { status: 400 })
    }

    // Check quota before proceeding
    const quotaCheck = await assertUserWithinSignalQuota(userId)
    if (!quotaCheck.allowed) {
      return NextResponse.json({ error: quotaCheck.reason || "Quota exceeded" }, { status: 403 })
    }

    const supabase = createSupabaseClient()

    // Fetch signal details with symbol join
    const { data: signal, error: signalError } = await supabase
      .from("signals")
      .select("*, symbol_id, symbols(fmp_symbol, display_symbol, name)")
      .eq("id", signalId)
      .single()

    if (signalError || !signal) {
      console.error("[v0] Signal fetch error:", signalError)
      return NextResponse.json({ error: "Signal not found" }, { status: 404 })
    }

    // Check if signal is still active (if status column exists)
    if (signal.status && signal.status !== "active" && signal.status !== "pending") {
      return NextResponse.json({ error: "Signal is no longer active" }, { status: 400 })
    }

    // Check if user already took this signal
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

    // Get user's risk settings
    const { data: user } = await supabase
      .from("users")
      .select("risk_percent, approx_balance")
      .eq("id", userId)
      .single()

    const riskPercent = (user?.risk_percent || 1.0) / 100
    const balance = parseFloat(user?.approx_balance || "500")
    const riskAmount = balance * riskPercent

    // Calculate position size (simplified - assumes 1:1 risk)
    const entry = typeof signal.entry === "number" ? signal.entry : parseFloat(String(signal.entry || "0"))
    const sl = typeof signal.sl === "number" ? signal.sl : parseFloat(String(signal.sl || "0"))
    const riskPerUnit = Math.abs(entry - sl)
    const size = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0

    // Build trade insert object with required fields
    // Note: trades table uses entry_price, not entry
    const tradeData: any = {
      user_id: userId,
      signal_id: signalId,
      symbol: signal.symbol || "UNKNOWN",
      direction: signal.direction,
      entry_price: entry, // Use entry from signal (mapped to entry_price in trades table)
      sl: sl, // Use sl from signal
      tp1: signal.tp1 !== null && signal.tp1 !== undefined 
        ? (typeof signal.tp1 === "number" ? signal.tp1 : parseFloat(String(signal.tp1)))
        : null,
      status: "open",
      opened_at: new Date().toISOString(),
    }

    // Add optional fields if they exist
    if (signal.symbol_id) tradeData.symbol_id = signal.symbol_id
    if (signal.timeframe) tradeData.timeframe = signal.timeframe

    // Create trade
    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .insert(tradeData)
      .select()
      .single()

    if (tradeError) {
      console.error("[v0] Trade creation error:", tradeError)
      return NextResponse.json({ error: "Failed to create trade" }, { status: 500 })
    }

    return NextResponse.json({ taken: true, tradeId: trade.id, trade })
  } catch (error: any) {
    console.error("[v0] Unexpected error in /api/trades/take:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

