import { NextResponse } from "next/server"
import { getAllSymbols } from "@/lib/supabase/symbols"
import { getFmpQuote } from "@/lib/fmp"

/**
 * GET /api/market/overview
 * Returns market overview data for symbols from DB
 * Fetches latest prices from FMP for all active symbols
 */
export async function GET() {
  try {
    // Get all active symbols from DB
    const symbols = await getAllSymbols()

    if (symbols.length === 0) {
      return NextResponse.json({ symbols: [], quotes: [] })
    }

    // Limit to top 10 for overview
    const topSymbols = symbols.slice(0, 10)

    // Fetch full quotes for each symbol (includes price, change, changesPercentage, etc.)
    const quotePromises = topSymbols.map(async (symbol) => {
      try {
        const quote = await getFmpQuote(symbol.fmp_symbol)
        if (!quote || quote.price <= 0) return null

        return {
          symbol: symbol.fmp_symbol,
          displaySymbol: symbol.display_symbol,
          name: symbol.name || symbol.display_symbol,
          assetClass: symbol.asset_class,
          price: quote.price,
          change: quote.change,
          changesPercentage: quote.changesPercentage,
          dayHigh: quote.dayHigh,
          dayLow: quote.dayLow,
          previousClose: quote.previousClose,
          timestamp: quote.timestamp,
        }
      } catch (error) {
        console.error(`[v0] Failed to fetch quote for ${symbol.fmp_symbol}:`, error)
        return null
      }
    })

    const quotes = (await Promise.all(quotePromises)).filter(
      (q): q is NonNullable<typeof q> => q !== null
    )

    return NextResponse.json({
      symbols: topSymbols,
      quotes,
    })
  } catch (error: any) {
    console.error("[v0] Error in /api/market/overview:", error)
    return NextResponse.json({ error: "Internal server error", symbols: [], quotes: [] }, { status: 500 })
  }
}

