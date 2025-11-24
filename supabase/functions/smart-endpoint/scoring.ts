/**
 * Scoring System
 */

import type { FactorSnapshot, FactorScores, MarketRegime } from './factors.ts'

export function scoreLong(f: FactorSnapshot, regime: MarketRegime): FactorScores {
  let trendScore = 0
  let momentumScore = 0
  let volatilityScore = 0
  let volumeScore = 0
  let structureScore = 0
  
  // Trend
  if (f.close > f.ema20 && f.ema20 > f.ema50 && f.ema50 > f.ema200) trendScore = 1.0
  else if (f.close > f.ema50 && f.ema50 > f.ema200) trendScore = 0.8
  else if (f.close > f.ema200) trendScore = 0.5
  else trendScore = 0.0
  
  // Momentum
  if (regime === 'trend') {
    if (f.rsi14 > 40 && f.rsi14 < 65) momentumScore += 0.6
    if (f.rsi14 < 35 && f.close > f.ema200) momentumScore += 0.4
  } else if (regime === 'range') {
    if (f.rsi14 < 30) momentumScore += 1.0
    else if (f.rsi14 < 40) momentumScore += 0.7
  } else {
    if (f.rsi14 > 60) momentumScore += 0.8
  }
  if (f.macdHist > 0 && f.macdHistSlope > 0) momentumScore = Math.min(1, momentumScore + 0.3)
  
  // Volatility
  if (regime === 'breakout') {
    if (f.atrPct > 0.005) volatilityScore = 1.0
  } else {
    if (f.atrPct < 0.02 && f.atrPct > 0.001) volatilityScore = 1.0
    else volatilityScore = 0.5
  }
  
  // Volume
  if (f.volumeRatio && f.volumeRatio > 1.5) volumeScore = 1.0
  else if (f.volumeRatio && f.volumeRatio > 1.0) volumeScore = 0.7
  else volumeScore = 0.4
  
  // Structure
  if (regime === 'trend') {
    const distToEma20 = Math.abs(f.close - f.ema20) / f.close
    if (distToEma20 < 0.005) structureScore = 1.0
  }
  if (regime === 'breakout') {
    if (f.close > f.high20) structureScore = 1.0
  }
  if (regime === 'range') {
    if (Math.abs(f.close - f.low20) / f.close < 0.01) structureScore = 1.0
  }
  
  return { trendScore, momentumScore, volatilityScore, volumeScore, structureScore }
}

export function scoreShort(f: FactorSnapshot, regime: MarketRegime): FactorScores {
  let trendScore = 0
  let momentumScore = 0
  let volatilityScore = 0
  let volumeScore = 0
  let structureScore = 0
  
  // Trend
  if (f.close < f.ema20 && f.ema20 < f.ema50 && f.ema50 < f.ema200) trendScore = 1.0
  else if (f.close < f.ema50 && f.ema50 < f.ema200) trendScore = 0.8
  else if (f.close < f.ema200) trendScore = 0.5
  else trendScore = 0.0
  
  // Momentum
  if (regime === 'trend') {
    if (f.rsi14 > 40 && f.rsi14 < 60) momentumScore += 0.6
    if (f.rsi14 > 65 && f.close < f.ema200) momentumScore += 0.4
  } else if (regime === 'range') {
    if (f.rsi14 > 70) momentumScore += 1.0
    else if (f.rsi14 > 60) momentumScore += 0.7
  } else {
    if (f.rsi14 < 40) momentumScore += 0.8
  }
  if (f.macdHist < 0 && f.macdHistSlope < 0) momentumScore = Math.min(1, momentumScore + 0.3)
  
  // Volatility
  if (regime === 'breakout') {
    if (f.atrPct > 0.005) volatilityScore = 1.0
  } else {
    if (f.atrPct < 0.02 && f.atrPct > 0.001) volatilityScore = 1.0
    else volatilityScore = 0.5
  }
  
  // Volume
  if (f.volumeRatio && f.volumeRatio > 1.5) volumeScore = 1.0
  else if (f.volumeRatio && f.volumeRatio > 1.0) volumeScore = 0.7
  else volumeScore = 0.4
  
  // Structure
  if (regime === 'trend') {
    const distToEma20 = Math.abs(f.close - f.ema20) / f.close
    if (distToEma20 < 0.005) structureScore = 1.0
  }
  if (regime === 'breakout') {
    if (f.close < f.low20) structureScore = 1.0
  }
  if (regime === 'range') {
    if (Math.abs(f.close - f.high20) / f.close < 0.01) structureScore = 1.0
  }
  
  return { trendScore, momentumScore, volatilityScore, volumeScore, structureScore }
}

export function calculateTotalScore(scores: FactorScores): number {
  const weightedScore = 
    (scores.trendScore * 0.30) +
    (scores.momentumScore * 0.30) +
    (scores.volatilityScore * 0.15) +
    (scores.volumeScore * 0.15) +
    (scores.structureScore * 0.10)
  return Math.round(weightedScore * 100)
}

