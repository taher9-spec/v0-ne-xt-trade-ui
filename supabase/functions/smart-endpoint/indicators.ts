/**
 * Technical Indicators
 */

export interface OHLCV {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Indicators {
  ema20: number
  ema50: number
  ema200: number
  rsi14: number
  macd: {
    line: number
    signal: number
    hist: number
  }
  atr14: number
  volumeSMA20: number
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
function calculateEMA(series: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const emaArray = new Array(series.length).fill(null)
  
  // Simple Moving Average for the first value
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += series[i]
  }
  emaArray[period - 1] = sum / period
  
  // EMA for the rest
  for (let i = period; i < series.length; i++) {
    emaArray[i] = (series[i] - emaArray[i - 1]) * k + emaArray[i - 1]
  }
  
  return emaArray
}

/**
 * Calculate RSI
 */
function calculateRSI(series: number[], period = 14): number[] {
  const rsiArray = new Array(series.length).fill(null)
  let avgGain = 0
  let avgLoss = 0
  
  // First average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = series[i] - series[i - 1]
    if (change > 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period
  
  rsiArray[period] = 100 - (100 / (1 + avgGain / avgLoss))
  
  // Smoothed averages
  for (let i = period + 1; i < series.length; i++) {
    const change = series[i] - series[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0
    
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    
    if (avgLoss === 0) rsiArray[i] = 100
    else rsiArray[i] = 100 - (100 / (1 + avgGain / avgLoss))
  }
  
  return rsiArray
}

/**
 * Calculate MACD
 */
function calculateMACD(series: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = calculateEMA(series, fast)
  const emaSlow = calculateEMA(series, slow)
  const macdLine = new Array(series.length).fill(null)
  
  for (let i = 0; i < series.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine[i] = emaFast[i] - emaSlow[i]
    }
  }
  
  // Filter out nulls for signal calculation, but keep indices aligned? 
  // Easier to just fill nulls then map back.
  // We really only care about the valid tail.
  
  // Signal line is EMA of MACD Line
  // We need to handle the leading nulls for the signal calculation
  const firstValidIdx = macdLine.findIndex(v => v !== null)
  if (firstValidIdx === -1) return { line: [], signal: [], hist: [] }
  
  const validMacd = macdLine.slice(firstValidIdx)
  const signalLineValues = calculateEMA(validMacd, signal)
  
  // Pad signal line back to original length
  const signalLine = new Array(firstValidIdx).fill(null).concat(signalLineValues)
  
  const hist = new Array(series.length).fill(null)
  for (let i = 0; i < series.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      hist[i] = macdLine[i] - signalLine[i]
    }
  }
  
  return { line: macdLine, signal: signalLine, hist }
}

/**
 * Calculate ATR
 */
function calculateATR(high: number[], low: number[], close: number[], period = 14): number[] {
  const tr = new Array(high.length).fill(0)
  tr[0] = high[0] - low[0]
  
  for (let i = 1; i < high.length; i++) {
    const hl = high[i] - low[i]
    const hc = Math.abs(high[i] - close[i - 1])
    const lc = Math.abs(low[i] - close[i - 1])
    tr[i] = Math.max(hl, hc, lc)
  }
  
  const atr = new Array(high.length).fill(null)
  
  // First ATR is simple average
  let sum = 0
  for (let i = 0; i < period; i++) sum += tr[i]
  atr[period - 1] = sum / period
  
  // Smoothed
  for (let i = period; i < high.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
  }
  
  return atr
}

/**
 * Calculate SMA (for Volume)
 */
function calculateSMA(series: number[], period: number): number[] {
  const sma = new Array(series.length).fill(null)
  
  for (let i = period - 1; i < series.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += series[i - j]
    }
    sma[i] = sum / period
  }
  
  return sma
}

/**
 * Main computation function
 */
export function computeIndicators(ohlcv: OHLCV[]): (Indicators | null)[] {
  const closes = ohlcv.map(c => c.close)
  const highs = ohlcv.map(c => c.high)
  const lows = ohlcv.map(c => c.low)
  const volumes = ohlcv.map(c => c.volume)
  
  const ema20 = calculateEMA(closes, 20)
  const ema50 = calculateEMA(closes, 50)
  const ema200 = calculateEMA(closes, 200)
  const rsi14 = calculateRSI(closes, 14)
  const macd = calculateMACD(closes)
  const atr14 = calculateATR(highs, lows, closes, 14)
  const volumeSMA20 = calculateSMA(volumes, 20)
  
  // Combine into array of objects
  return ohlcv.map((_, i) => {
    if (
      ema20[i] === null || 
      ema50[i] === null || 
      ema200[i] === null || 
      rsi14[i] === null || 
      macd.line[i] === null || 
      atr14[i] === null ||
      volumeSMA20[i] === null
    ) {
      return null
    }
    
    return {
      ema20: ema20[i],
      ema50: ema50[i],
      ema200: ema200[i],
      rsi14: rsi14[i],
      macd: {
        line: macd.line[i],
        signal: macd.signal[i],
        hist: macd.hist[i]
      },
      atr14: atr14[i],
      volumeSMA20: volumeSMA20[i]
    }
  })
}
