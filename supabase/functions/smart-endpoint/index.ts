// smart-endpoint/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { SYMBOLS, inferSignalType, Timeframe } from './config.ts'
import { buildFactorSnapshot, generateSignal } from './engine.ts'

const FMP_API_KEY = Deno.env.get("FMP_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FMP_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing configuration" }), { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })

  // Parse request for specific timeframes if needed
  let requestedTimeframes: Timeframe[] = []
  try {
    if (req.method === 'POST') {
      const body = await req.json()
      if (body.timeframes) requestedTimeframes = body.timeframes
    }
  } catch (e) {
    console.error("Error parsing body", e)
  }

  const stats = { processed: 0, signals: 0, errors: 0 }
  const createdSignals = []

  try {
    // Get symbols from DB to ensure they are active
    const { data: dbSymbols, error: symError } = await supabase.from("symbols").select("*").eq("is_active", true)
    
    if (symError) throw symError
    
    // Use config symbols but cross-check with DB status
    const activeSymbols = SYMBOLS.filter(s => dbSymbols.some((ds: any) => (ds.fmp_symbol === s.symbol || ds.display_symbol === s.symbol)))
    
    console.log(`Processing ${activeSymbols.length} symbols`)

    for (const sym of activeSymbols) {
      // Determine timeframes to check
      let timeframes = requestedTimeframes.length > 0 ? requestedTimeframes : sym.enabledTimeframes
      
      // DB symbol ID
      const dbSymbol = dbSymbols.find((ds: any) => ds.fmp_symbol === sym.symbol || ds.display_symbol === sym.symbol)
      if (!dbSymbol) continue

      for (const tf of timeframes) {
        try {
          stats.processed++
          
          // Build snapshot
          const snapshot = await buildFactorSnapshot(sym.symbol, tf)
          if (!snapshot) continue

          // Generate signal
          const candidate = generateSignal(snapshot)
          if (!candidate) continue

          // Check for existing active signal
          const { data: existing } = await supabase
            .from("signals")
            .select("id")
            .eq("symbol_id", dbSymbol.id)
            .eq("timeframe", tf)
            .eq("status", "active")
            .eq("direction", candidate.direction)
            .maybeSingle()

          if (existing) continue

          // Insert signal
          const { data: inserted, error: insErr } = await supabase
            .from("signals")
            .insert({
              symbol: sym.symbol,
              symbol_id: dbSymbol.id,
              direction: candidate.direction,
              type: inferSignalType(tf),
              market: dbSymbol.asset_class,
              entry: candidate.entry,
              sl: candidate.stop,
              tp1: candidate.target,
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
              engine_version: "v2.0-edge",
              activated_at: new Date().toISOString(),
              reason_summary: candidate.explanation,
            })
            .select()
            .single()

          if (insErr) {
            console.error(`Error inserting signal for ${sym.symbol}:`, insErr)
            stats.errors++
          } else if (inserted) {
            createdSignals.push(inserted)
            stats.signals++
            console.log(`✅ Created ${candidate.direction} ${tf} signal for ${sym.symbol}`)
          }
        } catch (err) {
          console.error(`Error processing ${sym.symbol} ${tf}:`, err)
          stats.errors++
        }
      }
    }

    return new Response(JSON.stringify({ success: true, stats, createdSignals }), {
      headers: { "Content-Type": "application/json" }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
