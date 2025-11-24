// smart-endpoint/index.ts
// Multi-timeframe, multi-indicator signal engine v2
// Uses FMP premium technical indicators + local calculations
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const FMP_API_KEY = Deno.env.get("FMP_API_KEY")
const FMP_BASE = "https://financialmodelingprep.com/api/v3"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

// Signal score threshold (0-100)
const SIGNAL_SCORE_THRESHOLD = 70

// Timeframe-aware freshness windows (in hours)
const FRESHNESS_WINDOWS: Record<string, number> = {
  "1min": 2,
  "5min": 2,
  "15min": 8,
  "1h": 24,
  "4h": 72, // 3 days
  "1day": 168, // 7 days
}

// ============================================================================
// FMP API Helpers
// ============================================================================

/**
 * Fetch technical indicator from FMP stable API
 */
async function fetchFmpIndicator(
  symbol: string,
  indicator: "rsi" | "ema",
  periodLength: number,
  timeframe: string
): Promise<any[] | null> {
  if (!FMP_API_KEY) {
    console.error("[smart-endpoint] FMP_API_KEY not configured")
    return null
  }

  try {
    const url = `${FMP_BASE}/stable/technical-indicators/${indicator}?symbol=${encodeURIComponent(symbol)}&periodLength=${periodLength}&timeframe=${timeframe}&apikey=${FMP_API_KEY}`
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    })

    if (!response.ok) {
      console.error(`[smart-endpoint] FMP ${indicator} API error for ${symbol}: ${response.status}`)
      return null
    }

    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) {
      return null
    }

    // Sort by date ascending (oldest first)
    return data.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime()
      const dateB = new Date(b.date || 0).getTime()
      return dateA - dateB
    })
  } catch (error) {
    console.error(`[smart-endpoint] Error fetching ${indicator} for ${symbol}:`, error)
    return null
  }
}

/**
 * Fetch historical candles for ATR calculation
 */
async function fetchHistoricalCandles(
  symbol: string,
  timeframe: string,
  limit: number = 200
): Promise<any[] | null> {
  if (!FMP_API_KEY) {
    return null
  }

  try {
    // Map our timeframe to FMP format
    // FMP supports: 1min, 5min, 15min, 30min, 1hour, 4hour, 1day
    let fmpTimeframe = timeframe
    if (timeframe === "1min") fmpTimeframe = "1min"
    else if (timeframe === "5min") fmpTimeframe = "5min"
    else if (timeframe === "15min") fmpTimeframe = "15min"
    else if (timeframe === "1h") fmpTimeframe = "1hour"
    else if (timeframe === "4h") fmpTimeframe = "4hour"
    else if (timeframe === "1day") fmpTimeframe = "1day"
    else {
      console.error(`[smart-endpoint] Unsupported timeframe: ${timeframe}`)
      return null
    }

    const url = `${FMP_BASE}/historical-chart/${fmpTimeframe}/${encodeURIComponent(symbol)}?apikey=${FMP_API_KEY}&limit=${limit}`
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    })

    if (!response.ok) {
      console.error(`[smart-endpoint] FMP candles API error for ${symbol}: ${response.status}`)
      return null
    }

    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) {
      return null
    }

    // Sort by date ascending
    return data.sort((a, b) => {
      const dateA = new Date(a.date || a.time || 0).getTime()
      const dateB = new Date(b.date || b.time || 0).getTime()
      return dateA - dateB
    }).slice(-limit)
  } catch (error) {
    console.error(`[smart-endpoint] Error fetching candles for ${symbol}:`, error)
    return null
  }
}

// ============================================================================
// Local Indicator Calculations (for MACD and ATR)
// ============================================================================

/**
 * Exponential Moving Average (EMA)
 */
function ema(series: number[], period: number): number[] {
  if (series.length < period) return []

  const multiplier = 2 / (period + 1)
  const result: number[] = []

  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += series[i]
  }
  result.push(sum / period)

  for (let i = period; i < series.length; i++) {
    const emaValue = (series[i] - result[result.length - 1]) * multiplier + result[result.length - 1]
    result.push(emaValue)
  }

  return result
}

/**
 * Relative Strength Index (RSI) - Wilder's smoothing method
 */
