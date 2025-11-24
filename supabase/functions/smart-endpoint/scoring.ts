/**
 * Scoring & Explanation Logic
 */

import { Factors } from './factors.ts'
import { Regime } from './regime.ts'
import { Timeframe } from './config.ts'

export function finalScore(f: Factors): number {
  return (
    0.35 * f.trend +
    0.25 * f.momentum +
    0.2  * f.pullback +
    0.1  * f.volatility +
    0.1  * f.volume
  )
}

export function buildReason(f: Factors, regime: Regime, direction: 'long' | 'short', timeframe: Timeframe): string {
  const parts: string[] = []
  
  parts.push(`${direction.toUpperCase()} ${regime} setup on ${timeframe}.`)
  
  if (f.trend > 70) parts.push("Strong trend alignment.")
  if (f.pullback > 60) parts.push("Clean pullback into EMAs.")
  if (f.momentum > 60) parts.push("Momentum turning in trade direction.")
  if (f.volume > 60) parts.push("Volume above average.")
  if (f.volatility < 30) parts.push("Low volatility – slower move expected.")
  
  return parts.join(' ')
}
