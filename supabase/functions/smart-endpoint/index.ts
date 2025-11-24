// smart-endpoint/index.ts
// 5-minute scalp engine for Supabase Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const FMP_API_KEY = Deno.env.get("FMP_API_KEY")
const FMP_BASE = "https://financialmodelingprep.com/api/v3"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

// ============================================================================
// Indicator Utilities (Pure Functions)
// ============================================================================

/**
 * Exponential Moving Average (EMA)
 */
function ema(series: number[], period: number): number[] {
  if (series.length < period) return []
  
  const multiplier = 2 / (period + 1)
  const result: number[] = []
  
  // First EMA value is SMA
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += series[i]
  }
  result.push(sum / period)
  
  // Subsequent values use EMA formula
  for (let i = period; i < series.length; i++) {
    const emaValue = (series[i] - result[result.length - 1]) * multiplier + result[result.length - 1]
    result.push(emaValue)
  }
  
  return result
}

/**
 * Relative Strength Index (RSI) - Wilder's method
 */
function rsi(series: number[], period: number = 14): number[] {
  if (series.length < period + 1) return []
  
  const result: number[] = []
  const changes: number[] = []
  
  // Calculate price changes
  for (let i = 1; i < series.length; i++) {
    changes.push(series[i] - series[i - 1])
  }
  
  // Initial average gain and loss
  let avgGain = 0
  let avgLoss = 0
  
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }
  
  avgGain /= period
  avgLoss /= period
  
  // First RSI value
  if (avgLoss === 0) {
    result.push(100)
  } else {
    const rs = avgGain / avgLoss
    result.push(100 - (100 / (1 + rs)))
  }
  
  // Subsequent RSI values using Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    const change = changes[i]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0
    
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    
    if (avgLoss === 0) {
      result.push(100)
    } else {
      const rs = avgGain / avgLoss
      result.push(100 - (100 / (1 + rs)))
    }
  }
  
  return result
}

/**
 * Average True Range (ATR)
 */
function atr(high: number[], low: number[], close: number[], period: number = 14): number[] {
  if (high.length < period + 1 || low.length < period + 1 || close.length < period + 1) {
    return []
  }
  
  const trueRanges: number[] = []
  
  // Calculate True Range for each period
  for (let i = 1; i < high.length; i++) {
    const tr1 = high[i] - low[i]
    const tr2 = Math.abs(high[i] - close[i - 1])
    const tr3 = Math.abs(low[i] - close[i - 1])
    trueRanges.push(Math.max(tr1, tr2, tr3))
  }
  
  // Calculate ATR using Wilder's smoothing
  const result: number[] = []
  
  // Initial ATR is SMA of first period TRs
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += trueRanges[i]
  }
  result.push(sum / period)
  
  // Subsequent ATR values using Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    const atrValue = (result[result.length - 1] * (period - 1) + trueRanges[i]) / period
    result.push(atrValue)
  }
  
  return result
}

/**
 * MACD (Moving Average Convergence Divergence)
 */
function macd(
  series: number[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9
): { macd: number[]; signal: number[] } {
  if (series.length < slow + signal) {
    return { macd: [], signal: [] }
  }
  
  const emaFast = ema(series, fast)
  const emaSlow = ema(series, slow)
  
  // MACD line = EMA(fast) - EMA(slow)
  const macdLine: number[] = []
  const offset = slow - fast // EMA slow starts later
  
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i])
  }
  
  // Signal line = EMA of MACD line
  const signalLine = ema(macdLine, signal)
  
  // Align arrays (signal line is shorter)
  const alignedMacd = macdLine.slice(signal - 1)
  const alignedSignal = signalLine
  
  return {
    macd: alignedMacd,
    signal: alignedSignal,
  }
}

// ============================================================================
// FMP API Helpers
// ============================================================================

/**
 * Fetch 5-minute historical candles from FMP
 */
