import { supabaseServer } from "../supabaseServer"
import type { Signal } from "../types"

/**
 * Seed test signals for development/testing
 * Only runs in non-production or for admin users
 */
export async function seedTestSignals(adminTelegramId?: string): Promise<{ count: number; signals: Signal[] }> {
  // Check if we're in production
  if (process.env.NODE_ENV === "production") {
    // In production, require admin Telegram ID
    if (!adminTelegramId) {
      throw new Error("Admin Telegram ID required in production")
    }

    // Verify admin user exists
    const supabase = supabaseServer()
    const { data: adminUser } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", adminTelegramId)
      .maybeSingle()

    if (!adminUser) {
      throw new Error("Admin user not found")
    }
  }

  const supabase = supabaseServer()

  // Get symbols to link signals
  const { data: symbols } = await supabase
    .from("symbols")
    .select("id, fmp_symbol, display_symbol")
    .in("fmp_symbol", ["XAUUSD", "BTCUSD", "ETHUSD", "AAPL", "NVDA"])
    .eq("is_active", true)

  if (!symbols || symbols.length === 0) {
    throw new Error("No active symbols found. Please seed symbols table first.")
  }

  const symbolMap = new Map(symbols.map((s) => [s.fmp_symbol, s]))

  // Test signals to insert
  const testSignals = [
    {
      symbol: "XAUUSD",
      direction: "long" as const,
      type: "swing" as const,
      market: "forex" as const,
      entry: 2645.5,
      sl: 2630.0,
      tp1: 2665.0,
      tp2: 2680.0,
      tp3: null,
      timeframe: "H4",
      status: "active" as const,
      reason_summary: "Bullish EMA stack + RSI oversold bounce on H4 timeframe",
      confidence: 75,
      engine_version: "v1.0",
    },
    {
      symbol: "BTCUSD",
      direction: "long" as const,
      type: "intraday" as const,
      market: "crypto" as const,
      entry: 95500.0,
      sl: 94000.0,
      tp1: 97500.0,
      tp2: 99000.0,
      tp3: null,
      timeframe: "H1",
      status: "active" as const,
      reason_summary: "Breaking major resistance with high volume accumulation",
      confidence: 80,
      engine_version: "v1.0",
    },
    {
      symbol: "ETHUSD",
      direction: "short" as const,
      type: "scalp" as const,
      market: "crypto" as const,
      entry: 3450.0,
      sl: 3480.0,
      tp1: 3400.0,
      tp2: null,
      tp3: null,
      timeframe: "M15",
      status: "active" as const,
      reason_summary: "Overbought rejection at key resistance level",
      confidence: 70,
      engine_version: "v1.0",
    },
    {
      symbol: "AAPL",
      direction: "long" as const,
      type: "swing" as const,
      market: "stock" as const,
      entry: 182.5,
      sl: 180.0,
      tp1: 186.0,
      tp2: 188.5,
      tp3: null,
      timeframe: "D1",
      status: "active" as const,
      reason_summary: "Bullish breakout above 200 EMA with strong volume",
      confidence: 85,
      engine_version: "v1.0",
    },
  ]

  const insertedSignals: Signal[] = []

  for (const signalData of testSignals) {
    const symbolRow = symbolMap.get(signalData.symbol)
    if (!symbolRow) {
      console.warn(`[v0] Symbol ${signalData.symbol} not found, skipping signal`)
      continue
    }

    // Check if signal already exists (avoid duplicates)
    const { data: existing } = await supabase
      .from("signals")
      .select("id")
      .eq("symbol", signalData.symbol)
      .eq("direction", signalData.direction)
      .eq("status", "active")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .maybeSingle()

    if (existing) {
      console.log(`[v0] Signal for ${signalData.symbol} ${signalData.direction} already exists, skipping`)
      continue
    }

    // Calculate RR ratio
    const risk = Math.abs(signalData.entry - signalData.sl)
    const reward = signalData.tp1 ? Math.abs(signalData.tp1 - signalData.entry) : 0
    const rrRatio = risk > 0 ? reward / risk : 0

    const { data: newSignal, error } = await supabase
      .from("signals")
      .insert({
        symbol_id: symbolRow.id,
        symbol: signalData.symbol,
        direction: signalData.direction,
        type: signalData.type,
        market: signalData.market,
        entry: signalData.entry,
        sl: signalData.sl,
        tp1: signalData.tp1,
        tp2: signalData.tp2,
        tp3: signalData.tp3,
        timeframe: signalData.timeframe,
        status: signalData.status,
        reason_summary: signalData.reason_summary,
        confidence: signalData.confidence,
        engine_version: signalData.engine_version,
        rr_ratio: rrRatio,
        activated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error(`[v0] Error inserting signal for ${signalData.symbol}:`, error)
      continue
    }

    if (newSignal) {
      insertedSignals.push(newSignal as Signal)
      console.log(`[v0] Inserted signal: ${signalData.symbol} ${signalData.direction}`)
    }
  }

  console.log(`[v0] Seeded ${insertedSignals.length} test signals`)
  return { count: insertedSignals.length, signals: insertedSignals }
}

