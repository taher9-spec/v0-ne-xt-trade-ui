// smart-endpoint/index.ts
// Multi-timeframe, multi-indicator signal engine v2
// Uses FMP premium technical indicators + local calculations
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
// @ts-ignore - JSR imports work at runtime in Deno
import { createClient } from "jsr:@supabase/supabase-js@2"

// Type declarations for Deno global (for IDE type checking)
// Note: Deno is already available in the runtime, this is just for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const FMP_API_KEY = Deno.env.get("FMP_API_KEY")
const FMP_BASE = "https://financialmodelingprep.com/api/v3"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

// Signal score thresholds for confidence levels (0-100)
// Level 1 (60-74): Partial matches, lower confidence
// Level 2 (75-89): Good matches, medium confidence  
// Level 3 (90+): Strong matches, high confidence
const SIGNAL_SCORE_THRESHOLD = 60 // Minimum to generate signal
const CONFIDENCE_LEVEL_2 = 75
const CONFIDENCE_LEVEL_3 = 90

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
 * Note: Only used for EMA now, RSI is calculated locally
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
    // Map timeframe to FMP format for technical indicators
    // FMP technical indicators API expects: 1min, 5min, 15min, 30min, 1hour, 4hour, 1day
    let fmpTimeframe = timeframe
    if (timeframe === "1min") fmpTimeframe = "1min"
    else if (timeframe === "5min") fmpTimeframe = "5min"
    else if (timeframe === "15min") fmpTimeframe = "15min"
    else if (timeframe === "1h") fmpTimeframe = "1hour"
    else if (timeframe === "4h") fmpTimeframe = "4hour"
    else if (timeframe === "1day") fmpTimeframe = "1day"
    else {
      console.error(`[smart-endpoint] Unsupported timeframe for indicators: ${timeframe}`)
      return null
    }

    const url = `${FMP_BASE}/stable/technical-indicators/${indicator}?symbol=${encodeURIComponent(symbol)}&periodLength=${periodLength}&timeframe=${fmpTimeframe}&apikey=${FMP_API_KEY}`
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      console.error(`[smart-endpoint] FMP ${indicator} API error for ${symbol} ${timeframe}: ${response.status} - ${errorText.substring(0, 200)}`)
      return null
    }

    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`[smart-endpoint] FMP ${indicator} returned empty data for ${symbol} ${timeframe}`)
      return null
    }

    // Sort by date ascending (oldest first)
    return data.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime()
      const dateB = new Date(b.date || 0).getTime()
      return dateA - dateB
    })
  } catch (error) {
    console.error(`[smart-endpoint] Error fetching ${indicator} for ${symbol} ${timeframe}:`, error)
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
  confidenceLevel: 1 | 2 | 3
} | null> {
  // Fetch candles and EMA data in parallel
  // We'll calculate RSI, MACD, and ATR locally from candles
  const [ema20Data, ema50Data, ema200Data, candles] = await Promise.all([
    fetchFmpIndicator(symbol, "ema", 20, timeframe),
    fetchFmpIndicator(symbol, "ema", 50, timeframe),
    fetchFmpIndicator(symbol, "ema", 200, timeframe),
    fetchHistoricalCandles(symbol, timeframe, 200), // Need 200 candles for reliable indicators
  ])

  // Validate EMA data - if FMP fails, calculate locally as fallback
  let ema20Now: number
  let ema50Now: number
  let ema200Now: number

  // Require at least 200 candles for reliable indicator calculations
  // But allow slightly less if we have enough for basic calculations
  const minCandles = 200
  if (!candles || candles.length < minCandles) {
    console.warn(`[smart-endpoint] Insufficient candle data for ${symbol} ${timeframe} (got ${candles?.length || 0}, need ${minCandles})`)
    // Try with what we have if it's close (e.g., 150+ candles)
    if (!candles || candles.length < 150) {
      console.log(`[smart-endpoint] Skipping ${symbol} ${timeframe}: Not enough candles for reliable indicators.`)
      return null
    }
  }

  // At this point, candles is guaranteed to be non-null and have at least 150 candles
  const closePricesForEma = candles.map((c) => parseFloat(c.close || c.c || "0"))

  if (ema20Data && ema20Data.length > 0) {
    ema20Now = parseFloat(ema20Data[ema20Data.length - 1].ema || "0")
  } else {
    // Fallback: calculate EMA20 locally
    const ema20Local = ema(closePricesForEma, 20)
    if (ema20Local.length === 0) {
      console.error(`[smart-endpoint] Cannot calculate EMA20 locally for ${symbol} ${timeframe}`)
      return null
    }
    ema20Now = ema20Local[ema20Local.length - 1]
    console.warn(`[smart-endpoint] Using local EMA20 calculation for ${symbol} ${timeframe}`)
  }

  if (ema50Data && ema50Data.length > 0) {
    ema50Now = parseFloat(ema50Data[ema50Data.length - 1].ema || "0")
  } else {
    // Fallback: calculate EMA50 locally
    const ema50Local = ema(closePricesForEma, 50)
    if (ema50Local.length === 0) {
      console.error(`[smart-endpoint] Cannot calculate EMA50 locally for ${symbol} ${timeframe}`)
      return null
    }
    ema50Now = ema50Local[ema50Local.length - 1]
    console.warn(`[smart-endpoint] Using local EMA50 calculation for ${symbol} ${timeframe}`)
  }

  if (ema200Data && ema200Data.length > 0) {
    ema200Now = parseFloat(ema200Data[ema200Data.length - 1].ema || "0")
  } else {
    // Fallback: calculate EMA200 locally
    const ema200Local = ema(closePricesForEma, 200)
    if (ema200Local.length === 0) {
      console.error(`[smart-endpoint] Cannot calculate EMA200 locally for ${symbol} ${timeframe}`)
      return null
    }
    ema200Now = ema200Local[ema200Local.length - 1]
    console.warn(`[smart-endpoint] Using local EMA200 calculation for ${symbol} ${timeframe}`)
  }

  // Get latest values
  const latest = candles.length - 1
  const close = parseFloat(candles[latest].close || candles[latest].c || "0")
  const high = parseFloat(candles[latest].high || candles[latest].h || "0")
  const low = parseFloat(candles[latest].low || candles[latest].l || "0")
  const volume = parseFloat(candles[latest].volume || candles[latest].v || "0")

  // EMA values are already calculated above with fallback logic

  // Extract price arrays for local calculations (candles is guaranteed non-null at this point)
  if (!candles) {
    console.error(`[smart-endpoint] Candles is null for ${symbol} ${timeframe}`)
    return null
  }
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
  if (!candles) {
    console.error(`[smart-endpoint] Candles is null when calculating volume for ${symbol} ${timeframe}`)
    return null
  }
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
    // Log why signal wasn't created for debugging
    console.log(`[smart-endpoint] Signal threshold not met for ${symbol} ${timeframe}: LONG=${longScore.toFixed(1)}, SHORT=${shortScore.toFixed(1)}, threshold=${SIGNAL_SCORE_THRESHOLD}`)
    return null
  }

  // Calculate confidence level (1-3) based on score
  let confidenceLevel: 1 | 2 | 3
  if (score >= CONFIDENCE_LEVEL_3) {
    confidenceLevel = 3
  } else if (score >= CONFIDENCE_LEVEL_2) {
    confidenceLevel = 2
  } else {
    confidenceLevel = 1
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
    confidenceLevel,
  }
}

// ============================================================================
// Main Edge Function Handler
// ============================================================================

Deno.serve(async (req: Request) => {
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
            console.log(`[smart-endpoint] No signal generated for ${fmpSymbol} ${timeframe} (score below threshold or insufficient data)`)
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
                      confidence: signal.confidenceLevel, // 1-3 based on score ranges (60-74=1, 75-89=2, 90+=3)
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
              confidence: signal.confidenceLevel, // 1-3 based on score ranges (60-74=1, 75-89=2, 90+=3)
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
            console.log(`[smart-endpoint] ✅ Created ${signal.direction} signal for ${fmpSymbol} ${timeframe} (score: ${signal.score}, confidence: ${signal.confidenceLevel})`)
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
