-- Seed sample signals for testing
insert into public.signals (symbol, direction, type, market, entry, sl, tp1, tp2, confidence, reason_summary)
values
  ('XAUUSD', 'long', 'swing', 'gold', 2645.50, 2630.00, 2665.00, 2680.00, 4, 'Strong support at 2630, bullish momentum confirmed'),
  ('BTCUSD', 'long', 'intraday', 'crypto', 95500.00, 94000.00, 97500.00, 99000.00, 5, 'Breaking major resistance, high volume accumulation'),
  ('EURUSD', 'short', 'scalp', 'forex', 1.0850, 1.0870, 1.0820, 1.0800, 3, 'Rejection at key resistance, bearish divergence'),
  ('AAPL', 'long', 'swing', 'indices', 245.50, 240.00, 255.00, 265.00, 4, 'Earnings beat expected, institutional buying'),
  ('ETHUSD', 'long', 'intraday', 'crypto', 3450.00, 3350.00, 3600.00, 3750.00, 4, 'Network upgrades priced in, accumulation zone')
on conflict do nothing;
