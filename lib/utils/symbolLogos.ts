/**
 * Get symbol logo URL from various sources
 * Supports crypto, stocks, forex, commodities
 * Uses multiple fallback sources for better coverage
 */
export function getSymbolLogo(symbol: string, assetClass?: string): string {
  const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase()
  
  // For crypto symbols - use CoinGecko API (more reliable)
  if (assetClass === 'crypto' || cleanSymbol.includes('BTC') || cleanSymbol.includes('ETH') || (cleanSymbol.includes('USD') && cleanSymbol.length > 6)) {
    const cryptoMap: Record<string, string> = {
      'BTCUSD': 'bitcoin',
      'BTC': 'bitcoin',
      'ETHUSD': 'ethereum',
      'ETH': 'ethereum',
      'BNBUSD': 'binancecoin',
      'BNB': 'binancecoin',
      'XRPUSD': 'ripple',
      'XRP': 'ripple',
      'ADAUSD': 'cardano',
      'ADA': 'cardano',
      'SOLUSD': 'solana',
      'SOL': 'solana',
      'DOGEUSD': 'dogecoin',
      'DOGE': 'dogecoin',
      'DOTUSD': 'polkadot',
      'DOT': 'polkadot',
      'MATICUSD': 'matic-network',
      'MATIC': 'matic-network',
      'LTCUSD': 'litecoin',
      'LTC': 'litecoin',
      'AVAXUSD': 'avalanche-2',
      'AVAX': 'avalanche-2',
      'UNIUSD': 'uniswap',
      'UNI': 'uniswap',
    }
    const cryptoId = cryptoMap[cleanSymbol] || cryptoMap[cleanSymbol.replace('USD', '')]
    if (cryptoId) {
      return `https://assets.coingecko.com/coins/images/${getCoinGeckoImageId(cryptoId)}/large/${cryptoId}.png`
    }
    // Fallback to CryptoCompare
    const cryptoCode = cleanSymbol.replace('USD', '').toLowerCase()
    return `https://assets.cryptocompare.com/icons/${cryptoCode}/color_icon.png`
  }
  
  // For forex pairs - use flag-based approach
  if (assetClass === 'forex' || (symbol.length === 6 && /^[A-Z]{6}$/.test(cleanSymbol))) {
    const base = cleanSymbol.substring(0, 3)
    const quote = cleanSymbol.substring(3, 6)
    
    // Use country flag emoji or TradingView forex icons
    const forexMap: Record<string, string> = {
      'EURUSD': 'https://www.tradingview.com/x/EURUSD.png',
      'GBPUSD': 'https://www.tradingview.com/x/GBPUSD.png',
      'USDJPY': 'https://www.tradingview.com/x/USDJPY.png',
      'AUDUSD': 'https://www.tradingview.com/x/AUDUSD.png',
      'USDCAD': 'https://www.tradingview.com/x/USDCAD.png',
      'NZDUSD': 'https://www.tradingview.com/x/NZDUSD.png',
      'EURGBP': 'https://www.tradingview.com/x/EURGBP.png',
      'EURJPY': 'https://www.tradingview.com/x/EURJPY.png',
    }
    
    if (forexMap[cleanSymbol]) {
      return forexMap[cleanSymbol]
    }
    
    // Fallback: Use currency code icons
    return `https://static.tradingview.com/symbols/${base.toLowerCase()}-${quote.toLowerCase()}.svg`
  }
  
  // For stocks - use multiple sources
  if (assetClass === 'stock') {
    // Try Clearbit first
    const stockMap: Record<string, string> = {
      'AAPL': 'https://logo.clearbit.com/apple.com',
      'MSFT': 'https://logo.clearbit.com/microsoft.com',
      'GOOGL': 'https://logo.clearbit.com/google.com',
      'AMZN': 'https://logo.clearbit.com/amazon.com',
      'TSLA': 'https://logo.clearbit.com/tesla.com',
      'META': 'https://logo.clearbit.com/meta.com',
      'NVDA': 'https://logo.clearbit.com/nvidia.com',
    }
    if (stockMap[cleanSymbol]) {
      return stockMap[cleanSymbol]
    }
    return `https://logo.clearbit.com/${cleanSymbol.toLowerCase()}.com`
  }
  
  // For commodities - use specific icons
  if (assetClass === 'commodity') {
    const commodityMap: Record<string, string> = {
      'XAUUSD': 'https://assets.cryptocompare.com/icons/XAU/color_icon.png',
      'XAU': 'https://assets.cryptocompare.com/icons/XAU/color_icon.png',
      'GOLD': 'https://assets.cryptocompare.com/icons/XAU/color_icon.png',
      'XAGUSD': 'https://assets.cryptocompare.com/icons/XAG/color_icon.png',
      'XAG': 'https://assets.cryptocompare.com/icons/XAG/color_icon.png',
      'SILVER': 'https://assets.cryptocompare.com/icons/XAG/color_icon.png',
      'WTI': 'https://www.tradingview.com/x/oil.png',
      'CL': 'https://www.tradingview.com/x/oil.png',
      'OIL': 'https://www.tradingview.com/x/oil.png',
      'CRUDE': 'https://www.tradingview.com/x/oil.png',
    }
    return commodityMap[cleanSymbol] || commodityMap[cleanSymbol.replace('USD', '')] || ''
  }
  
  // Default fallback
  return ''
}

/**
 * Get CoinGecko image ID for major cryptocurrencies
 */
function getCoinGeckoImageId(coinId: string): string {
  const imageIds: Record<string, string> = {
    'bitcoin': '1',
    'ethereum': '279',
    'binancecoin': '825',
    'ripple': '52',
    'cardano': '975',
    'solana': '4128',
    'dogecoin': '5',
    'polkadot': '12171',
    'matic-network': '4713',
    'litecoin': '2',
    'avalanche-2': '12559',
    'uniswap': '12504',
  }
  return imageIds[coinId] || '1'
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