async function fetch5MinCandles(symbol: string): Promise<any[] | null> {
  if (!FMP_API_KEY) {
    console.error("[smart-endpoint] FMP_API_KEY not configured")
    return null
  }
  
  try {
    const url = `${FMP_BASE}/historical-chart/5min/${encodeURIComponent(symbol)}?apikey=${FMP_API_KEY}`
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    })
    
    if (!response.ok) {
      console.error(`[smart-endpoint] FMP API error for ${symbol}: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    
    if (!Array.isArray(data) || data.length === 0) {
      return null
    }
    
    // Sort by date ascending (oldest first)
    return data.sort((a, b) => {
      const dateA = new Date(a.date || a.time || 0).getTime()
      const dateB = new Date(b.date || b.time || 0).getTime()
      return dateA - dateB
    }).slice(-200) // Get most recent 200 bars
  } catch (error) {
    console.error(`[smart-endpoint] Error fetching candles for ${symbol}:`, error)
    return null
  }
}

// ============================================================================
// Signal Generation Logic
// ============================================================================

/**
 * Build signal from 5-minute candle data
 */
function buildSignalFromCandles(candles: any[]): {
  direction: "LONG" | "SHORT"
  entry: number
  stop: number
  target: number
} | null {
  if (candles.length < 200) {
    return null
  }
  
  // Extract OHLC arrays
  const close: number[] = []
  const high: number[] = []
  const low: number[] = []
  const open: number[] = []
  
  for (const candle of candles) {
    close.push(parseFloat(candle.close || candle.c || "0"))
    high.push(parseFloat(candle.high || candle.h || "0"))
    low.push(parseFloat(candle.low || candle.l || "0"))
    open.push(parseFloat(candle.open || candle.o || "0"))
  }
  
  // Compute indicators
  const ema20 = ema(close, 20)
  const ema50 = ema(close, 50)
  const ema200 = ema(close, 200)
  const rsiSeries = rsi(close, 14)
  const atrSeries = atr(high, low, close, 14)
  const macdData = macd(close, 12, 26, 9)
  
  // Get latest values
  const latestIdx = close.length - 1
  const prevIdx = latestIdx - 1
  
  if (
    ema20.length === 0 ||
    ema50.length === 0 ||
    ema200.length === 0 ||
    rsiSeries.length === 0 ||
    atrSeries.length === 0 ||
    macdData.macd.length === 0
  ) {
    return null
  }
  
  const closeNow = close[latestIdx]
  const openNow = open[latestIdx]
  const ema20Now = ema20[ema20.length - 1]
  const ema50Now = ema50[ema50.length - 1]
  const ema200Now = ema200[ema200.length - 1]
  const rsiNow = rsiSeries[rsiSeries.length - 1]
  const rsiPrev = rsiSeries.length > 1 ? rsiSeries[rsiSeries.length - 2] : rsiNow
  const atrNow = atrSeries[atrSeries.length - 1]
  const macdNow = macdData.macd[macdData.macd.length - 1]
  const macdSignalNow = macdData.signal[macdData.signal.length - 1]
  
  // Calculate ATR ratio
  const atrRatio = atrNow / closeNow
  
  // Apply trading rules
  const longSetup =
    ema20Now > ema50Now &&
    ema50Now > ema200Now &&
    rsiNow > 48 &&
    rsiNow < 65 &&
    rsiNow > rsiPrev &&
    macdNow > macdSignalNow &&
    macdNow > 0 &&
    atrRatio > 0.001 &&
    Math.abs(closeNow - openNow) >= 0.1 * atrNow
  
  const shortSetup =
    ema20Now < ema50Now &&
    ema50Now < ema200Now &&
    rsiNow < 52 &&
    rsiNow > 35 &&
    rsiNow < rsiPrev &&
    macdNow < macdSignalNow &&
    macdNow < 0 &&
    atrRatio > 0.001 &&
    Math.abs(closeNow - openNow) >= 0.1 * atrNow
  
  if (!longSetup && !shortSetup) {
    return null
  }
  
  // Calculate entry, stop, target
  const risk = atrNow * 1.5
  
  if (longSetup) {
    return {
      direction: "LONG",
      entry: closeNow,
      stop: closeNow - risk,
      target: closeNow + risk * 2.5,
    }
  } else {
    return {
      direction: "SHORT",
      entry: closeNow,
      stop: closeNow + risk,
      target: closeNow - risk * 2.5,
    }
  }
}

// ============================================================================
// Main Edge Function Handler
// ============================================================================

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  
  const inserted: number[] = []
  const errors: string[] = []
  
  try {
    // 1) Load all active symbols
    const { data: symbols, error: symError } = await supabase
      .from("symbols")
      .select("id, fmp_symbol, display_symbol")
      .eq("is_active", true)
    
    if (symError) {
      console.error("[smart-endpoint] Error loading symbols:", symError)
      return new Response(
        JSON.stringify({ error: symError.message, inserted: 0, errors: [symError.message] }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }
    
    if (!symbols || symbols.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, errors: [] }),
        { headers: { "Content-Type": "application/json" } }
      )
    }
    
    console.log(`[smart-endpoint] Processing ${symbols.length} symbols`)
    
    // 2) Process each symbol
    for (const symbol of symbols) {
      try {
        const fmpSymbol = symbol.fmp_symbol || symbol.display_symbol
        
        if (!fmpSymbol) {
          errors.push(`Symbol ${symbol.id} has no FMP symbol`)
          continue
        }
        
        // 3) Check for existing active signal (8-hour window)
        const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
        
        const { data: existing, error: exError } = await supabase
          .from("signals")
          .select("id")
          .eq("symbol_id", symbol.id)
          .eq("timeframe", "5m")
          .eq("status", "active")
          .gte("created_at", eightHoursAgo)
          .limit(1)
        
        if (exError) {
          errors.push(`${fmpSymbol}: Error checking existing signals - ${exError.message}`)
          continue
        }
        
        if (existing && existing.length > 0) {
          console.log(`[smart-endpoint] Skipping ${fmpSymbol}: active signal exists within 8 hours`)
          continue
        }
        
        // 4) Fetch 5-minute candles
        const candles = await fetch5MinCandles(fmpSymbol)
        
        if (!candles || candles.length < 200) {
          errors.push(`${fmpSymbol}: Insufficient candle data (got ${candles?.length || 0} bars)`)
          continue
        }
        
        // 5) Build signal from candles
        const signal = buildSignalFromCandles(candles)
        
        if (!signal) {
          console.log(`[smart-endpoint] Skipping ${fmpSymbol}: no setup conditions met`)
          continue
        }
        
        // 6) Insert signal into database
        // Map to actual column names: entry (not entry_price), sl (not stop_loss), tp1 (not target_price)
        const { data: insertedSignal, error: insError } = await supabase
          .from("signals")
          .insert({
            symbol: fmpSymbol, // Keep for backward compatibility
            symbol_id: symbol.id,
            timeframe: "5m",
            direction: signal.direction,
            type: "scalp", // 5-minute is scalp
            market: "crypto", // Will be determined by symbol, but default to crypto
            entry: signal.entry,
            sl: signal.stop,
            tp1: signal.target,
            status: "active",
            engine_version: "5m-scalp-v1.0",
            activated_at: new Date().toISOString(),
            reason_summary: `5m scalp: EMA stack ${signal.direction}, RSI ${signal.direction === "LONG" ? "48-65" : "35-52"}, MACD ${signal.direction === "LONG" ? "bullish" : "bearish"}`,
            rr_ratio: 2.5, // Risk:Reward = 1:2.5
            confidence: 3, // Default confidence
          })
          .select("id")
          .single()
        
        if (insError) {
          // Check if it's a unique constraint violation (duplicate)
          if (insError.code === "23505" || insError.message?.includes("duplicate")) {
            console.log(`[smart-endpoint] Skipping ${fmpSymbol}: duplicate signal (unique index)`)
            continue
          }
          
          errors.push(`${fmpSymbol}: Insert error - ${insError.message}`)
          console.error(`[smart-endpoint] Error inserting signal for ${fmpSymbol}:`, insError)
          continue
        }
        
        if (insertedSignal) {
          inserted.push(1)
          console.log(`[smart-endpoint] ✅ Created ${signal.direction} signal for ${fmpSymbol}`)
        }
      } catch (symbolError: any) {
        const errorMsg = `${symbol.fmp_symbol || symbol.id}: ${symbolError.message || "Unknown error"}`
        errors.push(errorMsg)
        console.error(`[smart-endpoint] Error processing symbol ${symbol.fmp_symbol}:`, symbolError)
        // Continue with next symbol
      }
    }
    
    const insertedCount = inserted.reduce((sum, val) => sum + val, 0)
    
    console.log(`[smart-endpoint] Generated ${insertedCount} signals, ${errors.length} errors`)
    
    return new Response(
      JSON.stringify({
        inserted: insertedCount,
        errors: errors,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error: any) {
    console.error("[smart-endpoint] Fatal error:", error)
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        inserted: inserted.length,
        errors: errors,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})

