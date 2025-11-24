// smart-endpoint/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { SYMBOLS, Timeframe, inferSignalType } from './config.ts'
import { buildFactorSnapshot, generateSignal } from './engine.ts'

const DEFAULT_TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1d']

function normalizeTimeframe(value: unknown): Timeframe | null {
  if (typeof value !== "string") return null
  const tf = value.toLowerCase().trim()
  switch (tf) {
    case "5m":
    case "5min":
    case "5":
      return "5m"
    case "15m":
    case "15min":
    case "15":
      return "15m"
    case "1h":
    case "60m":
    case "60min":
    case "1hour":
      return "1h"
    case "4h":
    case "240m":
    case "4hour":
      return "4h"
    case "1d":
    case "daily":
    case "1day":
      return "1d"
    default:
      return null
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Missing env vars", { status: 500 })
  }
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })
  
  // Parse request (e.g. for specific timeframe cron)
  let targetTimeframes: Timeframe[] = DEFAULT_TIMEFRAMES
  try {
    const body = await req.json()
    if (body?.timeframes) {
      const normalized = (Array.isArray(body.timeframes) ? body.timeframes : [body.timeframes])
        .map(normalizeTimeframe)
        .filter((tf): tf is Timeframe => Boolean(tf))
      if (normalized.length > 0) {
        targetTimeframes = normalized
      }
    } else if (body?.timeframe) {
      const tf = normalizeTimeframe(body.timeframe)
      if (tf) {
        targetTimeframes = [tf]
      }
    }
  } catch {}

  if (!Array.isArray(targetTimeframes) || targetTimeframes.length === 0) {
    targetTimeframes = DEFAULT_TIMEFRAMES
  }
  
  const results = []
  const errors = []
  
  // Iterate symbols
  for (const config of SYMBOLS) {
    // Only process timeframes enabled for this symbol AND requested
    const timeframes = config.enabledTimeframes.filter(tf => targetTimeframes.includes(tf))
    
    for (const tf of timeframes) {
      try {
        const snapshot = await buildFactorSnapshot(config.symbol, tf)
        if (!snapshot) continue

        const candidate = generateSignal(snapshot)
        if (!candidate) continue

        const signal = {
          ...candidate,
          symbol: config.symbol,
          timeframe: tf,
        }

        // Look up symbol row id
        const { data: symData } = await supabase
          .from('symbols')
          .select('id')
          .or(`fmp_symbol.eq.${config.symbol},display_symbol.eq.${config.symbol}`)
          .single()

        if (!symData) {
          errors.push(`Symbol not found in DB: ${config.symbol}`)
          continue
        }

        // Skip if there is already an active signal for same tf + direction
        const { data: existing } = await supabase
          .from('signals')
          .select('id')
          .eq('symbol_id', symData.id)
          .eq('timeframe', tf)
          .eq('direction', signal.direction)
          .eq('status', 'active')
          .maybeSingle()

        if (existing) {
          continue
        }

        const { error: insErr } = await supabase.from('signals').insert({
          symbol: signal.symbol,
          symbol_id: symData.id,
          direction: signal.direction,
          type: inferSignalType(tf),
          market: config.type,
          entry: signal.entry,
          sl: signal.stop,
          tp1: signal.target,
          tp2: signal.tp2,
          tp3: signal.tp3,
          target_price: signal.target,
          rr: signal.rr,
          timeframe: tf,
          status: 'active',
          score: signal.score,
          quality_tier: signal.qualityTier,
          regime: signal.regime,
          factors: signal.factors,
          explanation: signal.explanation,
          engine_version: 'v2.1-edge',
        })

        if (insErr) {
          errors.push(`Insert error ${config.symbol}: ${insErr.message}`)
        } else {
          results.push(signal)
        }
      } catch (e) {
        errors.push(`Error processing ${config.symbol} ${tf}: ${String(e)}`)
      }
    }
  }
  
  return new Response(JSON.stringify({
    processed: results.length,
    errors,
    signals: results
  }), { headers: { "Content-Type": "application/json" } })
})
