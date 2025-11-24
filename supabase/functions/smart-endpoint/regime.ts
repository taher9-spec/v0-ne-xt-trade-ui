/**
 * Market Regime Detection
 */

import type { FactorSnapshot, MarketRegime } from './factors.ts'

/**
 * Determine regime based on EMAs, volatility expansion, and structure
 */
export function detectRegime(f: FactorSnapshot): MarketRegime {
  const { close, ema50, ema200, high20, low20 } = f

  const emaAligned =
    (close > ema50 && ema50 > ema200) ||
    (close < ema50 && ema50 < ema200)

  const emaSpread = Math.abs(ema50 - ema200) / close

  if (emaAligned && emaSpread > 0.003) {
    return 'trend'
  }

  const breakingHigh = close >= high20 * 0.998
  const breakingLow = close <= low20 * 1.002

  if ((breakingHigh || breakingLow) && emaSpread > 0.0015) {
    return 'breakout'
  }

  return 'range'
}
