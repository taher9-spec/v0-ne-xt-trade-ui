import { NextRequest, NextResponse } from "next/server"
import { createSupabaseClient } from "@/lib/supabase/client"
import { getAllSymbols } from "@/lib/supabase/symbols"
import { buildFactorSnapshot, generateSignal } from "@/lib/signals/engine"
import { Timeframe, inferSignalType } from "@/lib/signals/config"

/**
 * Cron endpoint to generate trading signals (Engine v2)
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

    const supabase = createSupabaseClient()

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

    // Define timeframes to check - prioritize based on asset class
    const timeframesToCheck: Timeframe[] = []
    
    // 2) Process each symbol
    for (const sym of symbols) {
      try {
        // Reset timeframes for each symbol
        const symbolTimeframes: Timeframe[] = []
        if (sym.asset_class === "crypto" || sym.asset_class === "forex") {
          // Crypto and Forex: check multiple timeframes
          symbolTimeframes.push("5m", "15m", "1h", "4h")
        } else {
          // Stocks, indices, commodities: focus on higher timeframes
          symbolTimeframes.push("1h", "4h", "1d")
        }

        // Try each timeframe
        for (const tf of symbolTimeframes) {
          try {
            // 2a) Build Factor Snapshot
            const snapshot = await buildFactorSnapshot(sym.fmp_symbol, tf)

            if (!snapshot) {
              continue // Try next timeframe
            }

            // 2b) Generate Signal Candidate
            const candidate = generateSignal(snapshot)

            if (!candidate) {
              continue // No signal found
            }

            // 2c) Check if there is an active signal for same symbol+timeframe+direction
            const { data: existing } = await supabase
              .from("signals")
              .select("id")
              .eq("symbol_id", sym.id)
              .eq("timeframe", tf)
              .eq("status", "active")
              .eq("direction", candidate.direction)
              .limit(1)
              .maybeSingle()

            if (existing) {
              // TODO: Update existing signal score if better?
              continue // Signal already exists for this timeframe/direction
            }

            // 2d) Insert new signal
            const { data: inserted, error: insErr } = await supabase
              .from("signals")
              .insert({
                symbol: sym.fmp_symbol, // Keep for backward compatibility
                symbol_id: sym.id,
                direction: candidate.direction,
                type: inferSignalType(tf),
                market: sym.asset_class,
                entry: candidate.entry,
                sl: candidate.stop,
                tp1: candidate.target,
                // tp2, tp3 could be calculated from RR if needed, for now just TP1
                score: candidate.score,
                quality_tier: candidate.qualityTier,
                regime: candidate.regime,
                factors: candidate.factors,
                explanation: candidate.explanation,
                target_price: candidate.target,
                rr: candidate.rr,
                confidence: candidate.qualityTier === 'A' ? 5 : candidate.qualityTier === 'B' ? 4 : 3,
                timeframe: tf,
                status: "active",
                engine_version: "v2.0",
                activated_at: new Date().toISOString(),
                reason_summary: candidate.explanation,
              })
              .select()
              .single()

            if (insErr) {
              console.error(`[cron] Error inserting signal for ${sym.fmp_symbol} ${tf}:`, insErr)
              continue
            }

            if (inserted) {
              createdSignals.push(inserted)
              console.log(`[cron] ✅ Created ${candidate.direction} ${tf} signal for ${sym.fmp_symbol} (Score: ${candidate.score})`)
              // break // Don't break, allow multiple signals per symbol on different timeframes? 
              // Maybe break to avoid spamming the feed with same symbol? 
              // Let's allow multiple timeframes for now as they are distinct setups.
            }
          } catch (tfError: any) {
            console.error(`[cron] Error processing ${sym.fmp_symbol} ${tf}:`, tfError)
            continue // Try next timeframe
          }
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
