/**
 * Market Regime Detection
 * Classifies market state into Trend, Range, or Breakout
 */

import type { FactorSnapshot, MarketRegime } from './factors'

/**
 * Detect market regime based on technical factors
 */
export function detectRegime(f: FactorSnapshot): MarketRegime {
  const { close, ema50, ema200, adx, bbWidth, high20, low20 } = f
  
  // 1. Trend Detection
  // Strong trend if price is far from EMAs and EMAs are aligned
  const trendStrength = Math.abs(ema50 - ema200) / close
  const isTrendAligned = (close > ema50 && ema50 > ema200) || (close < ema50 && ema50 < ema200)
  
  // ADX > 25 indicates strong trend (if available)
  const isStrongTrend = (adx || 0) > 25
  
  if (isTrendAligned && (trendStrength > 0.005 || isStrongTrend)) {
    return 'trend'
  }
  
  // 2. Breakout Detection
  // Price breaking 20-period high/low with expanded volatility
  const isBreakingHigh = close > high20 * 0.998 // Near or above high
  const isBreakingLow = close < low20 * 1.002 // Near or below low
  const isVolExpanding = (bbWidth || 0) > 0.1 // Bollinger bands expanding (if available)
  
  if ((isBreakingHigh || isBreakingLow) && isVolExpanding) {
    return 'breakout'
  }
  
  // 3. Default to Range
  // EMAs are flat or crossed, price oscillating
  return 'range'
}

