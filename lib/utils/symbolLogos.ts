/**
 * Get symbol logo URL from various sources
 * Supports crypto, stocks, forex, commodities
 */
export function getSymbolLogo(symbol: string, assetClass?: string): string {
  const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase()
  
  // For crypto symbols
  if (assetClass === 'crypto' || symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('USD') && symbol.length > 6) {
    // Use CryptoCompare API for crypto logos
    const cryptoMap: Record<string, string> = {
      'BTCUSD': 'BTC',
      'ETHUSD': 'ETH',
      'BNBUSD': 'BNB',
      'XRPUSD': 'XRP',
      'ADAUSD': 'ADA',
      'SOLUSD': 'SOL',
      'DOGEUSD': 'DOGE',
      'DOTUSD': 'DOT',
      'MATICUSD': 'MATIC',
      'LTCUSD': 'LTC',
    }
    const cryptoCode = cryptoMap[cleanSymbol] || cleanSymbol.replace('USD', '')
    return `https://assets.cryptocompare.com/icons/${cryptoCode.toLowerCase()}/color_icon.png`
  }
  
  // For forex pairs
  if (assetClass === 'forex' || symbol.length === 6 && symbol.includes('USD')) {
    // Use a forex logo service or placeholder
    return `https://www.tradingview.com/x/${cleanSymbol.substring(0, 3).toLowerCase()}.png`
  }
  
  // For stocks (use TradingView or similar)
  if (assetClass === 'stock') {
    return `https://logo.clearbit.com/${cleanSymbol.toLowerCase()}.com`
  }
  
  // For commodities
  if (assetClass === 'commodity') {
    // Gold, Silver, Oil logos
    const commodityMap: Record<string, string> = {
      'XAUUSD': 'https://assets.cryptocompare.com/icons/XAU/color_icon.png',
      'XAGUSD': 'https://assets.cryptocompare.com/icons/XAG/color_icon.png',
      'WTI': 'https://www.tradingview.com/x/oil.png',
      'CL': 'https://www.tradingview.com/x/oil.png',
    }
    return commodityMap[cleanSymbol] || `https://www.tradingview.com/x/${cleanSymbol.toLowerCase()}.png`
  }
  
  // Default fallback - use initial letters
  return ''
}

/**
 * Check if logo URL is valid (will be used with onError handler)
 */
export async function validateLogoUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' })
    return true
  } catch {
    return false
  }
}

