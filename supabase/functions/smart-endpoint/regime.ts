/**
 * Market Regime Detection
 */

import { Indicators, OHLCV } from './indicators.ts'

export type Regime = 'uptrend' | 'downtrend' | 'range' | 'chop'

export function detectRegime(indicators: (Indicators | null)[], prices: OHLCV[]): Regime {
  // Look at the last valid indicator set
  const idx = indicators.length - 1
  const ind = indicators[idx]
  
  if (!ind) return 'chop'
  
  const price = prices[idx].close
  
  // Trend detection using EMA stack
  // Uptrend: EMA20 > EMA50 > EMA200
  const isStackedBullish = ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200
  
  // Downtrend: EMA20 < EMA50 < EMA200
  const isStackedBearish = ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200
  
  // Check slope of EMA20 (short term trend)
  const prevInd = indicators[idx - 1]
  const isEma20Rising = prevInd && ind.ema20 > prevInd.ema20
  const isEma20Falling = prevInd && ind.ema20 < prevInd.ema20
  
  if (isStackedBullish && isEma20Rising) return 'uptrend'
  if (isStackedBearish && isEma20Falling) return 'downtrend'
  
  // Range detection
  // Price stays within +/- 1.5 ATR of EMA200 for N bars
  // For simplicity in v2, if not trending, check if price is "orbiting" EMA200
  const distFromEma200 = Math.abs(price - ind.ema200)
  const atrBuffer = ind.atr14 * 1.5
  
  if (distFromEma200 < atrBuffer) return 'range'
  
  return 'chop'
}
