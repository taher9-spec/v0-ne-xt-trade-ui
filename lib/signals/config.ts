/**
 * Signal Engine v2 Configuration
 * Single source of truth for symbol universe and strategy config
 */

export type InstrumentType = 'crypto' | 'forex' | 'index' | 'stock' | 'commodity' | 'metal'

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

export type SignalStyle = 'scalp' | 'intraday' | 'swing'

export interface SymbolConfig {
  symbol: string            // FMP Ticker
  type: InstrumentType
  enabledTimeframes: Timeframe[]
}

export interface RiskConfig {
  atrMultipleSL: number
  rrTarget: number
}

export const RISK_CONFIG: Record<InstrumentType, RiskConfig> = {
  forex:     { atrMultipleSL: 1.5, rrTarget: 2.0 },
  index:     { atrMultipleSL: 1.5, rrTarget: 1.8 },
  stock:     { atrMultipleSL: 2.0, rrTarget: 2.5 },
  crypto:    { atrMultipleSL: 2.5, rrTarget: 3.0 },
  commodity: { atrMultipleSL: 2.0, rrTarget: 2.5 },
  metal:     { atrMultipleSL: 1.5, rrTarget: 2.0 },
}

/**
 * Core symbol universe - ~20 symbols with their enabled timeframes
 */
export const SYMBOLS: SymbolConfig[] = [
  // Crypto
  { symbol: 'BTCUSD', type: 'crypto', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  { symbol: 'ETHUSD', type: 'crypto', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  
  // Forex - Major pairs
  { symbol: 'EURUSD', type: 'forex', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  { symbol: 'GBPUSD', type: 'forex', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  { symbol: 'USDJPY', type: 'forex', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  { symbol: 'USDCHF', type: 'forex', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  { symbol: 'AUDUSD', type: 'forex', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  { symbol: 'NZDUSD', type: 'forex', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  { symbol: 'USDCAD', type: 'forex', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  
  // Commodities
  { symbol: 'XAUUSD', type: 'metal', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  { symbol: 'XAGUSD', type: 'metal', enabledTimeframes: ['5m', '15m', '1h', '4h'] },
  { symbol: 'CLUSD', type: 'commodity', enabledTimeframes: ['15m', '1h', '4h', '1d'] },
  
  // Stocks
  { symbol: 'NVDA', type: 'stock', enabledTimeframes: ['15m', '1h', '4h', '1d'] },
  { symbol: 'AAPL', type: 'stock', enabledTimeframes: ['15m', '1h', '4h', '1d'] },
  { symbol: 'MSFT', type: 'stock', enabledTimeframes: ['15m', '1h', '4h', '1d'] },
  { symbol: 'GOOGL', type: 'stock', enabledTimeframes: ['15m', '1h', '4h', '1d'] },
  { symbol: 'TSLA', type: 'stock', enabledTimeframes: ['15m', '1h', '4h', '1d'] },
  
  // Indices
  { symbol: '^GSPC', type: 'index', enabledTimeframes: ['1h', '4h', '1d'] },
  { symbol: '^DJI', type: 'index', enabledTimeframes: ['1h', '4h', '1d'] },
  { symbol: '^IXIC', type: 'index', enabledTimeframes: ['1h', '4h', '1d'] },
]

/**
 * Infer signal type from timeframe
 */
export function inferSignalType(tf: Timeframe): 'scalp' | 'intraday' | 'swing' {
  if (tf === '1m' || tf === '5m') return 'scalp'
  if (tf === '15m' || tf === '1h') return 'intraday'
  return 'swing'
}

/**
 * Get all unique symbols from config
 */
export function getAllSymbolsFromConfig(): string[] {
  return [...new Set(SYMBOLS.map(s => s.symbol))]
}

/**
 * Get enabled timeframes for a symbol
 */
export function getTimeframesForSymbol(symbol: string): Timeframe[] {
  const config = SYMBOLS.find(s => s.symbol === symbol)
  return config?.enabledTimeframes || []
}
