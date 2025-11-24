/**
 * Signal Engine v2 - Factor Types and Interfaces
 * Defines all factor snapshots, scores, and regime detection
 */

import type { Timeframe } from './config'

export type MarketRegime = 'trend' | 'range' | 'breakout'

/**
 * Complete factor snapshot for a symbol at a specific timeframe
 */
export interface FactorSnapshot {
  symbol: string
  timeframe: Timeframe
  now: Date
  close: number
  ema20: number
  ema50: number
  ema200: number
  rsi14: number
  macdHist: number
  macdHistSlope: number
  atr: number
  atrPct: number
  volume: number | null
  volumeAvg20: number | null
  volumeRatio: number | null  // volume / volumeAvg20
  high20: number
  low20: number
  high50: number
  low50: number
  // Optional extras
  adx?: number | null
  bbWidth?: number | null
}

/**
 * Individual factor scores (0-1 scale)
 */
export interface FactorScores {
  trendScore: number      // 0–1
  momentumScore: number   // 0–1
  volatilityScore: number  // 0–1
  volumeScore: number      // 0–1
  structureScore: number   // 0–1
}

/**
 * Generated signal candidate with all metadata
 */
export interface GeneratedSignalCandidate {
  direction: 'LONG' | 'SHORT'
  score: number          // 0–100
  qualityTier: 'A' | 'B' | 'C'
  entry: number
  stop: number
  target: number
  rr: number
  regime: MarketRegime
  factors: FactorSnapshot & { factorScores: FactorScores }
  explanation: string
}

