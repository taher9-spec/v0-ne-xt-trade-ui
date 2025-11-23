"use server"

const FMP_API_KEY = process.env.FMP_API_KEY

interface StockQuote {
  symbol: string
  name: string
  price: number
  changesPercentage: number
  change: number
  dayLow: number
  dayHigh: number
  yearHigh: number
  yearLow: number
  marketCap: number
  priceAvg50: number
  priceAvg200: number
  volume: number
  avgVolume: number
  exchange: string
  open: number
  previousClose: number
  eps: number
  pe: number
  earningsAnnouncement: string
  sharesOutstanding: number
  timestamp: number
}

export async function getRealTimeQuotes(symbols: string[]) {
  if (!FMP_API_KEY) {
    console.warn("FMP_API_KEY is missing. Using fallback mock data.")
    // Fallback mock data if no key
    return symbols.map((s) => ({
      symbol: s,
      name: s === "BTCUSD" ? "Bitcoin" : s === "AAPL" ? "Apple Inc." : s,
      price: s === "BTCUSD" ? 95432.1 : 182.5,
      changesPercentage: 1.25,
      change: 2.5,
      dayLow: 180,
      dayHigh: 185,
      previousClose: 180,
      timestamp: Date.now() / 1000,
    })) as StockQuote[]
  }

  try {
    const symbolString = symbols.join(",")
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/${symbolString}?apikey=${FMP_API_KEY}`,
      { next: { revalidate: 10 } }, // Cache for 10 seconds
    )

    if (!res.ok) throw new Error("Failed to fetch data")

    const data = await res.json()
    return data as StockQuote[]
  } catch (error) {
    console.error("FMP API Error:", error)
    return []
  }
}

export async function getHistoricalData(symbol: string) {
  if (!FMP_API_KEY) {
    // Return simple mock sine wave
    const data = []
    let price = 100
    for (let i = 0; i < 30; i++) {
      price = price + (Math.random() - 0.5) * 5
      data.push({ date: `2024-01-${i + 1}`, close: price })
    }
    return data
  }

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=30&apikey=${FMP_API_KEY}`,
      { next: { revalidate: 3600 } },
    )
    const data = await res.json()
    return data.historical ? data.historical.reverse() : []
  } catch (e) {
    console.error(e)
    return []
  }
}
