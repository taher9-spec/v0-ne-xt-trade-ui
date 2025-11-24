/**
 * Engine Orchestration
 */

import { Timeframe, SYMBOLS, RISK_CONFIG, inferSignalType } from './config.ts'
import { OHLCV, computeIndicators } from './indicators.ts'
import { detectRegime } from './regime.ts'
import { computeAllFactors } from './factors.ts'
import { finalScore, buildReason } from './scoring.ts'

export interface SignalResult {
  symbol: string
  direction: 'long' | 'short'
  score: number
  tier: 'A' | 'B' | 'C'
  regime: string
  entry: number
  sl: number
  tp: number
  rr: number
  timeframe: Timeframe
  factors: any
  explanation: string
}

/**
 * Analyze a single symbol for a specific timeframe
 */
export function analyzeSymbol(
  symbol: string, 
  timeframe: Timeframe, 
  ohlcv: OHLCV[]
): SignalResult | null {
  if (ohlcv.length < 200) return null
  
  // 1. Compute Indicators
  const indicatorsList = computeIndicators(ohlcv)
  const lastInd = indicatorsList[indicatorsList.length - 1]
  const prevInd = indicatorsList[indicatorsList.length - 2] // needed for some logic check
  
  if (!lastInd || !prevInd) return null
  
  const lastPrice = ohlcv[ohlcv.length - 1].close
  const lastVolume = ohlcv[ohlcv.length - 1].volume
  
  // Recent High/Low (20 periods)
  let high20 = -Infinity
  let low20 = Infinity
  for (let i = ohlcv.length - 20; i < ohlcv.length; i++) {
    if (ohlcv[i].high > high20) high20 = ohlcv[i].high
    if (ohlcv[i].low < low20) low20 = ohlcv[i].low
  }
  
  // 2. Detect Regime
  const regime = detectRegime(indicatorsList, ohlcv)
  
  // Filter: Only trade Trends for v2 (as requested)
  if (regime !== 'uptrend' && regime !== 'downtrend') {
    // Skip range/chop for now
    return null
  }
  
  // 3. Compute Factors
  const { long, short } = computeAllFactors(lastInd, lastPrice, lastVolume, high20, low20)
  
  // 4. Score & Decision
  let direction: 'long' | 'short' | null = null
  let factors = null
  let score = 0
  
  if (regime === 'uptrend') {
    score = finalScore(long)
    direction = 'long'
    factors = long
  } else if (regime === 'downtrend') {
    score = finalScore(short)
    direction = 'short'
    factors = short
  }
  
  // Threshold
  if (score < 75 || !direction || !factors) return null
  
  const tier = score >= 85 ? 'A' : 'B'
  
  // 5. Entry/SL/TP
  // Lookup asset type
  const symConfig = SYMBOLS.find(s => s.symbol === symbol)
  if (!symConfig) return null
  
  const riskCfg = RISK_CONFIG[symConfig.type]
  const atr = lastInd.atr14
  
  const entry = lastPrice
  let sl, tp
  
  if (direction === 'long') {
    sl = entry - (riskCfg.atrMultipleSL * atr)
    tp = entry + riskCfg.rrTarget * (entry - sl)
  } else {
    sl = entry + (riskCfg.atrMultipleSL * atr)
    tp = entry - riskCfg.rrTarget * (sl - entry)
  }
  
  const explanation = buildReason(factors, regime, direction, timeframe)
  
  return {
    symbol,
    direction,
    score: Math.round(score),
    tier,
    regime,
    entry,
    sl,
    tp,
    rr: riskCfg.rrTarget,
    timeframe,
    factors,
    explanation
  }
}
