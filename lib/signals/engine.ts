import { getFmpHistoricalCandles, getFmpQuote, type FMPQuote } from "../fmp"
import type { Symbol } from "../symbols"

export interface MarketData {
  quote: FMPQuote | null
  candles: any[]
  prices: number[]
  ema50: number | null
  ema200: number | null
  rsi: number | null
  atr: number | null
  currentPrice: number
}

export interface SignalDraft {
  direction: "long" | "short"
  type: "scalp" | "intraday" | "swing"
  entry: number
  sl: number
  tp1: number
  tp2: number | null
  tp3: number | null
  timeframe: string
  rr_ratio: number
  confidence: number
  reason_summary: string
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
 * Fetch FMP data for a symbol and build market context
 */
export async function fetchFmpDataForSymbol(
  fmpSymbol: string, 
  timeframe: "1min" | "5min" | "15min" | "30min" | "1hour" | "4hour" | "1day" = "1hour"
): Promise<MarketData | null> {
  try {
    // Fetch quote and candles in parallel
    const [quote, candles] = await Promise.all([
      getFmpQuote(fmpSymbol),
      getFmpHistoricalCandles(fmpSymbol, timeframe, 200),
    ])

    if (!Array.isArray(candles) || candles.length < 50) {
      console.log(`[signals/engine] Insufficient candle data for ${fmpSymbol}`)
      return null
    }

    // Extract prices from candles
    const prices = candles
      .map((c: any) => parseFloat(c.close || c.price || "0"))
      .filter((p: number) => p > 0 && !isNaN(p))
      .reverse() // Most recent first

    if (prices.length < 50) {
      console.log(`[signals/engine] Insufficient price data for ${fmpSymbol}`)
      return null
    }

    // Reverse prices for indicator calculation (oldest first)
    const pricesReversed = [...prices].reverse()

    // Calculate indicators
    const ema50 = calculateEMA(pricesReversed, 50)
    const ema200 = calculateEMA(pricesReversed, 200)
    const currentPrice = prices[0] // Most recent price
    const rsi = calculateRSI(pricesReversed, 14)
    const atr = calculateATR(candles, 14)

    if (!ema50 || !ema200 || !currentPrice || !rsi || !atr) {
      console.log(`[signals/engine] Missing indicators for ${fmpSymbol}`)
      return null
    }

    return {
      quote,
      candles,
      prices: pricesReversed,
      ema50,
      ema200,
      rsi,
      atr,
      currentPrice,
    }
  } catch (error: any) {
    console.error(`[signals/engine] Error fetching data for ${fmpSymbol}:`, error)
    return null
  }
}

/**
 * Build signal from FMP market data using trading rules
 * Returns null if no signal should be generated
 */
export function buildSignalFromFmp(
  symbol: Symbol, 
  marketData: MarketData,
  timeframe: "1min" | "5min" | "15min" | "30min" | "1hour" | "4hour" | "1day" = "1hour"
): SignalDraft | null {
  try {
    const { ema50, ema200, currentPrice, rsi, atr } = marketData

    if (!ema50 || !ema200 || !currentPrice || !rsi || !atr) {
      return null
    }

    // Trading rules
    const isBullish = ema50 > ema200
    const isOversold = rsi < 30
    const isOverbought = rsi > 70

    let direction: "long" | "short" | null = null
    let entry = currentPrice
    let sl = 0
    let tp1 = 0
    let tp2: number | null = null
    let tp3: number | null = null
    let reason = ""
    let confidence = 3 // Default confidence (1-5 scale)

    // Long signal: bullish trend + oversold bounce
    if (isBullish && isOversold && rsi > 25) {
      direction = "long"
      sl = entry - atr * 1.5
      const risk = entry - sl
      tp1 = entry + risk * 2 // 2:1 RR
      tp2 = entry + risk * 3 // 3:1 RR
      tp3 = entry + risk * 4 // 4:1 RR
      const tfLabel = timeframe === "1min" ? "1m" : timeframe === "5min" ? "5m" : timeframe === "15min" ? "15m" : timeframe === "30min" ? "30m" : timeframe === "1hour" ? "1h" : timeframe === "4hour" ? "4h" : "1d"
      reason = `Bullish EMA stack (50>200) + RSI oversold bounce (${rsi.toFixed(1)}) on ${tfLabel}; ATR-based stop`
      confidence = rsi < 25 ? 4 : 3
    }
    // Short signal: bearish trend + overbought rejection
    else if (!isBullish && isOverbought && rsi < 75) {
      direction = "short"
      sl = entry + atr * 1.5
      const risk = sl - entry
      tp1 = entry - risk * 2 // 2:1 RR
      tp2 = entry - risk * 3 // 3:1 RR
      tp3 = entry - risk * 4 // 4:1 RR
      const tfLabel = timeframe === "1min" ? "1m" : timeframe === "5min" ? "5m" : timeframe === "15min" ? "15m" : timeframe === "30min" ? "30m" : timeframe === "1hour" ? "1h" : timeframe === "4hour" ? "4h" : "1d"
      reason = `Bearish EMA stack (50<200) + RSI overbought rejection (${rsi.toFixed(1)}) on ${tfLabel}; ATR-based stop`
      confidence = rsi > 75 ? 4 : 3
    }

    if (!direction) {
      return null
    }

    // Calculate RR ratio (based on TP1)
    const risk = Math.abs(entry - sl)
    const reward = Math.abs(tp1 - entry)
    const rrRatio = risk > 0 ? reward / risk : 0

    // Only create signal if RR >= 1.5
    if (rrRatio < 1.5) {
      console.log(`[signals/engine] RR ratio too low for ${symbol.fmp_symbol}: ${rrRatio.toFixed(2)}`)
      return null
    }

    // Determine signal type based on timeframe and market
    let type: "scalp" | "intraday" | "swing" = "intraday"
    if (timeframe === "1min" || timeframe === "5min") {
      type = "scalp"
    } else if (timeframe === "15min" || timeframe === "30min" || timeframe === "1hour") {
      type = "intraday"
    } else {
      type = "swing"
    }

    // Map timeframe to display format
    const timeframeMap: Record<string, string> = {
      "1min": "1m",
      "5min": "5m",
      "15min": "15m",
      "30min": "30m",
      "1hour": "1h",
      "4hour": "4h",
      "1day": "1d"
    }

    return {
      direction,
      type,
      entry,
      sl,
      tp1,
      tp2,
      tp3,
      timeframe: timeframeMap[timeframe] || "1h",
      rr_ratio: rrRatio,
      confidence,
      reason_summary: reason,
    }
  } catch (error: any) {
    console.error(`[signals/engine] Error building signal for ${symbol.fmp_symbol}:`, error)
    return null
  }
}

