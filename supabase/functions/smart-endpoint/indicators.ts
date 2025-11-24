/**
 * Technical Indicators
 */

export function ema(series: number[], period: number): number[] {
  if (series.length < period) return []
  const multiplier = 2 / (period + 1)
  const result: number[] = []
  let sum = 0
  for (let i = 0; i < period; i++) sum += series[i]
  result.push(sum / period)
  for (let i = period; i < series.length; i++) {
    const emaValue = (series[i] - result[result.length - 1]) * multiplier + result[result.length - 1]
    result.push(emaValue)
  }
  return result
}

export function rsi(series: number[], period: number = 14): number[] {
  if (series.length < period + 1) return []
  const changes: number[] = []
  for (let i = 1; i < series.length; i++) changes.push(series[i] - series[i - 1])
  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }
  avgGain /= period
  avgLoss /= period
  const result: number[] = []
  if (avgLoss === 0) result.push(100)
  else {
    const rs = avgGain / avgLoss
    result.push(100 - 100 / (1 + rs))
  }
  for (let i = period; i < changes.length; i++) {
    const change = changes[i]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    if (avgLoss === 0) result.push(100)
    else {
      const rs = avgGain / avgLoss
      result.push(100 - 100 / (1 + rs))
    }
  }
  return result
}

export function macd(series: number[], fast: number = 12, slow: number = 26, signal: number = 9) {
  if (series.length < slow + signal) return { macd: [], signal: [], histogram: [] }
  const emaFast = ema(series, fast)
  const emaSlow = ema(series, slow)
  const macdLine: number[] = []
  const offset = slow - fast
  for (let i = 0; i < emaSlow.length; i++) {
    if (i + offset < emaFast.length) macdLine.push(emaFast[i + offset] - emaSlow[i])
  }
  const signalLine = ema(macdLine, signal)
  const alignedMacd = macdLine.slice(signal - 1)
  const histogram = alignedMacd.map((m, i) => m - (signalLine[i] || 0))
  return { macd: alignedMacd, signal: signalLine, histogram }
}

export function atr(high: number[], low: number[], close: number[], period: number = 14): number[] {
  if (high.length < period + 1) return []
  const tr: number[] = []
  tr.push(high[0] - low[0])
  for (let i = 1; i < high.length; i++) {
    const tr1 = high[i] - low[i]
    const tr2 = Math.abs(high[i] - close[i - 1])
    const tr3 = Math.abs(low[i] - close[i - 1])
    tr.push(Math.max(tr1, tr2, tr3))
  }
  const result: number[] = []
  let sum = 0
  for (let i = 0; i < period; i++) sum += tr[i]
  result.push(sum / period)
  for (let i = period; i < tr.length; i++) {
    const prevAtr = result[result.length - 1]
    result.push((prevAtr * (period - 1) + tr[i]) / period)
  }
  return result
}

export function sma(series: number[], period: number): number[] {
  if (series.length < period) return []
  const result: number[] = []
  let sum = 0
  for (let i = 0; i < period; i++) sum += series[i]
  result.push(sum / period)
  for (let i = period; i < series.length; i++) {
    sum = sum - series[i - period] + series[i]
    result.push(sum / period)
  }
  return result
}

export function recentHighLow(high: number[], low: number[], period: number) {
  if (high.length < period) return { highs: [], lows: [] }
  const highs: number[] = []
  const lows: number[] = []
  for (let i = period; i <= high.length; i++) {
    const sliceHigh = high.slice(i - period, i)
    const sliceLow = low.slice(i - period, i)
    highs.push(Math.max(...sliceHigh))
    lows.push(Math.min(...sliceLow))
  }
  return { highs, lows }
}

