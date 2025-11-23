import { getAllSymbols, getSymbolByFmpSymbol, upsertSymbol } from "./symbols"

const FMP_API_KEY = process.env.FMP_API_KEY
const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"

export interface FMPQuote {
  symbol: string
  name: string
  price: number
  changesPercentage: number
  change: number
  dayLow: number
  dayHigh: number
  previousClose: number
  volume?: number
  timestamp?: number
  exchange?: string
}

export interface FMPSearchResult {
  symbol: string
  name: string
  currency?: string
  stockExchange?: string
  exchangeShortName?: string
}

/**
 * Search for symbols using FMP API
 */
export async function searchFmpSymbols(query: string, limit: number = 10): Promise<FMPSearchResult[]> {
  if (!FMP_API_KEY) {
    console.warn("[v0] FMP_API_KEY not configured")
    return []
  }

  try {
    const searchUrl = `${FMP_BASE_URL}/search?query=${encodeURIComponent(query)}&limit=${limit}&apikey=${FMP_API_KEY}`
    const response = await fetch(searchUrl, {
      headers: { "Accept": "application/json" },
    })

    if (!response.ok) {
      console.error(`[v0] FMP search API error: ${response.status}`)
      return []
    }

    const data = await response.json()
    return Array.isArray(data) ? data : []
  } catch (error: any) {
    console.error("[v0] FMP search error:", error)
    return []
  }
}

/**
 * Get real-time quote for a symbol
 */
export async function getFmpQuote(symbol: string): Promise<FMPQuote | null> {
  if (!FMP_API_KEY) {
    console.warn("[v0] FMP_API_KEY not configured")
    return null
  }

  try {
    const quoteUrl = `${FMP_BASE_URL}/quote/${encodeURIComponent(symbol)}?apikey=${FMP_API_KEY}`
    const response = await fetch(quoteUrl, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 15 }, // Cache for 15 seconds
    })

    if (!response.ok) {
      console.error(`[v0] FMP quote API error: ${response.status}`)
      return null
    }

    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) {
      return null
    }

    const quote = data[0]
    return {
      symbol: quote.symbol || symbol,
      name: quote.name || symbol,
      price: parseFloat(quote.price || quote.close || "0"),
      changesPercentage: parseFloat(quote.changesPercentage || "0"),
      change: parseFloat(quote.change || "0"),
      dayLow: parseFloat(quote.dayLow || quote.low || "0"),
      dayHigh: parseFloat(quote.dayHigh || quote.high || "0"),
      previousClose: parseFloat(quote.previousClose || quote.close || "0"),
      volume: quote.volume ? parseFloat(quote.volume) : undefined,
      timestamp: quote.timestamp,
      exchange: quote.exchange,
    }
  } catch (error: any) {
    console.error("[v0] FMP quote error:", error)
    return null
  }
}

/**
 * Get historical candles for a symbol
 */
export async function getFmpHistoricalCandles(
  symbol: string,
  timeframe: "1min" | "5min" | "15min" | "30min" | "1hour" | "4hour" | "1day" = "1hour",
  limit: number = 200
): Promise<any[]> {
  if (!FMP_API_KEY) {
    console.warn("[v0] FMP_API_KEY not configured")
    return []
  }

  try {
    const candlesUrl = `${FMP_BASE_URL}/historical-chart/${timeframe}/${encodeURIComponent(symbol)}?apikey=${FMP_API_KEY}&limit=${limit}`
    const response = await fetch(candlesUrl, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 300 }, // Cache for 5 minutes
    })

    if (!response.ok) {
      console.error(`[v0] FMP candles API error: ${response.status}`)
      return []
    }

    const data = await response.json()
    return Array.isArray(data) ? data : []
  } catch (error: any) {
    console.error("[v0] FMP candles error:", error)
    return []
  }
}

/**
 * Determine asset class from FMP search result
 */
export function determineAssetClass(result: FMPSearchResult): "forex" | "crypto" | "stock" | "index" | "commodity" {
  const symbol = (result.symbol || "").toUpperCase()
  const exchange = (result.exchangeShortName || result.stockExchange || "").toLowerCase()

  // Crypto
  if (symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("USD") || exchange.includes("crypto")) {
    return "crypto"
  }

  // Forex
  if (
    symbol.includes("USD") &&
    (symbol.includes("EUR") || symbol.includes("GBP") || symbol.includes("JPY") || symbol.includes("XAU"))
  ) {
    return "forex"
  }

  // Commodity
  if (symbol.includes("XAU") || symbol.includes("XAG") || symbol.includes("OIL")) {
    return "commodity"
  }

  // Index
  if (symbol.includes("SPX") || symbol.includes("DJI") || symbol.includes("NDX")) {
    return "index"
  }

  // Default to stock
  return "stock"
}

