import { NextRequest, NextResponse } from "next/server"
import { getFmpQuote } from "@/lib/fmp"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const symbol = searchParams.get("symbol")?.trim().toUpperCase()

    if (!symbol) {
      return NextResponse.json({ error: "Symbol parameter is required" }, { status: 400 })
    }

    // Fetch real-time quote from FMP
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

