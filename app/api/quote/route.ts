import { NextRequest, NextResponse } from "next/server"
import { getFmpQuote } from "@/lib/fmp"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const symbol = searchParams.get("symbol")?.trim().toUpperCase()

    if (!symbol || symbol === "" || symbol === "NULL" || symbol === "UNDEFINED") {
      return NextResponse.json({ error: "Symbol parameter is required" }, { status: 400 })
    }

    // Try to fetch from live_prices first (faster, no API call)
    try {
      const { createClient } = await import("@supabase/supabase-js")
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data: livePrice } = await supabase
          .from("live_prices")
          .select("price, change, change_percent, updated_at")
          .or(`fmp_symbol.eq.${symbol},symbol.eq.${symbol}`)
          .single()
        
        if (livePrice && livePrice.price) {
          return NextResponse.json({
            symbol: symbol,
            price: livePrice.price,
            change: livePrice.change || 0,
            changesPercentage: livePrice.change_percent || 0,
            timestamp: livePrice.updated_at || new Date().toISOString(),
          })
        }
      }
    } catch (e) {
      // Fall back to FMP API if live_prices fails
      console.log("[quote] Live prices not available, using FMP API")
    }

    // Fetch real-time quote from FMP as fallback
    const quote = await getFmpQuote(symbol)

    if (!quote) {
      return NextResponse.json({ error: "Symbol not found" }, { status: 404 })
    }

    // Normalize response
    const normalized = {
      symbol: quote.symbol,
      price: quote.price,
      change: quote.change,
      changesPercentage: quote.changesPercentage,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      previousClose: quote.previousClose,
      volume: quote.volume || 0,
      timestamp: quote.timestamp ? new Date(quote.timestamp * 1000).toISOString() : new Date().toISOString(),
      exchange: quote.exchange || "",
    }

    return NextResponse.json(normalized)
  } catch (error: any) {
    console.error("[v0] Quote API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

