import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { cookies } from "next/headers"

type Body = {
  tradeId: string
  closePrice: number
}

/**
 * POST /api/trades/close
 * Marks a trade as closed and calculates final PnL and R-multiple
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await req.json()) as Body

    if (!body.tradeId || !body.closePrice) {
      return NextResponse.json({ error: "Missing tradeId or closePrice" }, { status: 400 })
    }

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection failed" }, { status: 500 })
    }

    // Fetch the trade
    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .select("*")
      .eq("id", body.tradeId)
      .eq("user_id", userId)
      .single()

    if (tradeError || !trade) {
      console.error("[v0] Trade not found:", tradeError)
      return NextResponse.json({ error: "Trade not found" }, { status: 404 })
    }

    if (trade.status !== "open") {
      return NextResponse.json({ error: "Trade is already closed" }, { status: 400 })
    }

    // Calculate final PnL and R-multiple
    const entry = typeof trade.entry_price === "number" 
      ? trade.entry_price 
      : parseFloat(String(trade.entry_price || "0"))
    const closePrice = typeof body.closePrice === "number" 
      ? body.closePrice 
      : parseFloat(String(body.closePrice))
    const sl = trade.sl 
      ? (typeof trade.sl === "number" ? trade.sl : parseFloat(String(trade.sl)))
      : entry

    const riskPerUnit = Math.abs(entry - sl)
    let resultR = 0
    let pnlPercent = 0
    let pnl = 0
    const parseTarget = (value: any) => {
      if (value === null || value === undefined) return null
      const parsed = typeof value === "number" ? value : parseFloat(String(value))
      return isNaN(parsed) ? null : parsed
    }
    const tpTargets = [
      { level: "tp3", value: parseTarget(trade.tp3) },
      { level: "tp2", value: parseTarget(trade.tp2) },
      { level: "tp1", value: parseTarget(trade.tp1) },
    ]
    let tpHitLevel: string | null = null
    let statusUpdate: "open" | "closed" | "tp_hit" | "sl_hit" | "closed_manual" = "closed"

    if (riskPerUnit > 0) {
      // Calculate R-multiple
      if (trade.direction === "long") {
        resultR = (closePrice - entry) / riskPerUnit
      } else {
        resultR = (entry - closePrice) / riskPerUnit
      }

      // Calculate PnL%
      pnlPercent = trade.direction === "long"
        ? ((closePrice - entry) / entry) * 100
        : ((entry - closePrice) / entry) * 100

      // Calculate PnL in currency (if size is available)
      if (trade.size) {
        const size = typeof trade.size === "number" ? trade.size : parseFloat(String(trade.size))
        const priceDiff = trade.direction === "long" 
          ? closePrice - entry 
          : entry - closePrice
        pnl = priceDiff * size
      }
    }

    const tolerance = Math.max(riskPerUnit * 0.05, Math.abs(entry) * 0.0002)
    for (const target of tpTargets) {
      if (!target.value) continue
      const hit =
        trade.direction === "long"
          ? closePrice >= target.value - tolerance
          : closePrice <= target.value + tolerance
      if (hit) {
        tpHitLevel = target.level
        statusUpdate = "tp_hit"
        break
      }
    }
    if (!tpHitLevel) {
      const slHit =
        trade.direction === "long"
          ? closePrice <= sl + tolerance
          : closePrice >= sl - tolerance
      if (slHit) {
        statusUpdate = "sl_hit"
      }
    }

    // Update trade
    const { data: updatedTrade, error: updateError } = await supabase
      .from("trades")
      .update({
        status: statusUpdate,
        closed_at: new Date().toISOString(),
        exit_price: closePrice,
        close_price: closePrice,
        result_r: resultR,
        rr: resultR,
        pnl_percent: pnlPercent,
        pnl: pnl,
        tp_hit_level: tpHitLevel,
      })
      .eq("id", body.tradeId)
      .select()
      .single()

    if (updateError) {
      console.error("[v0] Error closing trade:", updateError)
      return NextResponse.json({ error: "Failed to close trade" }, { status: 500 })
    }

    return NextResponse.json({ trade: updatedTrade })
  } catch (error: any) {
    console.error("[v0] Unexpected error in /api/trades/close:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

