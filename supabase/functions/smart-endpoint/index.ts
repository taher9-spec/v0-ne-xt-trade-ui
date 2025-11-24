// smart-endpoint/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { SYMBOLS, Timeframe, inferSignalType } from './config.ts'
import { analyzeSymbol } from './engine.ts'
import { OHLCV } from './indicators.ts'

const FMP_API_KEY = Deno.env.get("FMP_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

/**
 * Helper to fetch OHLCV from FMP
 */
async function fetchOHLCV(symbol: string, timeframe: Timeframe): Promise<OHLCV[]> {
  if (!FMP_API_KEY) return []
  
  // Map timeframe to FMP format
  // FMP uses: 1min, 5min, 15min, 30min, 1hour, 4hour
  // 1d -> daily endpoint
  let url = ''
  if (timeframe === '1d') {
    url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${FMP_API_KEY}&timeseries=250`
  } else {
    let tfStr = '1hour'
    if (timeframe === '1m') tfStr = '1min'
    if (timeframe === '5m') tfStr = '5min'
    if (timeframe === '15m') tfStr = '15min'
    if (timeframe === '4h') tfStr = '4hour'
    
    url = `https://financialmodelingprep.com/api/v3/historical-chart/${tfStr}/${symbol}?apikey=${FMP_API_KEY}`
  }
  
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`FMP error for ${symbol} ${timeframe}: ${res.status}`)
      return []
    }
    
    const json = await res.json()
    // FMP returns newest first. We need oldest first for indicator calc.
    // Also normalize fields (daily has different fields than intraday)
    const candles = Array.isArray(json.historical) ? json.historical : json // Daily has .historical
    
    if (!Array.isArray(candles)) return []
    
    return candles.map((c: any) => ({
      date: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume
    })).reverse() // Reverse to be chronological (oldest -> newest)
    
  } catch (e) {
    console.error("Fetch error:", e)
    return []
  }
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Missing env vars", { status: 500 })
  }
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })
  
  // Parse request (e.g. for specific timeframe cron)
  let targetTimeframes: Timeframe[] = ['5m', '15m', '1h', '4h', '1d']
  try {
    const body = await req.json()
    if (body.timeframes) targetTimeframes = body.timeframes
  } catch {}
  
  const results = []
  const errors = []
  
  // Iterate symbols
  for (const config of SYMBOLS) {
    // Only process timeframes enabled for this symbol AND requested
    const timeframes = config.enabledTimeframes.filter(tf => targetTimeframes.includes(tf))
    
    for (const tf of timeframes) {
      try {
        const ohlcv = await fetchOHLCV(config.symbol, tf)
        const signal = analyzeSymbol(config.symbol, tf, ohlcv)
        
        if (signal) {
          // Check dedupe: symbol_id, timeframe, direction, status=active
          // We need symbol_id first.
          const { data: symData } = await supabase
            .from('symbols')
            .select('id')
            .or(`fmp_symbol.eq.${config.symbol},display_symbol.eq.${config.symbol}`)
            .single()
            
          if (!symData) {
            errors.push(`Symbol not found in DB: ${config.symbol}`)
            continue
          }
          
          // Check existing
          const { data: existing } = await supabase
            .from('signals')
            .select('id')
            .eq('symbol_id', symData.id)
            .eq('timeframe', tf)
            .eq('direction', signal.direction)
            .eq('status', 'active')
            .maybeSingle()
            
          if (existing) {
            // Skip or update? For now skip to avoid spam
            continue
          }
          
          // Insert
          const { error: insErr } = await supabase.from('signals').insert({
            symbol: signal.symbol,
            symbol_id: symData.id,
            direction: signal.direction,
            type: inferSignalType(tf),
            market: config.type,
            entry: signal.entry,
            sl: signal.sl,
            tp1: signal.tp,
            target_price: signal.tp,
            rr: signal.rr,
            timeframe: signal.timeframe,
            status: 'active',
            score: signal.score,
            quality_tier: signal.tier,
            regime: signal.regime,
            factors: signal.factors,
            explanation: signal.explanation,
            engine_version: 'v2.0-edge'
          })
          
          if (insErr) errors.push(`Insert error ${config.symbol}: ${insErr.message}`)
          else results.push(signal)
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
