import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { cookies } from "next/headers"

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ trades: [], stats: null })
    }

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection failed", details: error.message }, { status: 500 })
    }

    const { data: trades, error } = await supabase
      .from("trades")
      .select("*, symbol_id, symbols(fmp_symbol, display_symbol)")
      .eq("user_id", userId)
      .order("opened_at", { ascending: false })
      .limit(100)

    if (error) {
      console.error("[v0] Error fetching trades from Supabase:", error)
      return NextResponse.json({ 
        error: "Failed to fetch trades", 
        details: error.message 
      }, { status: 500 })
    }

    // Fetch live prices for open trades
    const FMP_API_KEY = process.env.FMP_API_KEY
    const openTrades = trades?.filter((t) => t.status === "open") || []
    
    if (FMP_API_KEY && openTrades.length > 0) {
      // Fetch quotes for unique symbols
      const uniqueSymbols = [...new Set(openTrades.map((t) => t.symbol).filter(Boolean))]
      
      const quotePromises = uniqueSymbols.map(async (symbol) => {
        try {
          // Use internal API route for quotes
          const quoteUrl = new URL("/api/quote", req.nextUrl.origin)
          quoteUrl.searchParams.set("symbol", symbol)
          const quoteRes = await fetch(quoteUrl.toString())
          if (quoteRes.ok) {
            const quote = await quoteRes.json()
            return { symbol, quote }
          }
        } catch (err) {
          console.error(`[v0] Failed to fetch quote for ${symbol}:`, err)
        }
        return { symbol, quote: null }
      })

      const quotes = await Promise.all(quotePromises)
      const quoteMap = new Map(quotes.map((q) => [q.symbol, q.quote]))

      // Calculate floating PnL for open trades
      trades?.forEach((trade) => {
        if (trade.status === "open" && trade.entry_price) {
          const quote = quoteMap.get(trade.symbol)
          if (quote && quote.price) {
            const currentPrice = quote.price
            const entry = parseFloat(trade.entry_price)
            const sl = trade.sl ? parseFloat(trade.sl) : entry
            const riskPerUnit = Math.abs(entry - sl)
            
            if (riskPerUnit > 0) {
              const priceDiff = trade.direction === "long" 
                ? currentPrice - entry 
                : entry - currentPrice
              const floatingR = priceDiff / riskPerUnit
              trade.floating_r = floatingR
              trade.floating_pnl_percent = (priceDiff / entry) * 100
              trade.current_price = currentPrice
            }
          }
        }
      })
    }

    // Calculate stats
    const total = trades?.length ?? 0
    const wins = trades?.filter((t) => (t.result_r ?? 0) > 0).length ?? 0
    const losses = trades?.filter((t) => (t.result_r ?? 0) < 0).length ?? 0
    const open = trades?.filter((t) => t.status === "open").length ?? 0
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0"

    const stats = {
      total,
      wins,
      losses,
      open,
      winRate: parseFloat(winRate),
    }

    return NextResponse.json({ trades: trades ?? [], stats })
  } catch (error: any) {
    console.error("[v0] Unexpected error in /api/trades/list:", error)
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error.message 
    }, { status: 500 })
  }
}
