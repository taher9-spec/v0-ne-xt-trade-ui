import { getFmpQuote } from "./fmp"

/**
 * Get latest prices for multiple symbols
 * Returns a map of symbol -> price
 */
export async function getLatestPriceForSymbols(symbols: string[]): Promise<Record<string, number>> {
  const priceMap: Record<string, number> = {}

  // Fetch quotes in parallel
  const quotePromises = symbols.map(async (symbol) => {
    try {
      const quote = await getFmpQuote(symbol)
      if (quote && quote.price > 0) {
        return { symbol, price: quote.price }
      }
    } catch (error) {
      console.error(`[v0] Failed to fetch price for ${symbol}:`, error)
    }
    return null
  })

  const results = await Promise.all(quotePromises)

  for (const result of results) {
    if (result) {
      priceMap[result.symbol] = result.price
    }
  }

  return priceMap
}

