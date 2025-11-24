import { createSupabaseClient } from "./client"
import type { Trade } from "@/lib/types"
import { getLatestPriceForSymbols } from "@/lib/marketPrices"

/**
 * Get trades for a user with computed PnL
 * Computes pnl, pnl_percent, and result_r server-side using latest prices
 */
export async function getUserTrades(userId: string, limit: number = 50): Promise<{
  trades: Trade[]
  stats: {
    total: number
    wins: number
    losses: number
    open: number
    winRate: number
  }
}> {
  try {
    const supabase = createSupabaseClient()

    // Fetch trades for user with signal join
    // Select specific fields from trades and signals as requested
    const { data: trades, error } = await supabase
      .from("trades")
      .select(`
        id,
        symbol,
        direction,
        entry_price,
        exit_price,
        result_r,
        pnl,
        status,
        opened_at,
        closed_at,
        close_price,
        sl,
        tp1,
        tp2,
        tp3,
        symbol_id,
        signal_id,
        symbols(fmp_symbol, display_symbol, name),
        signals(
          timeframe,
          sl,
          tp1
        )
      `)
      .eq("user_id", userId)
      .order("opened_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[supabase/trades] Error fetching trades:", error)
      return { trades: [], stats: { total: 0, wins: 0, losses: 0, open: 0, winRate: 0 } }
    }

    const allTrades = (trades || []) as Trade[]

    // Get unique symbols for price fetching
    const uniqueSymbols = [
      ...new Set(
        allTrades
          .map((t) => {
            const fmpSymbol = (t as any).symbols?.fmp_symbol
            return fmpSymbol || t.symbol
          })
          .filter(Boolean)
      ),
    ]

    // Fetch latest prices for all symbols
    let priceMap: Record<string, number> = {}
    if (uniqueSymbols.length > 0) {
      try {
        priceMap = await getLatestPriceForSymbols(uniqueSymbols)
      } catch (err) {
        console.error("[supabase/trades] Error fetching prices:", err)
        // Continue without prices - will use stored values
      }
    }

    // Compute PnL for each trade
    allTrades.forEach((trade) => {
      if (!trade.entry_price) return

      const fmpSymbol = (trade as any).symbols?.fmp_symbol || trade.symbol
      const currentPrice = priceMap[fmpSymbol]

      if (!currentPrice || currentPrice <= 0) return

      const entry = typeof trade.entry_price === "number"
        ? trade.entry_price
        : parseFloat(String(trade.entry_price || "0"))

      if (entry <= 0) return

      const sl = trade.sl
        ? typeof trade.sl === "number"
          ? trade.sl
          : parseFloat(String(trade.sl))
        : entry

      const risk = Math.abs(entry - sl)
      if (risk <= 0) return

      // Direction factor: +1 for long, -1 for short
      const directionFactor = trade.direction === "long" ? 1 : -1

      // Price move from entry
      const move = (currentPrice - entry) * directionFactor

      // R-value: move / risk
      const rValue = move / risk

      // PnL%: (move / entry) * 100
      const pnlPercent = (move / entry) * 100

      // For open trades: attach as floating values
      if (trade.status === "open") {
        ;(trade as any).floating_r = rValue
        ;(trade as any).floating_pnl_percent = pnlPercent
        ;(trade as any).current_price = currentPrice
      } else {
        // For closed trades: use stored values if they exist, otherwise compute
        if (trade.result_r === null || trade.result_r === undefined) {
          ;(trade as any).result_r = rValue
        }
        if (trade.pnl_percent === null || trade.pnl_percent === undefined) {
          ;(trade as any).pnl_percent = pnlPercent
        }
      }
    })

    // Calculate stats - properly synced
    const total = allTrades.length
    const closedTrades = allTrades.filter((t) => t.status !== "open" && t.status !== "expired")
    
    // Wins: closed trades with positive result_r OR tp_hit status
    const wins = closedTrades.filter((t) => {
      if (t.status === "tp_hit") return true
      const r = t.result_r
      return r !== null && r !== undefined && r > 0
    }).length
    
    // Losses: closed trades with negative result_r OR sl_hit status
    const losses = closedTrades.filter((t) => {
      if (t.status === "sl_hit") return true
      const r = t.result_r
      return r !== null && r !== undefined && r < 0
    }).length
    
    const open = allTrades.filter((t) => t.status === "open").length
    const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0

    return {
      trades: allTrades,
      stats: {
        total,
        wins,
        losses,
        open,
        winRate: Number(winRate.toFixed(1)),
      },
    }
  } catch (error: any) {
    console.error("[supabase/trades] getUserTrades error:", error)
    return { trades: [], stats: { total: 0, wins: 0, losses: 0, open: 0, winRate: 0 } }
  }
}

