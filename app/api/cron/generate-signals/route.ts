import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { getAllSymbols } from "@/lib/symbols"
import { fetchFmpDataForSymbol, buildSignalFromFmp } from "@/lib/signals/engine"

/**
 * Cron endpoint to generate trading signals
 * Protected by ADMIN_SECRET or SIGNAL_ENGINE_SECRET header
 * 
 * Usage:
 * - Vercel Cron: GET /api/cron/generate-signals (with secret header)
 * - Manual trigger: Same endpoint with ADMIN_SECRET header
 */
export async function GET(req: NextRequest) {
  try {
    // Security: Check for admin secret
    const adminSecret = req.headers.get("x-admin-secret") || req.headers.get("x-signal-engine-secret")
    const expectedSecret = process.env.ADMIN_SECRET || process.env.SIGNAL_ENGINE_SECRET

    if (!expectedSecret || adminSecret !== expectedSecret) {
      console.error("[cron] Unauthorized signal generation attempt")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = supabaseServer()

    // 1) Get all active symbols
    const symbols = await getAllSymbols()

    if (!symbols || symbols.length === 0) {
      console.log("[cron] No active symbols found")
      return NextResponse.json({ 
        createdSignals: [],
        message: "No active symbols found" 
      })
    }

    console.log(`[cron] Processing ${symbols.length} symbols`)

    const createdSignals: any[] = []

    // 2) Process each symbol
    for (const sym of symbols) {
      try {
        // 2a) Get data from FMP
        const marketData = await fetchFmpDataForSymbol(sym.fmp_symbol)

        if (!marketData) {
          console.log(`[cron] Skipping ${sym.fmp_symbol}: insufficient market data`)
          continue
        }

        // 2b) Apply rules → returns null if no setup
        const draft = buildSignalFromFmp(sym, marketData)

        if (!draft) {
          console.log(`[cron] Skipping ${sym.fmp_symbol}: no signal conditions met`)
          continue
        }

        // 2c) Check if there is an active signal for same symbol+timeframe+engine_version
        const { data: existing } = await supabase
          .from("signals")
          .select("id")
          .eq("symbol_id", sym.id)
          .eq("timeframe", draft.timeframe)
          .eq("status", "active")
          .eq("engine_version", "v1.0")
          .limit(1)
          .maybeSingle()

        if (existing) {
          console.log(`[cron] Skipping ${sym.fmp_symbol}: active signal already exists`)
          continue
        }

        // 2d) Insert new signal
        const { data: inserted, error: insErr } = await supabase
          .from("signals")
          .insert({
            symbol: sym.fmp_symbol, // Keep for backward compatibility
            symbol_id: sym.id,
            direction: draft.direction,
            type: draft.type,
            market: sym.asset_class,
            entry: draft.entry,
            sl: draft.sl,
            tp1: draft.tp1,
            tp2: draft.tp2,
            tp3: draft.tp3,
            confidence: draft.confidence,
            timeframe: draft.timeframe,
            status: "active",
            rr_ratio: draft.rr_ratio,
            engine_version: "v1.0",
            activated_at: new Date().toISOString(),
            reason_summary: draft.reason_summary,
          })
          .select()
          .single()

        if (insErr) {
          console.error(`[cron] Error inserting signal for ${sym.fmp_symbol}:`, insErr)
          continue
        }

        if (inserted) {
          createdSignals.push(inserted)
          console.log(`[cron] ✅ Created ${draft.direction} signal for ${sym.fmp_symbol}`)
        }
      } catch (symbolError: any) {
        console.error(`[cron] Error processing symbol ${sym.fmp_symbol}:`, symbolError)
        // Continue with next symbol
        continue
      }
    }

    console.log(`[cron] Generated ${createdSignals.length} signals`)

    return NextResponse.json({
      success: true,
      createdSignals,
      count: createdSignals.length,
      processed: symbols.length,
    })
  } catch (error: any) {
    console.error("[cron] Unexpected error in generate-signals:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
        createdSignals: [],
      },
      { status: 500 }
    )
  }
}
