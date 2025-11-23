import { getFmpHistoricalCandles } from "./fmp"
import { getAllSymbols, Symbol } from "./symbols"
import { supabaseServer } from "./supabaseServer"

export interface SignalRule {
  name: string
  description: string
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null

  const multiplier = 2 / (period + 1)
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema
  }

  return ema
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null

  let gains = 0
  let losses = 0

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1]
    if (change > 0) gains += change
    else losses += Math.abs(change)
  }

  const avgGain = gains / period
  const avgLoss = losses / period

  if (avgLoss === 0) return 100

  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/**
 * Calculate ATR (Average True Range)
 */
function calculateATR(candles: any[], period: number = 14): number | null {
  if (candles.length < period + 1) return null

  const trueRanges: number[] = []

  for (let i = candles.length - period; i < candles.length; i++) {
    const high = parseFloat(candles[i].high || candles[i].price || "0")
    const low = parseFloat(candles[i].low || candles[i].price || "0")
    const prevClose = i > 0 ? parseFloat(candles[i - 1].close || candles[i - 1].price || "0") : high

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
    trueRanges.push(tr)
  }

  return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length
}

/**
 * Run signal engine for a single symbol
 * Returns the created signal or null
 */
export async function runSignalEngineForSymbol(symbol: Symbol): Promise<any | null> {
  try {
    console.log(`[v0] Running signal engine for ${symbol.fmp_symbol}`)

    // Fetch historical candles (1H timeframe)
    const candles = await getFmpHistoricalCandles(symbol.fmp_symbol, "1hour", 200)

    if (!Array.isArray(candles) || candles.length < 50) {
      console.log(`[v0] Insufficient data for ${symbol.fmp_symbol}`)
      return null
    }

    // Extract prices
    const prices = candles
      .map((c: any) => parseFloat(c.close || c.price || "0"))
      .filter((p: number) => p > 0 && !isNaN(p))

    if (prices.length < 50) {
      console.log(`[v0] Insufficient price data for ${symbol.fmp_symbol}`)
      return null
    }

    // Calculate indicators
    const ema50 = calculateEMA(prices, 50)
    const ema200 = calculateEMA(prices, 200)
    const currentPrice = prices[prices.length - 1]
    const rsi = calculateRSI(prices, 14)
    const atr = calculateATR(candles, 14)

    if (!ema50 || !ema200 || !currentPrice || !rsi || !atr) {
      console.log(`[v0] Missing indicators for ${symbol.fmp_symbol}`)
      return null
    }

    // Check for existing active signal in last 4 hours
    const supabase = supabaseServer()
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

    const { data: existingSignal } = await supabase
      .from("signals")
      .select("id")
      .eq("symbol_id", symbol.id)
      .in("status", ["active", "pending"])
      .gte("created_at", fourHoursAgo)
      .maybeSingle()

    if (existingSignal) {
      console.log(`[v0] Active signal already exists for ${symbol.fmp_symbol}`)
      return null
    }

    // Simple trading rules
    const isBullish = ema50 > ema200
    const isOversold = rsi < 30
    const isOverbought = rsi > 70

    let direction: "long" | "short" | null = null
    let entry = currentPrice
    let sl = 0
    let tp1 = 0
    let reason = ""

    // Long signal: bullish trend + oversold bounce
    if (isBullish && isOversold && rsi > 25) {
      direction = "long"
      sl = entry - atr * 1.5
      tp1 = entry + 2 * (entry - sl)
      reason = `Bullish EMA stack (50>200) + RSI oversold bounce (${rsi.toFixed(1)}) on H1; ATR-based stop`
    }
    // Short signal: bearish trend + overbought rejection
    else if (!isBullish && isOverbought && rsi < 75) {
      direction = "short"
      sl = entry + atr * 1.5
      tp1 = entry - 2 * (sl - entry)
      reason = `Bearish EMA stack (50<200) + RSI overbought rejection (${rsi.toFixed(1)}) on H1; ATR-based stop`
    }

    if (!direction) {
      console.log(`[v0] No signal conditions met for ${symbol.fmp_symbol}`)
      return null
    }

    // Calculate RR ratio
    const risk = Math.abs(entry - sl)
    const reward = Math.abs(tp1 - entry)
    const rrRatio = risk > 0 ? reward / risk : 0

    // Only create signal if RR >= 1.5
    if (rrRatio < 1.5) {
      console.log(`[v0] RR ratio too low for ${symbol.fmp_symbol}: ${rrRatio.toFixed(2)}`)
      return null
    }

    // Insert signal
    const { data: newSignal, error: signalError } = await supabase
      .from("signals")
      .insert({
        symbol_id: symbol.id,
        symbol: symbol.display_symbol, // Keep for backward compatibility
        direction,
        type: "intraday", // Default
        market: symbol.asset_class,
        timeframe: "H1",
        entry,
        sl,
        tp1,
        status: "active",
        rr_ratio: rrRatio,
        reason_summary: reason,
        engine_version: "v1.0",
        activated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (signalError) {
      console.error(`[v0] Error creating signal for ${symbol.fmp_symbol}:`, signalError)
      return null
    }

    console.log(`[v0] Created ${direction} signal for ${symbol.fmp_symbol}`)
    return newSignal
  } catch (error: any) {
    console.error(`[v0] Error in runSignalEngineForSymbol for ${symbol.fmp_symbol}:`, error)
    return null
  }
}

/**
 * Run signal engine for all active symbols
 */
export async function runSignalEngine(): Promise<{ generated: number; signals: any[] }> {
  try {
    const symbols = await getAllSymbols()
    const signals: any[] = []

    for (const symbol of symbols) {
      const signal = await runSignalEngineForSymbol(symbol)
      if (signal) {
        signals.push(signal)
      }
    }

    return {
      generated: signals.length,
      signals,
    }
  } catch (error: any) {
    console.error("[v0] Error in runSignalEngine:", error)
    return { generated: 0, signals: [] }
  }
}

