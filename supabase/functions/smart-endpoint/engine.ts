/**
 * Engine Logic for Edge Function
 * Replicates lib/signals/engine.ts but for Deno
 */

import { Timeframe } from './config.ts'
import { FactorSnapshot, GeneratedSignalCandidate } from './factors.ts'
import { detectRegime } from './regime.ts'
import { scoreLong, scoreShort, calculateTotalScore } from './scoring.ts'
import { ema, rsi, macd, atr, sma, recentHighLow } from './indicators.ts'

const FMP_API_KEY = Deno.env.get("FMP_API_KEY")
const FMP_BASE = "https://financialmodelingprep.com/api/v3"

async function getFmpHistoricalCandles(symbol: string, timeframe: string, limit: number) {
  if (!FMP_API_KEY) return []
  try {
    const url = `${FMP_BASE}/historical-chart/${timeframe}/${encodeURIComponent(symbol)}?apikey=${FMP_API_KEY}&limit=${limit}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error("FMP Error:", e)
    return []
  }
}

export async function buildFactorSnapshot(symbol: string, timeframe: Timeframe): Promise<FactorSnapshot | null> {
  try {
    const fmpTf = timeframe === '1h' ? '1hour' : timeframe === '4h' ? '4hour' : timeframe === '1d' ? '1day' : timeframe === '15m' ? '15min' : timeframe === '5m' ? '5min' : timeframe === '1m' ? '1min' : '1hour'
    
    const candles = await getFmpHistoricalCandles(symbol, fmpTf, 250)
    if (!candles || candles.length < 200) return null
    
    const sortedCandles = [...candles].reverse()
    const closes = sortedCandles.map((c: any) => c.close)
    const highs = sortedCandles.map((c: any) => c.high)
    const lows = sortedCandles.map((c: any) => c.low)
    const volumes = sortedCandles.map((c: any) => c.volume)
    
    const ema20 = ema(closes, 20)
    const ema50 = ema(closes, 50)
    const ema200 = ema(closes, 200)
    const rsi14 = rsi(closes, 14)
    const macdData = macd(closes)
    const atr14 = atr(highs, lows, closes, 14)
    const volAvg20 = sma(volumes, 20)
    const { highs: highs20, lows: lows20 } = recentHighLow(highs, lows, 20)
    const { highs: highs50, lows: lows50 } = recentHighLow(highs, lows, 50)
    
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

export function generateSignal(f: FactorSnapshot): GeneratedSignalCandidate | null {
  const regime = detectRegime(f)
  const longScores = scoreLong(f, regime)
  const shortScores = scoreShort(f, regime)
  const longTotal = calculateTotalScore(longScores)
  const shortTotal = calculateTotalScore(shortScores)
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
  
  const atr = f.atr
  if (!atr || atr <= 0) return null

  const riskMultiple = regime === 'range' ? 1.5 : 2.0
  const rewardMultiple = regime === 'trend' ? 2.5 : 1.5
  
  let stop, target
  if (direction === 'LONG') {
    stop = f.close - (atr * riskMultiple)
    target = f.close + (atr * riskMultiple * rewardMultiple)
  } else {
    stop = f.close + (atr * riskMultiple)
    target = f.close - (atr * riskMultiple * rewardMultiple)
  }
  
  let qualityTier: 'A' | 'B' | 'C' = 'C'
  if (totalScore >= 80) qualityTier = 'A'
  else if (totalScore >= 70) qualityTier = 'B'
  
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

