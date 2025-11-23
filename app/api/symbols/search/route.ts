import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"

const FMP_API_KEY = process.env.FMP_API_KEY
const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const query = searchParams.get("query")?.trim()

    if (!query || query.length < 2) {
      return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 })
    }

    // Search FMP API
    if (!FMP_API_KEY) {
      return NextResponse.json({ error: "FMP API key not configured" }, { status: 500 })
    }

    // Try multiple FMP search endpoints
    const searchEndpoints = [
      `${FMP_BASE_URL}/search?query=${encodeURIComponent(query)}&limit=10&apikey=${FMP_API_KEY}`,
      `${FMP_BASE_URL}/search-name?query=${encodeURIComponent(query)}&limit=10&apikey=${FMP_API_KEY}`,
    ]

    let results: any[] = []

    for (const endpoint of searchEndpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: { "Accept": "application/json" },
        })

        if (response.ok) {
          const data = await response.json()
          if (Array.isArray(data) && data.length > 0) {
            results = data.map((item: any) => ({
              symbol: item.symbol || item.ticker,
              name: item.name || item.companyName || `${item.symbol} - ${item.exchange || ""}`,
              exchange: item.exchange || "",
              asset_class: determineAssetClass(item),
            }))
            break // Use first successful endpoint
          }
        }
      } catch (err) {
        console.error(`[v0] FMP search error for ${endpoint}:`, err)
        continue
      }
    }

    // If no results from FMP, search our local symbols table
    if (results.length === 0) {
      const supabase = supabaseServer()
      const { data: localSymbols } = await supabase
        .from("symbols")
        .select("fmp_symbol, display_symbol, name, asset_class")
        .or(`fmp_symbol.ilike.%${query}%,name.ilike.%${query}%`)
        .eq("is_active", true)
        .limit(10)

      if (localSymbols) {
        results = localSymbols.map((s) => ({
          symbol: s.fmp_symbol,
          name: s.name || s.display_symbol,
          exchange: "",
          asset_class: s.asset_class,
        }))
      }
    }

    return NextResponse.json({ results: results.slice(0, 10) })
  } catch (error: any) {
    console.error("[v0] Symbol search error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function determineAssetClass(item: any): string {
  const symbol = (item.symbol || item.ticker || "").toUpperCase()
  const exchange = (item.exchange || "").toLowerCase()

  // Crypto
  if (symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("USD") || exchange.includes("crypto")) {
    return "crypto"
  }

  // Forex
  if (symbol.includes("USD") && (symbol.includes("EUR") || symbol.includes("GBP") || symbol.includes("JPY") || symbol.includes("XAU"))) {
    return "forex"
  }

  // Stock
  if (exchange && !exchange.includes("crypto") && !exchange.includes("forex")) {
    return "stock"
  }

  // Default
  return "stock"
}

