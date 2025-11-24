/**
 * Factor Types
 */

import type { Timeframe } from './config.ts'

export type MarketRegime = 'trend' | 'range' | 'breakout'

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
  volumeRatio: number | null
  high20: number
  low20: number
  high50: number
  low50: number
  adx?: number | null
  bbWidth?: number | null
}

export interface FactorScores {
  trendScore: number
  momentumScore: number
  volatilityScore: number
  volumeScore: number
  structureScore: number
}

export interface GeneratedSignalCandidate {
  direction: 'LONG' | 'SHORT'
  score: number
  qualityTier: 'A' | 'B' | 'C'
  entry: number
  stop: number
  target: number
  rr: number
  regime: MarketRegime
  factors: FactorSnapshot & { factorScores: FactorScores }
  explanation: string
}

