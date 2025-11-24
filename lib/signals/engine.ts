/**
 * Signal Engine Core
 * Orchestrates data fetching, factor calculation, and signal generation
 */

import { SymbolConfig, Timeframe, SYMBOLS, RISK_CONFIG } from './config'
import { FactorSnapshot, GeneratedSignalCandidate } from './factors'
import { detectRegime } from './regime'
import { scoreLong, scoreShort, calculateTotalScore } from './scoring'
import { ema, rsi, macd, atr, sma, recentHighLow } from './indicators'
import { getFmpQuote, getFmpHistoricalCandles } from '../fmp' // Existing helpers

/**
 * Build a FactorSnapshot from market data
 */
export async function buildFactorSnapshot(symbol: string, timeframe: Timeframe): Promise<FactorSnapshot | null> {
  try {
    // Map timeframe to FMP format
    const fmpTf = timeframe === '1h' ? '1hour' : timeframe === '4h' ? '4hour' : timeframe === '1d' ? '1day' : timeframe === '15m' ? '15min' : timeframe === '5m' ? '5min' : timeframe === '1m' ? '1min' : '1hour'
    
    // Fetch candles (enough for 200 EMA)
    const candles = await getFmpHistoricalCandles(symbol, fmpTf as any, 250)
    if (!candles || candles.length < 200) {
      console.warn(`[Engine] Insufficient data for ${symbol} ${timeframe}`)
      return null
    }
    
    // Parse data (FMP returns newest first, we need oldest first for calc)
    const sortedCandles = [...candles].reverse() // Now oldest -> newest
    const closes = sortedCandles.map(c => c.close)
    const highs = sortedCandles.map(c => c.high)
    const lows = sortedCandles.map(c => c.low)
    const volumes = sortedCandles.map(c => c.volume)
    
    // Calculate Indicators
    const ema20 = ema(closes, 20)
    const ema50 = ema(closes, 50)
    const ema200 = ema(closes, 200)
    const rsi14 = rsi(closes, 14)
    const macdData = macd(closes)
    const atr14 = atr(highs, lows, closes, 14)
    const volAvg20 = sma(volumes, 20)
    const { highs: highs20, lows: lows20 } = recentHighLow(highs, lows, 20)
    const { highs: highs50, lows: lows50 } = recentHighLow(highs, lows, 50)
    
    // Get current values (last index)
    const idx = closes.length - 1
    
    return {
      symbol,
      timeframe,
      now: new Date(),
      close: closes[idx],
      ema20: ema20[ema20.length - 1],
      ema50: ema50[ema50.length - 1],
      ema200: ema200[ema200.length - 1],
      rsi14: rsi14[rsi14.length - 1],
      macdHist: macdData.histogram[macdData.histogram.length - 1],
      macdHistSlope: macdData.histogram[macdData.histogram.length - 1] - macdData.histogram[macdData.histogram.length - 2],
      atr: atr14[atr14.length - 1],
      atrPct: atr14[atr14.length - 1] / closes[idx],
      volume: volumes[idx],
      volumeAvg20: volAvg20[volAvg20.length - 1],
      volumeRatio: volumes[idx] / (volAvg20[volAvg20.length - 1] || 1),
      high20: highs20[highs20.length - 1],
      low20: lows20[lows20.length - 1],
      high50: highs50[highs50.length - 1],
      low50: lows50[lows50.length - 1]
    }
  } catch (error) {
    console.error(`[Engine] Error building snapshot for ${symbol}:`, error)
    return null
  }
}

/**
 * Generate Signal Candidate
 */
export function generateSignal(f: FactorSnapshot): GeneratedSignalCandidate | null {
  const regime = detectRegime(f)
  
  // Calculate scores
  const longScores = scoreLong(f, regime)
  const shortScores = scoreShort(f, regime)
  
  const longTotal = calculateTotalScore(longScores)
  const shortTotal = calculateTotalScore(shortScores)
  
  // Filter Threshold
  const THRESHOLD = 60
  
  let direction: 'LONG' | 'SHORT'
  let scores
  let totalScore
  
  if (longTotal >= shortTotal) {
    direction = 'LONG'
    scores = longScores
    totalScore = longTotal
  } else {
    direction = 'SHORT'
    scores = shortScores
    totalScore = shortTotal
  }
  
  if (totalScore < THRESHOLD) return null
  
  // Risk Management
  const atr = f.atr
  
  // Safety check: ATR must be positive
  if (!atr || atr <= 0) {
    console.warn(`[Engine] Zero/Invalid ATR for ${f.symbol} ${f.timeframe}, skipping signal`)
    return null
  }

  // Lookup asset type risk config
  const symConfig = SYMBOLS.find(s => s.symbol === f.symbol)
  const riskCfg = symConfig ? RISK_CONFIG[symConfig.type] : { atrMultipleSL: 2.0, rrTarget: 2.0 } // Default fallback

  const riskMultiple = riskCfg.atrMultipleSL
  const rewardMultiple = riskCfg.rrTarget
  
  // Adjust for regime if needed (optional refinement)
  // e.g. tighter SL in range? For now stick to config to ensure user control.
  
  let stop, target
  if (direction === 'LONG') {
    stop = f.close - (atr * riskMultiple)
    target = f.close + (atr * riskMultiple * rewardMultiple)
  } else {
    stop = f.close + (atr * riskMultiple)
    target = f.close - (atr * riskMultiple * rewardMultiple)
  }
  
  // Quality Tier
  let qualityTier: 'A' | 'B' | 'C' = 'C'
  if (totalScore >= 80) qualityTier = 'A'
  else if (totalScore >= 70) qualityTier = 'B'
  
  // Explanation
  const explanation = `${direction} ${regime.toUpperCase()} signal (Score: ${totalScore}). Trend: ${Math.round(scores.trendScore*100)}%, Mom: ${Math.round(scores.momentumScore*100)}%, Vol: ${Math.round(scores.volumeScore*100)}%`
  
  return {
    direction,
    score: totalScore,
    qualityTier,
    entry: f.close,
    stop,
    target,
    rr: rewardMultiple,
    regime,
    factors: { ...f, factorScores: scores },
    explanation
  }
}
