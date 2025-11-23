import { NextRequest, NextResponse } from "next/server"
import { searchFmpSymbols, determineAssetClass } from "@/lib/fmp"
import { getSymbolByFmpSymbol } from "@/lib/symbols"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const query = searchParams.get("query")?.trim()

    if (!query || query.length < 2) {
      return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 })
    }

    // Search FMP API
    const fmpResults = await searchFmpSymbols(query, 10)

    // Map FMP results to our format
    const results = fmpResults.map((item) => ({
      symbol: item.symbol,
      name: item.name,
      exchange: item.exchangeShortName || item.stockExchange || "",
      asset_class: determineAssetClass(item),
    }))

    return NextResponse.json({ results: results.slice(0, 10) })
  } catch (error: any) {
    console.error("[v0] Symbol search error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


