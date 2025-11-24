/**
 * Market Regime Detection
 */

import type { FactorSnapshot, MarketRegime } from './factors.ts'

export function detectRegime(f: FactorSnapshot): MarketRegime {
  const { close, ema50, ema200, adx, bbWidth, high20, low20 } = f
  const trendStrength = Math.abs(ema50 - ema200) / close
  const isTrendAligned = (close > ema50 && ema50 > ema200) || (close < ema50 && ema50 < ema200)
  const isStrongTrend = (adx || 0) > 25
  
  if (isTrendAligned && (trendStrength > 0.005 || isStrongTrend)) {
    return 'trend'
  }
  
  const isBreakingHigh = close > high20 * 0.998
  const isBreakingLow = close < low20 * 1.002
  const isVolExpanding = (bbWidth || 0) > 0.1
  
  if ((isBreakingHigh || isBreakingLow) && isVolExpanding) {
    return 'breakout'
  }
  
  return 'range'
}