function rsi(series: number[], period: number = 14): number[] {
  if (series.length < period + 1) {
    return []
  }

  const changes: number[] = []
  for (let i = 1; i < series.length; i++) {
    changes.push(series[i] - series[i - 1])
  }

  // Calculate initial average gain and loss
  let avgGain = 0
  let avgLoss = 0

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i]
    } else {
      avgLoss += Math.abs(changes[i])
    }
  }

  avgGain /= period
  avgLoss /= period

  const result: number[] = []

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

    // Wilder's smoothing: newAvg = (oldAvg * (period - 1) + newValue) / period
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
 * Average True Range (ATR) - Wilder's smoothing
 */
function atr(high: number[], low: number[], close: number[], period: number = 14): number[] {
  if (high.length < period + 1 || low.length < period + 1 || close.length < period + 1) {
    return []
  }

  const trueRanges: number[] = []

  for (let i = 1; i < high.length; i++) {
    const tr1 = high[i] - low[i]
    const tr2 = Math.abs(high[i] - close[i - 1])
    const tr3 = Math.abs(low[i] - close[i - 1])
    trueRanges.push(Math.max(tr1, tr2, tr3))
  }

  const result: number[] = []

  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += trueRanges[i]
  }
  result.push(sum / period)

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
): { macd: number[]; signal: number[]; histogram: number[] } {
  if (series.length < slow + signal) {
    return { macd: [], signal: [], histogram: [] }
  }

  const emaFast = ema(series, fast)
  const emaSlow = ema(series, slow)

  const macdLine: number[] = []
  const offset = slow - fast

  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i])
  }

  const signalLine = ema(macdLine, signal)
  const alignedMacd = macdLine.slice(signal - 1)
  const alignedSignal = signalLine

  const histogram = alignedMacd.map((m, i) => m - (alignedSignal[i] || 0))

  return {
    macd: alignedMacd,
    signal: alignedSignal,
    histogram: histogram,
  }
}

// ============================================================================
// Signal Scoring Engine
// ============================================================================

interface IndicatorData {
  close: number
  ema20: number
  ema50: number
  ema200: number
  rsi: number
  rsiPrev: number
  macd: number
  macdSignal: number
  macdHistogram: number
  atr: number
  volume: number
  volumeAvg: number
}

interface HigherTimeframeData {
  ema20: number
  ema50: number
  ema200: number
}

/**
 * Calculate signal score (0-100) based on multiple factors
 */
function calculateSignalScore(
  indicators: IndicatorData,
  direction: "LONG" | "SHORT",
  higherTf?: HigherTimeframeData
): number {
  let score = 0

  // 1. Trend bias (30 points)
  if (direction === "LONG") {
    if (indicators.close > indicators.ema20 && indicators.ema20 > indicators.ema50 && indicators.ema50 >= indicators.ema200) {
      score += 30
    } else if (indicators.ema20 > indicators.ema50) {
      score += 15 // Partial trend
    }
  } else {
    if (indicators.close < indicators.ema20 && indicators.ema20 < indicators.ema50 && indicators.ema50 <= indicators.ema200) {
      score += 30
    } else if (indicators.ema20 < indicators.ema50) {
      score += 15
    }
  }

  // 2. RSI alignment (20 points)
  if (direction === "LONG") {
    if (indicators.rsi > 48 && indicators.rsi < 65 && indicators.rsi > indicators.rsiPrev) {
      score += 20
    } else if (indicators.rsi > 40 && indicators.rsi < 70) {
      score += 10
    }
  } else {
    if (indicators.rsi < 52 && indicators.rsi > 35 && indicators.rsi < indicators.rsiPrev) {
      score += 20
    } else if (indicators.rsi < 60 && indicators.rsi > 30) {
      score += 10
    }
  }

  // 3. MACD alignment (20 points)
  if (direction === "LONG") {
    if (indicators.macd > indicators.macdSignal && indicators.macd > 0 && indicators.macdHistogram > 0) {
      score += 20
    } else if (indicators.macd > indicators.macdSignal) {
      score += 10
    }
  } else {
    if (indicators.macd < indicators.macdSignal && indicators.macd < 0 && indicators.macdHistogram < 0) {
      score += 20
    } else if (indicators.macd < indicators.macdSignal) {
      score += 10
    }
  }

  // 4. Volume confirmation (15 points)
  if (indicators.volume > indicators.volumeAvg * 1.1) {
    score += 15
  } else if (indicators.volume > indicators.volumeAvg * 0.9) {
    score += 7
  }

  // 5. Higher timeframe confirmation (15 points)
  if (higherTf) {
    if (direction === "LONG") {
      if (higherTf.ema20 > higherTf.ema50 && higherTf.ema50 >= higherTf.ema200) {
        score += 15
      }
    } else {
      if (higherTf.ema20 < higherTf.ema50 && higherTf.ema50 <= higherTf.ema200) {
        score += 15
      }
    }
  }

  return Math.min(100, Math.max(0, score))
}

