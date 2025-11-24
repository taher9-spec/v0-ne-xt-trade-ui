/**
 * Plan-based symbol access control
 * Determines which symbols are unlocked for each subscription plan
 */

// Free plan: Only BTC, ETH, and Silver
// Include variations to handle different symbol formats
const FREE_SYMBOLS = [
  'BTCUSD', 'BTC', 'BTC/USD', 'BITCOIN',
  'ETHUSD', 'ETH', 'ETH/USD', 'ETHEREUM',
  'XAGUSD', 'XAG', 'XAG/USD', 'SILVER'
]

// Starter plan: Adds major forex pairs and more commodities
const STARTER_ADDITIONS = [
  'XAUUSD', 'WTI', 'CL', // Gold, Oil
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD', // Major forex
]

// Pro plan: Adds indices and more symbols
const PRO_ADDITIONS = [
  'SPX', 'DJI', 'IXIC', 'VIX', // Indices
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', // Major stocks
  'US30', 'NAS100', 'SPX500', // CFD indices
]

/**
 * Get list of unlocked symbols for a plan
 */
export function getUnlockedSymbols(planCode: string | null | undefined): string[] {
  const plan = planCode?.toLowerCase() || 'free'
  
  if (plan === 'elite') {
    // Elite gets everything - return empty array means all symbols
    return []
  }
  
  if (plan === 'pro') {
    return [...FREE_SYMBOLS, ...STARTER_ADDITIONS, ...PRO_ADDITIONS]
  }
  
  if (plan === 'starter') {
    return [...FREE_SYMBOLS, ...STARTER_ADDITIONS]
  }
  
  // Free plan
  return FREE_SYMBOLS
}

/**
 * Check if a symbol is unlocked for the user's plan
 */
export function isSymbolUnlocked(symbol: string, planCode: string | null | undefined): boolean {
  const plan = planCode?.toLowerCase() || 'free'
  
  // Elite gets everything
  if (plan === 'elite') {
    return true
  }
  
  const unlockedSymbols = getUnlockedSymbols(plan)
  const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  
  // Check if symbol matches any unlocked symbol (handles variations like BTCUSD vs BTC)
  return unlockedSymbols.some(unlocked => {
    const cleanUnlocked = unlocked.toUpperCase().replace(/[^A-Z0-9]/g, '')
    // Exact match
    if (cleanSymbol === cleanUnlocked) return true
    // Symbol contains unlocked (e.g., BTCUSD contains BTC)
    if (cleanSymbol.includes(cleanUnlocked)) return true
    // Unlocked contains symbol (e.g., BTC contains BTCUSD - less likely but handle it)
    if (cleanUnlocked.includes(cleanSymbol) && cleanUnlocked.length > cleanSymbol.length) return true
    return false
  })
}

/**
 * Get the minimum plan required to unlock a symbol
 */
export function getRequiredPlanForSymbol(symbol: string): string {
  const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  
  // Check if it's in free tier
  if (FREE_SYMBOLS.some(s => {
    const clean = s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return cleanSymbol === clean || cleanSymbol.includes(clean) || clean.includes(cleanSymbol)
  })) {
    return 'free'
  }
  
  // Check if it's in starter tier
  if (STARTER_ADDITIONS.some(s => {
    const clean = s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return cleanSymbol === clean || cleanSymbol.includes(clean) || clean.includes(cleanSymbol)
  })) {
    return 'starter'
  }
  
  // Check if it's in pro tier
  if (PRO_ADDITIONS.some(s => {
    const clean = s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return cleanSymbol === clean || cleanSymbol.includes(clean) || clean.includes(cleanSymbol)
  })) {
    return 'pro'
  }
  
  // Default to elite for unknown symbols
  return 'elite'
}

