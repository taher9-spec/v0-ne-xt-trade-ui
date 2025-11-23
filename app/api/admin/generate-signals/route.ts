import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"

const FMP_API_KEY = process.env.FMP_API_KEY
const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"
const ADMIN_SECRET = process.env.ADMIN_SECRET

export async function POST(req: NextRequest) {
  try {
    // Verify admin secret
    const authHeader = req.headers.get("authorization")
    if (!authHeader || authHeader !== `Bearer ${ADMIN_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!FMP_API_KEY) {
      return NextResponse.json({ error: "FMP API key not configured" }, { status: 500 })
    }

    const supabase = supabaseServer()

    // Get active symbols
    const { data: symbols, error: symbolsError } = await supabase
      .from("symbols")
      .select("id, fmp_symbol, display_symbol, asset_class")
      .eq("is_active", true)

    if (symbolsError || !symbols || symbols.length === 0) {
      return NextResponse.json({ error: "No active symbols found" }, { status: 400 })
    }

    const generatedSignals: any[] = []

    // Process each symbol
    for (const symbol of symbols) {
      try {
        // Fetch historical candles (1H timeframe for now)
        const candlesUrl = `${FMP_BASE_URL}/historical-chart/1hour/${symbol.fmp_symbol}?apikey=${FMP_API_KEY}&limit=200`
        const candlesRes = await fetch(candlesUrl)
        
        if (!candlesRes.ok) continue

        const candles = await candlesRes.json()
        if (!Array.isArray(candles) || candles.length < 50) continue

        // Calculate indicators
        const prices = candles.map((c: any) => parseFloat(c.close || c.price || "0")).filter((p: number) => p > 0)
        if (prices.length < 50) continue

        // Simple EMA calculation (50 and 200)
        const ema50 = calculateEMA(prices, 50)
        const ema200 = calculateEMA(prices, 200)
        const currentPrice = prices[prices.length - 1]
        const rsi = calculateRSI(prices, 14)
        const atr = calculateATR(candles, 14)

        if (!ema50 || !ema200 || !currentPrice || !rsi || !atr) continue

        // Simple trading rules
        const isBullish = ema50 > ema200
        const isOversold = rsi < 30
        const isOverbought = rsi > 70

        // Check for existing active signal for this symbol
        const { data: existingSignal } = await supabase
          .from("signals")
          .select("id")
          .eq("symbol_id", symbol.id)
          .in("status", ["active", "pending"])
          .gte("created_at", new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()) // Last 4 hours
          .maybeSingle()

        if (existingSignal) continue // Skip if signal exists

        let direction: "long" | "short" | null = null
        let entry = currentPrice
        let sl = 0
        let tp1 = 0
        let reason = ""

        // Long signal: bullish trend + oversold bounce
        if (isBullish && isOversold && rsi > 25) {
          direction = "long"
          sl = entry - (atr * 1.5)
          tp1 = entry + (2 * (entry - sl))
          reason = `Bullish EMA stack (50>200) + RSI oversold bounce (${rsi.toFixed(1)}) on H1; ATR-based stop`
        }
        // Short signal: bearish trend + overbought rejection
        else if (!isBullish && isOverbought && rsi < 75) {
          direction = "short"
          sl = entry + (atr * 1.5)
          tp1 = entry - (2 * (sl - entry))
          reason = `Bearish EMA stack (50<200) + RSI overbought rejection (${rsi.toFixed(1)}) on H1; ATR-based stop`
        }

        if (!direction) continue

        // Calculate RR ratio
        const risk = Math.abs(entry - sl)
        const reward = Math.abs(tp1 - entry)
        const rrRatio = risk > 0 ? reward / risk : 0

        // Only create signal if RR >= 1.5
        if (rrRatio < 1.5) continue

        // Insert signal
        const { data: newSignal, error: signalError } = await supabase
          .from("signals")
          .insert({
            symbol_id: symbol.id,
            symbol: symbol.display_symbol,
            direction,
            type: "intraday", // Default to intraday
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

        if (!signalError && newSignal) {
          generatedSignals.push(newSignal)
        }
      } catch (err: any) {
        console.error(`[v0] Error processing symbol ${symbol.fmp_symbol}:`, err)
        continue
      }
    }

    return NextResponse.json({
      success: true,
      generated: generatedSignals.length,
      signals: generatedSignals,
    })
  } catch (error: any) {
    console.error("[v0] Signal generation error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Helper functions for technical indicators
function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null
  
  const multiplier = 2 / (period + 1)
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema
  }

  return ema
}

function calculateRSI(prices: number[], period: number): number | null {
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
  return 100 - (100 / (1 + rs))
}

function calculateATR(candles: any[], period: number): number | null {
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
