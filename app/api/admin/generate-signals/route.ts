import { NextResponse } from "next/server"
import { type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"

const FMP_API_KEY = process.env.FMP_API_KEY
const ADMIN_SECRET = process.env.ADMIN_SECRET || "dev-secret-change-in-production"

// Simple EMA calculation
function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = []
  const multiplier = 2 / (period + 1)
  let sum = 0

  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      sum += prices[i]
      ema.push(sum / (i + 1))
    } else {
      ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1])
    }
  }

  return ema
}

// Simple ATR calculation
function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  const trs: number[] = []
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    )
    trs.push(tr)
  }
  if (trs.length === 0) return 0
  return trs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, trs.length)
}

// Simple RSI calculation
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50

  const changes: number[] = []
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1])
  }

  const gains = changes.filter((c) => c > 0)
  const losses = changes.filter((c) => c < 0).map((c) => Math.abs(c))

  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export async function POST(request: NextRequest) {
  // Check admin secret
  const authHeader = request.headers.get("x-admin-secret")
  if (authHeader !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!FMP_API_KEY) {
    return NextResponse.json({ error: "FMP_API_KEY not configured" }, { status: 500 })
  }

  const supabase = supabaseServer()

  try {
    // For now, only handle XAUUSD (Gold)
    // Note: FMP uses different symbols, try XAUUSD or fallback to commodity endpoint
    const symbol = "XAUUSD"
    
    // Try multiple endpoints for gold data
    let fmpResponse = await fetch(
      `https://financialmodelingprep.com/api/v3/historical-chart/1hour/XAUUSD?apikey=${FMP_API_KEY}`,
      { next: { revalidate: 300 } }
    )
    
    // If XAUUSD doesn't work, try alternative symbol or commodity endpoint
    if (!fmpResponse.ok) {
      fmpResponse = await fetch(
        `https://financialmodelingprep.com/api/v3/historical-chart/1hour/GOLD?apikey=${FMP_API_KEY}`,
        { next: { revalidate: 300 } }
      )
    }

    if (!fmpResponse.ok) {
      throw new Error("Failed to fetch FMP data")
    }

    const candles = await fmpResponse.json()

    if (!candles || candles.length < 200) {
      return NextResponse.json({ error: "Insufficient data from FMP" }, { status: 500 })
    }

    // Extract price arrays (reverse to get chronological order)
    const reversed = candles.reverse()
    const closes = reversed.map((c: any) => parseFloat(c.close))
    const highs = reversed.map((c: any) => parseFloat(c.high))
    const lows = reversed.map((c: any) => parseFloat(c.low))

    const currentPrice = closes[closes.length - 1]

    // Calculate indicators
    const ema200 = calculateEMA(closes, 200)
    const currentEMA200 = ema200[ema200.length - 1]
    const rsi = calculateRSI(closes.slice(-15), 14)
    const atr = calculateATR(highs, lows, closes)

    // Simple rule: Long if price > EMA200 and RSI > 40
    const isLong = currentPrice > currentEMA200 && rsi > 40
    const isShort = currentPrice < currentEMA200 && rsi < 60

    if (!isLong && !isShort) {
      return NextResponse.json({ message: "No signal generated - conditions not met" })
    }

    const direction = isLong ? "long" : "short"
    const entry = currentPrice
    const sl = isLong ? entry - atr * 1.2 : entry + atr * 1.2
    const tp1 = isLong ? entry + atr * 2 : entry - atr * 2

    const reason_summary = `Price ${isLong ? "above" : "below"} EMA200 (${currentEMA200.toFixed(2)}), RSI: ${rsi.toFixed(1)}, ATR-based SL/TP`

    // Check if we already have a signal for today
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: existing } = await supabase
      .from("signals")
      .select("id")
      .eq("symbol", symbol)
      .gte("created_at", today.toISOString())
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json({ message: "Signal already exists for today", signal: existing })
    }

    // Insert signal
    const { data: signal, error } = await supabase
      .from("signals")
      .insert({
        symbol,
        direction,
        type: "intraday",
        market: "forex",
        entry,
        sl,
        tp1,
        tp2: null,
        confidence: 3,
        reason_summary,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error inserting signal", error)
      return NextResponse.json({ error: "Failed to insert signal" }, { status: 500 })
    }

    return NextResponse.json({ signal, message: "Signal generated successfully" })
  } catch (error: any) {
    console.error("[v0] Signal generation error", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

