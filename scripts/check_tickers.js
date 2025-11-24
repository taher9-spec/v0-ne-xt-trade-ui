const FMP_API_KEY = process.env.FMP_API_KEY;

async function checkTicker(symbol) {
  try {
    const res = await fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP_API_KEY}`);
    const data = await res.json();
    if (data && data.length > 0) {
      console.log(`${symbol}: ${data[0].price} (${data[0].name}) - OK`);
    } else {
      console.error(`${symbol}: NO DATA`);
    }
  } catch (e) {
    console.error(`${symbol}: ERROR`, e.message);
  }
}

async function run() {
  const tickers = [
    'BTCUSD', 'ETHUSD', // Crypto
    'EURUSD', 'GBPUSD', // Forex
    'XAUUSD', 'XAGUSD', 'CLUSD', 'WTI', 'CL', // Commodities
    '^GSPC', '^DJI', 'SPX', 'DJI' // Indices
  ];
  
  for (const t of tickers) {
    await checkTicker(t);
  }
}

run();

