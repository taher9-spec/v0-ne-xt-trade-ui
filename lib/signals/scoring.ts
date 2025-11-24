/**
 * Signal Scoring System
 * Calculates scores for Long/Short setups based on multiple factors
 */

import type { FactorSnapshot, FactorScores, MarketRegime } from './factors'

/**
 * Calculate scores for LONG setup
 */
export function scoreLong(f: FactorSnapshot, regime: MarketRegime): FactorScores {
  let trendScore = 0
  let momentumScore = 0
  let volatilityScore = 0
  let volumeScore = 0
  let structureScore = 0
  
  // 1. Trend (30%)
  if (f.close > f.ema20 && f.ema20 > f.ema50 && f.ema50 > f.ema200) {
    trendScore = 1.0 // Perfect alignment
  } else if (f.close > f.ema50 && f.ema50 > f.ema200) {
    trendScore = 0.8 // Strong trend
  } else if (f.close > f.ema200) {
    trendScore = 0.5 // Above long-term trend
  } else {
    trendScore = 0.0 // Downtrend
  }
  
  // 2. Momentum (30%) - RSI & MACD
  if (regime === 'trend') {
    // In trend, buy dips (RSI 40-50) or momentum (RSI 50-65)
    if (f.rsi14 > 40 && f.rsi14 < 65) momentumScore += 0.6
    // Oversold in uptrend is a great entry
    if (f.rsi14 < 35 && f.close > f.ema200) momentumScore += 0.4
  } else if (regime === 'range') {
    // In range, buy oversold (RSI < 30)
    if (f.rsi14 < 30) momentumScore += 1.0
    else if (f.rsi14 < 40) momentumScore += 0.7
  } else {
    // Breakout: high momentum is good
    if (f.rsi14 > 60) momentumScore += 0.8
  }
  
  // MACD confirmation
  if (f.macdHist > 0 && f.macdHistSlope > 0) momentumScore = Math.min(1, momentumScore + 0.3)
  
  // 3. Volatility (15%) - ATR
  // Avoid extreme volatility unless breakout
  if (regime === 'breakout') {
    if (f.atrPct > 0.005) volatilityScore = 1.0 // High volatility good for breakout
  } else {
    if (f.atrPct < 0.02 && f.atrPct > 0.001) volatilityScore = 1.0 // Moderate volatility good for trend/range
    else volatilityScore = 0.5
  }
  
  // 4. Volume (15%)
  if (f.volumeRatio && f.volumeRatio > 1.5) volumeScore = 1.0 // High volume
  else if (f.volumeRatio && f.volumeRatio > 1.0) volumeScore = 0.7 // Above avg
  else volumeScore = 0.4 // Low volume
  
  // 5. Structure (10%)
  // Price near support (EMA20/50) in trend
  if (regime === 'trend') {
    const distToEma20 = Math.abs(f.close - f.ema20) / f.close
    if (distToEma20 < 0.005) structureScore = 1.0 // Pullback to EMA20
  }
  // Price breaking resistance in breakout
  if (regime === 'breakout') {
    if (f.close > f.high20) structureScore = 1.0
  }
  // Price at support in range
  if (regime === 'range') {
    if (Math.abs(f.close - f.low20) / f.close < 0.01) structureScore = 1.0
  }
  
  return { trendScore, momentumScore, volatilityScore, volumeScore, structureScore }
}

/**
 * Calculate scores for SHORT setup
 */
export function scoreShort(f: FactorSnapshot, regime: MarketRegime): FactorScores {
  let trendScore = 0
  let momentumScore = 0
  let volatilityScore = 0
  let volumeScore = 0
  let structureScore = 0
  
  // 1. Trend (30%)
  if (f.close < f.ema20 && f.ema20 < f.ema50 && f.ema50 < f.ema200) {
    trendScore = 1.0 // Perfect alignment
  } else if (f.close < f.ema50 && f.ema50 < f.ema200) {
    trendScore = 0.8 // Strong downtrend
  } else if (f.close < f.ema200) {
    trendScore = 0.5 // Below long-term trend
  } else {
    trendScore = 0.0 // Uptrend
  }
  
  // 2. Momentum (30%) - RSI & MACD
  if (regime === 'trend') {
    // In downtrend, sell rallies (RSI 50-60)
    if (f.rsi14 > 40 && f.rsi14 < 60) momentumScore += 0.6
    // Overbought in downtrend is a great entry
    if (f.rsi14 > 65 && f.close < f.ema200) momentumScore += 0.4
  } else if (regime === 'range') {
    // In range, sell overbought (RSI > 70)
    if (f.rsi14 > 70) momentumScore += 1.0
    else if (f.rsi14 > 60) momentumScore += 0.7
  } else {
    // Breakout: low RSI (strong downside momentum) is good
    if (f.rsi14 < 40) momentumScore += 0.8
  }
  
  // MACD confirmation
  if (f.macdHist < 0 && f.macdHistSlope < 0) momentumScore = Math.min(1, momentumScore + 0.3)
  
  // 3. Volatility (15%)
  if (regime === 'breakout') {
    if (f.atrPct > 0.005) volatilityScore = 1.0
  } else {
    if (f.atrPct < 0.02 && f.atrPct > 0.001) volatilityScore = 1.0
    else volatilityScore = 0.5
  }
  
  // 4. Volume (15%)
  if (f.volumeRatio && f.volumeRatio > 1.5) volumeScore = 1.0
  else if (f.volumeRatio && f.volumeRatio > 1.0) volumeScore = 0.7
  else volumeScore = 0.4
  
  // 5. Structure (10%)
  if (regime === 'trend') {
    const distToEma20 = Math.abs(f.close - f.ema20) / f.close
    if (distToEma20 < 0.005) structureScore = 1.0 // Rally to EMA20
  }
  if (regime === 'breakout') {
    if (f.close < f.low20) structureScore = 1.0
  }
  if (regime === 'range') {
    if (Math.abs(f.close - f.high20) / f.close < 0.01) structureScore = 1.0
  }
  
  return { trendScore, momentumScore, volatilityScore, volumeScore, structureScore }
}

/**
 * Combine factor scores into a final score (0-100)
 */
export function calculateTotalScore(scores: FactorScores): number {
  const weightedScore = 
    (scores.trendScore * 0.30) +
    (scores.momentumScore * 0.30) +
    (scores.volatilityScore * 0.15) +
    (scores.volumeScore * 0.15) +
    (scores.structureScore * 0.10)
    
  return Math.round(weightedScore * 100)
}

