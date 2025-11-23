import { NextRequest, NextResponse } from "next/server"

const FMP_API_KEY = process.env.FMP_API_KEY
const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const symbol = searchParams.get("symbol")?.trim().toUpperCase()

    if (!symbol) {
      return NextResponse.json({ error: "Symbol parameter is required" }, { status: 400 })
    }

    if (!FMP_API_KEY) {
      return NextResponse.json({ error: "FMP API key not configured" }, { status: 500 })
    }

    // Fetch real-time quote from FMP
    const quoteUrl = `${FMP_BASE_URL}/quote/${encodeURIComponent(symbol)}?apikey=${FMP_API_KEY}`

    const response = await fetch(quoteUrl, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 15 }, // Cache for 15 seconds
    })

    if (!response.ok) {
      console.error(`[v0] FMP quote API error: ${response.status}`)
      return NextResponse.json(
        { error: `Failed to fetch quote: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()

    // FMP returns array for quote endpoint
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "Symbol not found" }, { status: 404 })
    }

    const quote = data[0]

    // Normalize response
    const normalized = {
      symbol: quote.symbol || symbol,
      price: parseFloat(quote.price || quote.close || "0"),
      change: parseFloat(quote.change || "0"),
      changesPercentage: parseFloat(quote.changesPercentage || "0"),
      dayHigh: parseFloat(quote.dayHigh || quote.high || "0"),
      dayLow: parseFloat(quote.dayLow || quote.low || "0"),
      previousClose: parseFloat(quote.previousClose || quote.close || "0"),
      volume: parseFloat(quote.volume || "0"),
      timestamp: quote.timestamp || new Date().toISOString(),
      exchange: quote.exchange || "",
    }

    return NextResponse.json(normalized)
  } catch (error: any) {
    console.error("[v0] Quote API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

