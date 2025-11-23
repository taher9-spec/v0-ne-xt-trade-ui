import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { cookies } from "next/headers"
import { getLatestPriceForSymbols } from "@/lib/marketPrices"

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
      .select("*, symbol_id, symbols(fmp_symbol, display_symbol, name)")
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

    // Fetch live prices for open trades and calculate floating PnL
    const openTrades = trades?.filter((t) => t.status === "open") || []
    
    if (openTrades.length > 0) {
      // Get unique symbols from open trades (use fmp_symbol if available via join, otherwise symbol)
      const uniqueSymbols = [
        ...new Set(
          openTrades
            .map((t) => {
              // Prefer fmp_symbol from joined symbols table, fallback to symbol
              const fmpSymbol = (t as any).symbols?.fmp_symbol
              return fmpSymbol || t.symbol
            })
            .filter(Boolean)
        ),
      ]

      if (uniqueSymbols.length > 0) {
        try {
          const priceMap = await getLatestPriceForSymbols(uniqueSymbols)

          // Calculate floating PnL for each open trade
          trades?.forEach((trade) => {
            if (trade.status === "open" && trade.entry_price) {
              const fmpSymbol = (trade as any).symbols?.fmp_symbol || trade.symbol
              const currentPrice = priceMap[fmpSymbol]

              if (currentPrice && currentPrice > 0) {
                const entry = typeof trade.entry_price === "number" 
                  ? trade.entry_price 
                  : parseFloat(String(trade.entry_price || "0"))
                const sl = trade.sl 
                  ? (typeof trade.sl === "number" ? trade.sl : parseFloat(String(trade.sl)))
                  : entry
                const riskPerUnit = Math.abs(entry - sl)

                if (riskPerUnit > 0) {
                  // Calculate R-multiple (floating)
                  let openR = 0
                  if (trade.direction === "long") {
                    openR = (currentPrice - entry) / riskPerUnit
                  } else {
                    openR = (entry - currentPrice) / riskPerUnit
                  }

                  // Calculate PnL%
                  const pnlPercent = trade.direction === "long"
                    ? ((currentPrice - entry) / entry) * 100
                    : ((entry - currentPrice) / entry) * 100

                  // Attach to trade object
                  ;(trade as any).floating_r = openR
                  ;(trade as any).floating_pnl_percent = pnlPercent
                  ;(trade as any).current_price = currentPrice
                }
              }
            }
          })
        } catch (err) {
          console.error("[v0] Error fetching live prices for open trades:", err)
          // Continue without live prices - trades will show without floating PnL
        }
      }
    }

    // Calculate stats - null-safe
    const total = trades?.length ?? 0
    const closedTrades = trades?.filter((t) => t.status !== "open") ?? []
    const wins = closedTrades.filter((t) => {
      const r = t.result_r
      return r !== null && r !== undefined && r > 0
    }).length
    const losses = closedTrades.filter((t) => {
      const r = t.result_r
      return r !== null && r !== undefined && r < 0
    }).length
    const open = trades?.filter((t) => t.status === "open").length ?? 0
    const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0
    
    // Calculate average R for closed trades
    const closedWithR = closedTrades
      .map((t) => t.result_r)
      .filter((r): r is number => r !== null && r !== undefined && !isNaN(Number(r)))
    const avgR = closedWithR.length > 0 
      ? closedWithR.reduce((sum, r) => sum + Number(r), 0) / closedWithR.length 
      : null

    const stats = {
      total,
      wins,
      losses,
      open,
      winRate: Number(winRate.toFixed(1)),
      avgR: avgR !== null ? Number(avgR.toFixed(2)) : undefined,
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
