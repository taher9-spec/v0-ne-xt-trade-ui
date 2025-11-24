/**
 * Get symbol logo URL from various sources
 * Supports crypto, stocks, forex, commodities, indices
 * Uses multiple fallback sources for comprehensive coverage
 */
export function getSymbolLogo(symbol: string, assetClass?: string): string {
  if (!symbol) return ''
  const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase()
  
  // Comprehensive crypto mapping
  const cryptoLogos: Record<string, string> = {
    'BTCUSD': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    'BTC': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    'ETHUSD': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    'ETH': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    'BNBUSD': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
    'BNB': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
    'XRPUSD': 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
    'XRP': 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
    'ADAUSD': 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
    'ADA': 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
    'SOLUSD': 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    'SOL': 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    'DOGEUSD': 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
    'DOGE': 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
    'DOTUSD': 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
    'DOT': 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
    'MATICUSD': 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
    'MATIC': 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
    'LTCUSD': 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
    'LTC': 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
    'AVAXUSD': 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
    'AVAX': 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
    'UNIUSD': 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png',
    'UNI': 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png',
    'LINKUSD': 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
    'LINK': 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
    'ATOMUSD': 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
    'ATOM': 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
  }

  // Comprehensive forex mapping with flag-based icons
  const forexLogos: Record<string, string> = {
    'EURUSD': 'https://flagcdn.com/w80/eu.png',
    'GBPUSD': 'https://flagcdn.com/w80/gb.png',
    'USDJPY': 'https://flagcdn.com/w80/jp.png',
    'AUDUSD': 'https://flagcdn.com/w80/au.png',
    'USDCAD': 'https://flagcdn.com/w80/ca.png',
    'NZDUSD': 'https://flagcdn.com/w80/nz.png',
    'USDCHF': 'https://flagcdn.com/w80/ch.png',
    'EURGBP': 'https://flagcdn.com/w80/eu.png',
    'EURJPY': 'https://flagcdn.com/w80/eu.png',
    'GBPJPY': 'https://flagcdn.com/w80/gb.png',
    'AUDCAD': 'https://flagcdn.com/w80/au.png',
    'AUDNZD': 'https://flagcdn.com/w80/au.png',
    'EURCHF': 'https://flagcdn.com/w80/eu.png',
    'EURAUD': 'https://flagcdn.com/w80/eu.png',
    'GBPAUD': 'https://flagcdn.com/w80/gb.png',
    'GBPCAD': 'https://flagcdn.com/w80/gb.png',
    'GBPCHF': 'https://flagcdn.com/w80/gb.png',
    'CADJPY': 'https://flagcdn.com/w80/ca.png',
    'CHFJPY': 'https://flagcdn.com/w80/ch.png',
    'NZDJPY': 'https://flagcdn.com/w80/nz.png',
  }

  // Comprehensive commodity mapping
  const commodityLogos: Record<string, string> = {
    'XAUUSD': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xau.png',
    'XAU': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xau.png',
    'GOLD': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xau.png',
    'GCUSD': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xau.png',
    'XAGUSD': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xag.png',
    'XAG': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xag.png',
    'SILVER': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xag.png',
    'SIUSD': 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xag.png',
    'CLUSD': 'https://img.icons8.com/color/96/oil-industry.png',
    'WTI': 'https://img.icons8.com/color/96/oil-industry.png',
    'CL': 'https://img.icons8.com/color/96/oil-industry.png',
    'OIL': 'https://img.icons8.com/color/96/oil-industry.png',
    'CRUDE': 'https://img.icons8.com/color/96/oil-industry.png',
    'BRENT': 'https://img.icons8.com/color/96/oil-industry.png',
    'NGUSD': 'https://img.icons8.com/color/96/gas-industry.png',
    'NATGAS': 'https://img.icons8.com/color/96/gas-industry.png',
    'XPTUSD': 'https://img.icons8.com/color/96/platinum.png',
    'PLATINUM': 'https://img.icons8.com/color/96/platinum.png',
    'XPDUSD': 'https://img.icons8.com/color/96/palladium.png',
    'PALLADIUM': 'https://img.icons8.com/color/96/palladium.png',
    'COPPER': 'https://img.icons8.com/color/96/copper.png',
    'HG': 'https://img.icons8.com/color/96/copper.png',
  }

  // Stock logos via Clearbit
  const stockLogos: Record<string, string> = {
    'AAPL': 'https://logo.clearbit.com/apple.com',
    'MSFT': 'https://logo.clearbit.com/microsoft.com',
    'GOOGL': 'https://logo.clearbit.com/google.com',
    'GOOG': 'https://logo.clearbit.com/google.com',
    'AMZN': 'https://logo.clearbit.com/amazon.com',
    'TSLA': 'https://logo.clearbit.com/tesla.com',
    'META': 'https://logo.clearbit.com/meta.com',
    'NVDA': 'https://logo.clearbit.com/nvidia.com',
    'AMD': 'https://logo.clearbit.com/amd.com',
    'NFLX': 'https://logo.clearbit.com/netflix.com',
    'DIS': 'https://logo.clearbit.com/disney.com',
    'PYPL': 'https://logo.clearbit.com/paypal.com',
    'CRM': 'https://logo.clearbit.com/salesforce.com',
    'INTC': 'https://logo.clearbit.com/intel.com',
    'CSCO': 'https://logo.clearbit.com/cisco.com',
    'ADBE': 'https://logo.clearbit.com/adobe.com',
    'ORCL': 'https://logo.clearbit.com/oracle.com',
    'IBM': 'https://logo.clearbit.com/ibm.com',
    'BA': 'https://logo.clearbit.com/boeing.com',
    'JPM': 'https://logo.clearbit.com/jpmorganchase.com',
    'V': 'https://logo.clearbit.com/visa.com',
    'MA': 'https://logo.clearbit.com/mastercard.com',
    'WMT': 'https://logo.clearbit.com/walmart.com',
    'KO': 'https://logo.clearbit.com/coca-cola.com',
    'PEP': 'https://logo.clearbit.com/pepsico.com',
    'MCD': 'https://logo.clearbit.com/mcdonalds.com',
    'NKE': 'https://logo.clearbit.com/nike.com',
    'SBUX': 'https://logo.clearbit.com/starbucks.com',
  }

  // Index logos
  const indexLogos: Record<string, string> = {
    'SPX': 'https://img.icons8.com/color/96/sp-500.png',
    'SPY': 'https://img.icons8.com/color/96/sp-500.png',
    '^GSPC': 'https://img.icons8.com/color/96/sp-500.png',
    'ES': 'https://img.icons8.com/color/96/sp-500.png',
    'DJI': 'https://img.icons8.com/color/96/dow-jones.png',
    '^DJI': 'https://img.icons8.com/color/96/dow-jones.png',
    'YM': 'https://img.icons8.com/color/96/dow-jones.png',
    'NDX': 'https://img.icons8.com/color/96/nasdaq.png',
    'QQQ': 'https://img.icons8.com/color/96/nasdaq.png',
    '^NDX': 'https://img.icons8.com/color/96/nasdaq.png',
    'NQ': 'https://img.icons8.com/color/96/nasdaq.png',
    'FTSE': 'https://img.icons8.com/color/96/ftse-100.png',
    '^FTSE': 'https://img.icons8.com/color/96/ftse-100.png',
    'DAX': 'https://img.icons8.com/color/96/dax.png',
    '^GDAXI': 'https://img.icons8.com/color/96/dax.png',
    'N225': 'https://flagcdn.com/w80/jp.png',
    '^N225': 'https://flagcdn.com/w80/jp.png',
    'VIX': 'https://img.icons8.com/color/96/stocks.png',
    '^VIX': 'https://img.icons8.com/color/96/stocks.png',
  }

  // Check crypto first (highest priority for crypto assets)
  if (assetClass === 'crypto' || cryptoLogos[cleanSymbol] || cryptoLogos[cleanSymbol.replace('USD', '')]) {
    return cryptoLogos[cleanSymbol] || cryptoLogos[cleanSymbol.replace('USD', '')] || ''
  }

  // Check commodities (metals, oil, etc.)
  if (assetClass === 'commodity' || assetClass === 'metal' || commodityLogos[cleanSymbol] || commodityLogos[cleanSymbol.replace('USD', '')]) {
    return commodityLogos[cleanSymbol] || commodityLogos[cleanSymbol.replace('USD', '')] || ''
  }

  // Check forex
  if (assetClass === 'forex' || forexLogos[cleanSymbol]) {
    return forexLogos[cleanSymbol] || ''
  }

  // Check indices
  if (assetClass === 'index' || indexLogos[cleanSymbol]) {
    return indexLogos[cleanSymbol] || ''
  }

  // Check stocks
  if (assetClass === 'stock' || stockLogos[cleanSymbol]) {
    return stockLogos[cleanSymbol] || `https://logo.clearbit.com/${cleanSymbol.toLowerCase()}.com`
  }

  // Try to guess based on symbol pattern
  // 6-character forex pairs
  if (cleanSymbol.length === 6 && /^[A-Z]{6}$/.test(cleanSymbol)) {
    const base = cleanSymbol.substring(0, 3)
    const currencyFlags: Record<string, string> = {
      'EUR': 'eu', 'GBP': 'gb', 'USD': 'us', 'JPY': 'jp', 'AUD': 'au',
      'CAD': 'ca', 'NZD': 'nz', 'CHF': 'ch', 'CNY': 'cn', 'HKD': 'hk',
      'SGD': 'sg', 'SEK': 'se', 'NOK': 'no', 'DKK': 'dk', 'ZAR': 'za',
      'MXN': 'mx', 'TRY': 'tr', 'PLN': 'pl', 'RUB': 'ru', 'INR': 'in',
    }
    if (currencyFlags[base]) {
      return `https://flagcdn.com/w80/${currencyFlags[base]}.png`
    }
  }

  // Symbols ending in USD might be crypto
  if (cleanSymbol.endsWith('USD') && cleanSymbol.length > 4) {
    const base = cleanSymbol.replace('USD', '').toLowerCase()
    return `https://assets.coingecko.com/coins/images/1/large/${base}.png`
  }

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