// ============================================================================
// Signal Generation Logic
// ============================================================================

/**
 * Build signal from FMP indicator data
 */
async function buildSignalFromFmp(
  symbol: string,
  symbolId: string,
  timeframe: string,
  higherTimeframe?: string
): Promise<{
  direction: "LONG" | "SHORT"
  entry: number
  stop: number
  target: number
  score: number
  reason: string
} | null> {
  // Fetch candles and EMA data in parallel
  // We'll calculate RSI, MACD, and ATR locally from candles
  const [ema20Data, ema50Data, ema200Data, candles] = await Promise.all([
    fetchFmpIndicator(symbol, "ema", 20, timeframe),
    fetchFmpIndicator(symbol, "ema", 50, timeframe),
    fetchFmpIndicator(symbol, "ema", 200, timeframe),
    fetchHistoricalCandles(symbol, timeframe, 200),
  ])

  // Validate data
  if (!ema20Data || ema20Data.length === 0) {
    console.error(`[smart-endpoint] Missing EMA20 data for ${symbol} ${timeframe}`)
    return null
  }
  if (!ema50Data || ema50Data.length === 0) {
    console.error(`[smart-endpoint] Missing EMA50 data for ${symbol} ${timeframe}`)
    return null
  }
  if (!ema200Data || ema200Data.length === 0) {
    console.error(`[smart-endpoint] Missing EMA200 data for ${symbol} ${timeframe}`)
    return null
  }
  if (!candles || candles.length < 200) {
    console.error(`[smart-endpoint] Missing or insufficient candle data for ${symbol} ${timeframe} (got ${candles?.length || 0}, need 200)`)
    return null
  }

  // Get latest values
  const latest = candles.length - 1
  const close = parseFloat(candles[latest].close || candles[latest].c || "0")
  const high = parseFloat(candles[latest].high || candles[latest].h || "0")
  const low = parseFloat(candles[latest].low || candles[latest].l || "0")
  const volume = parseFloat(candles[latest].volume || candles[latest].v || "0")

  const ema20Now = parseFloat(ema20Data[ema20Data.length - 1].ema || "0")
  const ema50Now = parseFloat(ema50Data[ema50Data.length - 1].ema || "0")
  const ema200Now = parseFloat(ema200Data[ema200Data.length - 1].ema || "0")

  // Extract price arrays for local calculations
  const closePrices = candles.map((c) => parseFloat(c.close || c.c || "0"))
  const highPrices = candles.map((c) => parseFloat(c.high || c.h || "0"))
  const lowPrices = candles.map((c) => parseFloat(c.low || c.l || "0"))

  // Calculate RSI locally (Wilder's method)
  const rsiSeries = rsi(closePrices, 14)
  if (rsiSeries.length < 2) {
    console.error(`[smart-endpoint] Insufficient data for RSI calculation for ${symbol} ${timeframe}`)
    return null
  }
  const rsiNow = rsiSeries[rsiSeries.length - 1]
  const rsiPrev = rsiSeries[rsiSeries.length - 2]

  // Calculate MACD from close prices
  const macdData = macd(closePrices, 12, 26, 9)
  if (macdData.macd.length === 0) {
    console.error(`[smart-endpoint] Insufficient data for MACD calculation for ${symbol} ${timeframe}`)
    return null
  }

  const macdNow = macdData.macd[macdData.macd.length - 1]
  const macdSignalNow = macdData.signal[macdData.signal.length - 1]
  const macdHistogram = macdData.histogram[macdData.histogram.length - 1]

  // Calculate ATR
  const atrSeries = atr(highPrices, lowPrices, closePrices, 14)
  if (atrSeries.length === 0) {
    console.error(`[smart-endpoint] Insufficient data for ATR calculation for ${symbol} ${timeframe}`)
    return null
  }
  const atrNow = atrSeries[atrSeries.length - 1]

  // Calculate volume average (last 20 periods)
  const recentVolumes = candles.slice(-20).map((c) => parseFloat(c.volume || c.v || "0"))
  const volumeAvg = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length

  // Fetch higher timeframe data for confirmation (if requested)
  let higherTf: HigherTimeframeData | undefined
  if (higherTimeframe) {
    const [htfEma20, htfEma50, htfEma200] = await Promise.all([
      fetchFmpIndicator(symbol, "ema", 20, higherTimeframe),
      fetchFmpIndicator(symbol, "ema", 50, higherTimeframe),
      fetchFmpIndicator(symbol, "ema", 200, higherTimeframe),
    ])

    if (htfEma20 && htfEma50 && htfEma200) {
      higherTf = {
        ema20: parseFloat(htfEma20[htfEma20.length - 1].ema || "0"),
        ema50: parseFloat(htfEma50[htfEma50.length - 1].ema || "0"),
        ema200: parseFloat(htfEma200[htfEma200.length - 1].ema || "0"),
      }
    }
  }

  // Build indicator data object
  const indicators: IndicatorData = {
    close,
    ema20: ema20Now,
    ema50: ema50Now,
    ema200: ema200Now,
    rsi: rsiNow,
    rsiPrev,
    macd: macdNow,
    macdSignal: macdSignalNow,
    macdHistogram,
    atr: atrNow,
    volume,
    volumeAvg,
  }

  // Calculate scores for both directions
  const longScore = calculateSignalScore(indicators, "LONG", higherTf)
  const shortScore = calculateSignalScore(indicators, "SHORT", higherTf)

  // Determine direction and check threshold
  let direction: "LONG" | "SHORT" | null = null
  let score = 0

  if (longScore >= SIGNAL_SCORE_THRESHOLD && longScore > shortScore) {
    direction = "LONG"
    score = longScore
  } else if (shortScore >= SIGNAL_SCORE_THRESHOLD && shortScore > longScore) {
    direction = "SHORT"
    score = shortScore
  }

  if (!direction) {
    return null
  }

  // Calculate entry, stop, target
  const risk = atrNow * 1.5
  let entry: number
  let stop: number
  let target: number

  if (direction === "LONG") {
    entry = close * 0.999 // Small discount for entry
    stop = entry - risk
    target = entry + risk * 2.5
  } else {
    entry = close * 1.001 // Small premium for short entry
    stop = entry + risk
    target = entry - risk * 2.5
  }

  // Build reason summary
  const reasonParts: string[] = []
  if (indicators.ema20 > indicators.ema50 && indicators.ema50 > indicators.ema200) {
    reasonParts.push("EMA stack bullish")
  } else if (indicators.ema20 < indicators.ema50 && indicators.ema50 < indicators.ema200) {
    reasonParts.push("EMA stack bearish")
  }
  reasonParts.push(`RSI ${rsiNow.toFixed(1)}`)
  if (macdNow > macdSignalNow) {
    reasonParts.push("MACD bullish")
  } else {
    reasonParts.push("MACD bearish")
  }
  if (volume > volumeAvg * 1.1) {
    reasonParts.push("high volume")
  }
  if (higherTf) {
    reasonParts.push(`HTF ${higherTimeframe} aligned`)
  }

  return {
    direction,
    entry,
    stop,
    target,
    score,
    reason: reasonParts.join(", "),
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

  // Parse request body
  let body: { source?: string; timeframes?: string[] } = {}
  try {
    if (req.method === "POST") {
      const text = await req.text()
      if (text) {
        body = JSON.parse(text)
      }
    }
  } catch (e) {
    console.error("[smart-endpoint] Error parsing request body:", e)
  }

  const source = body.source || "cron"
  const requestedTimeframes = body.timeframes || ["5min", "1h"] // Default

  const stats = {
    evaluated: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    // 1) Load all active symbols
    const { data: symbols, error: symError } = await supabase
      .from("symbols")
      .select("id, fmp_symbol, display_symbol, asset_class")
      .eq("is_active", true)

    if (symError) {
      console.error("[smart-endpoint] Error loading symbols:", symError)
      return new Response(
        JSON.stringify({ error: symError.message, ...stats }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!symbols || symbols.length === 0) {
      return new Response(
        JSON.stringify({ ...stats, message: "No active symbols found" }),
        { headers: { "Content-Type": "application/json" } }
      )
    }

    console.log(`[smart-endpoint] Processing ${symbols.length} symbols for timeframes: ${requestedTimeframes.join(", ")}`)

    // 2) Process each symbol and timeframe combination
    for (const symbol of symbols) {
      const fmpSymbol = symbol.fmp_symbol || symbol.display_symbol

      if (!fmpSymbol) {
        stats.errors.push(`Symbol ${symbol.id} has no FMP symbol`)
        continue
      }

      for (const timeframe of requestedTimeframes) {
        try {
          stats.evaluated++

          // 3) Check freshness window
          const freshnessHours = FRESHNESS_WINDOWS[timeframe] || 8
          const freshnessCutoff = new Date(Date.now() - freshnessHours * 60 * 60 * 1000).toISOString()

          const { data: existing, error: exError } = await supabase
            .from("signals")
            .select("id, signal_score")
            .eq("symbol_id", symbol.id)
            .eq("timeframe", timeframe)
            .eq("status", "active")
            .gte("created_at", freshnessCutoff)
            .limit(1)
            .maybeSingle()

          if (exError) {
            stats.errors.push(`${fmpSymbol} ${timeframe}: Error checking existing - ${exError.message}`)
            continue
          }

          // 4) Determine higher timeframe for confirmation
          let higherTf: string | undefined
          if (timeframe === "1min" || timeframe === "5min" || timeframe === "15min") {
            higherTf = "1h"
          } else if (timeframe === "1h") {
            higherTf = "4h"
          } else if (timeframe === "4h") {
            higherTf = "1day"
          }

          // 5) Build signal
          const signal = await buildSignalFromFmp(fmpSymbol, symbol.id, timeframe, higherTf)

          if (!signal) {
            stats.skipped++
            continue
          }

          // 6) If existing signal, update if new score is higher
          if (existing) {
            const existingScore = parseFloat(String(existing.signal_score || 0))
            if (signal.score > existingScore) {
              // Update existing signal
              const { error: updateError } = await supabase
                .from("signals")
                .update({
                  entry: signal.entry,
                  sl: signal.stop,
                  tp1: signal.target,
                  signal_score: signal.score,
                  engine_version: "v2-mtf-ta",
                  reason_summary: signal.reason,
                  activated_at: new Date().toISOString(),
                })
                .eq("id", existing.id)

              if (updateError) {
                stats.errors.push(`${fmpSymbol} ${timeframe}: Update error - ${updateError.message}`)
              } else {
                stats.updated++
                console.log(`[smart-endpoint] ✅ Updated ${signal.direction} signal for ${fmpSymbol} ${timeframe} (score: ${signal.score})`)
              }
            } else {
              stats.skipped++
              console.log(`[smart-endpoint] Skipping ${fmpSymbol} ${timeframe}: existing signal score (${existingScore}) >= new (${signal.score})`)
            }
            continue
          }

          // 7) Insert new signal
          const { data: insertedSignal, error: insError } = await supabase
            .from("signals")
            .insert({
              symbol: fmpSymbol,
              symbol_id: symbol.id,
              timeframe: timeframe,
              direction: signal.direction,
              type: timeframe === "1min" || timeframe === "5min" ? "scalp" : timeframe === "15min" || timeframe === "1h" ? "intraday" : "swing",
              market: symbol.asset_class || "crypto",
              entry: signal.entry,
              sl: signal.stop,
              tp1: signal.target,
              status: "active",
              engine_version: "v2-mtf-ta",
              signal_score: signal.score,
              activated_at: new Date().toISOString(),
              reason_summary: signal.reason,
              rr_ratio: 2.5,
              confidence: Math.min(5, Math.floor(signal.score / 20)), // 1-5 based on score
            })
            .select("id")
            .single()

          if (insError) {
            if (insError.code === "23505" || insError.message?.includes("duplicate")) {
              stats.skipped++
              console.log(`[smart-endpoint] Skipping ${fmpSymbol} ${timeframe}: duplicate (unique index)`)
            } else {
              stats.errors.push(`${fmpSymbol} ${timeframe}: Insert error - ${insError.message}`)
              console.error(`[smart-endpoint] Error inserting signal for ${fmpSymbol} ${timeframe}:`, insError)
            }
            continue
          }

          if (insertedSignal) {
            stats.inserted++
            console.log(`[smart-endpoint] ✅ Created ${signal.direction} signal for ${fmpSymbol} ${timeframe} (score: ${signal.score})`)
          }
        } catch (symbolTfError: any) {
          const errorMsg = `${fmpSymbol} ${timeframe}: ${symbolTfError.message || "Unknown error"}`
          stats.errors.push(errorMsg)
          console.error(`[smart-endpoint] Error processing ${fmpSymbol} ${timeframe}:`, symbolTfError)
        }
      }
    }

    console.log(
      `[smart-endpoint] Summary: ${stats.evaluated} evaluated, ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors.length} errors`
    )

    return new Response(
      JSON.stringify({
        source,
        timeframes: requestedTimeframes,
        ...stats,
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
        ...stats,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
