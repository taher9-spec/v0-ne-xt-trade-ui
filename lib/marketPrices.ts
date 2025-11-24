import { getFmpQuote } from "./fmp"

export type LatestPriceInfo = {
  price: number
  updatedAt: string | null
}

/**
 * Get latest prices for multiple symbols
 * Returns a map of symbol -> { price, updatedAt }
 */
export async function getLatestPriceForSymbols(symbols: string[]): Promise<Record<string, LatestPriceInfo>> {
  const priceMap: Record<string, LatestPriceInfo> = {}

  // Fetch quotes in parallel
  const quotePromises = symbols.map(async (symbol) => {
    try {
      const quote = await getFmpQuote(symbol)
      if (quote && quote.price > 0) {
        const timestamp = quote.timestamp
          ? new Date(Number(quote.timestamp) * 1000).toISOString()
          : new Date().toISOString()
        return { symbol, price: quote.price, updatedAt: timestamp }
      }
    } catch (error) {
      console.error(`[v0] Failed to fetch price for ${symbol}:`, error)
    }
    return null
  })

  const results = await Promise.all(quotePromises)

  for (const result of results) {
    if (result) {
      priceMap[result.symbol] = { price: result.price, updatedAt: result.updatedAt }
    }
  }

  return priceMap
}

