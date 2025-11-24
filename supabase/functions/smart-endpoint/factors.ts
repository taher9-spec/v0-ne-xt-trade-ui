/**
 * Factor Scoring Model
 */

import { Indicators, OHLCV } from './indicators.ts'
import { Regime } from './regime.ts'

export interface Factors {
  trend: number      // 0-100
  momentum: number   // 0-100
  pullback: number   // 0-100
  volatility: number // 0-100
  volume: number     // 0-100
}

/**
 * Compute Trend Factor
 */
export function computeTrendFactor(ind: Indicators, direction: 'long' | 'short'): number {
  const atr = ind.atr14
  const emaDistance = Math.abs(ind.ema20 - ind.ema50) / atr // How many ATRs spread?
  
  const emaStackGood = direction === 'long'
    ? ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200
    : ind.ema20 < ind.ema50 && ind.ema50 < ind.ema200
    
  if (!emaStackGood) return 0
  
  // Cap strength at 2 ATR separation
  const raw = Math.min(emaDistance / 2, 1)
  return raw * 100
}

/**
 * Compute Momentum Factor
 */
export function computeMomentumFactor(ind: Indicators, direction: 'long' | 'short'): number {
  // RSI Logic
  // Long: 50-65 (strong) or 30-40 (reversal)
  // Short: 35-50 (strong) or 60-70 (reversal)
  const rsi = ind.rsi14
  const hist = ind.macd.hist
  
  const rsiCenter = direction === 'long' ? 55 : 45
  const rsiDist = 1 - Math.min(Math.abs(rsi - rsiCenter) / 25, 1) // 0..1
  
  // MACD Strength
  // Hyperbolic tangent to normalize histogram magnitude
  // Assuming histogram values roughly relate to price scale, might need normalization by ATR for true robustness
  // but for v2 this simple tanh is a heuristic
  const macdStrength = Math.tanh(Math.abs(hist) * 0.5) // 0..1
  
  const aligned = direction === 'long' ? hist >= 0 : hist <= 0
  
  if (!aligned) return 0
  
  return (0.6 * rsiDist + 0.4 * macdStrength) * 100
}

/**
 * Compute Pullback Factor
 */
export function computePullbackFactor(
  ind: Indicators, 
  price: number, 
  recentHigh: number, 
  recentLow: number, 
  direction: 'long' | 'short'
): number {
  const atr = ind.atr14
  
  // Pullback size
  const pullbackSize = direction === 'long'
    ? (recentHigh - price) / atr
    : (price - recentLow) / atr
    
  // Ideal pullback is 1-2 ATR
  const withinRange = Math.max(0, 1 - Math.abs(pullbackSize - 1.5) / 1.5) // 0..1
  
  // Near EMA check
  // Long: Price between EMA20 and EMA50 is "the zone"
  let nearEma = false
  if (direction === 'long') {
    nearEma = price <= ind.ema20 * 1.001 && price >= ind.ema50 * 0.999
  } else {
    nearEma = price >= ind.ema20 * 0.999 && price <= ind.ema50 * 1.001
  }
  
  if (!nearEma) return 0
  
  return withinRange * 100
}

/**
 * Compute Volatility Factor
 */
export function computeVolatilityFactor(ind: Indicators, price: number): number {
  const atrPct = (ind.atr14 / price) * 100
  
  // Sweet spot: 0.1% to 3% depending on asset
  // We want to avoid 0 (dead) and > 5 (crazy news spike)
  if (atrPct < 0.05) return 20 // Too low
  if (atrPct > 5) return 0 // Too high/risky
  
  // Normalize roughly 0.5% - 2% mapped to 100
  if (atrPct >= 0.5 && atrPct <= 2.0) return 100
  
  return 50
}

/**
 * Compute Volume Factor
 */
export function computeVolumeFactor(volume: number, volumeSMA: number): number {
  if (!volumeSMA) return 50
  const ratio = volume / volumeSMA
  
  // Cap at 2x average
  const score = Math.min(ratio, 2) / 2 // 0..1
  return score * 100
}

export function computeAllFactors(
  ind: Indicators, 
  price: number, 
  volume: number,
  recentHigh: number,
  recentLow: number
): { long: Factors, short: Factors } {
  return {
    long: {
      trend: computeTrendFactor(ind, 'long'),
      momentum: computeMomentumFactor(ind, 'long'),
      pullback: computePullbackFactor(ind, price, recentHigh, recentLow, 'long'),
      volatility: computeVolatilityFactor(ind, price),
      volume: computeVolumeFactor(volume, ind.volumeSMA20)
    },
    short: {
      trend: computeTrendFactor(ind, 'short'),
      momentum: computeMomentumFactor(ind, 'short'),
      pullback: computePullbackFactor(ind, price, recentHigh, recentLow, 'short'),
      volatility: computeVolatilityFactor(ind, price),
      volume: computeVolumeFactor(volume, ind.volumeSMA20)
    }
  }
}
