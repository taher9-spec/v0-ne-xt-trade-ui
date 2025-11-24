# Signal Engine v2 - Multi-Timeframe Technical Analysis Engine

## Overview

The signal engine (`smart-endpoint` Edge Function) is a production-grade multi-timeframe, multi-indicator trading signal generator that uses FMP premium technical indicators combined with local calculations.

## Architecture

### Edge Function Location

- **Path**: `supabase/functions/smart-endpoint/index.ts`
- **Type**: Supabase Edge Function (Deno runtime)
- **Deployment**: Deployed to Supabase Edge Functions network

### Data Sources

- **FMP Premium API**: Technical indicators (RSI, EMA 20/50/200)
- **FMP Historical Charts**: OHLCV candle data for ATR and MACD calculations
- **Supabase Database**: Symbols table (`public.symbols`) as source of truth

## Supported Timeframes

- `1min` - 1-minute scalping
- `5min` - 5-minute scalping
- `15min` - 15-minute intraday
- `1h` - 1-hour intraday
- `4h` - 4-hour swing
- `1day` - Daily swing

## Technical Indicators

### From FMP Premium API

1. **RSI (Relative Strength Index)**

   - Period: 14
   - Endpoint: `/stable/technical-indicators/rsi`
   - Used for momentum confirmation

2. **EMA (Exponential Moving Average)**

   - Periods: 20, 50, 200
   - Endpoint: `/stable/technical-indicators/ema`
   - Used for trend bias calculation

### Calculated Locally

3. **MACD (Moving Average Convergence Divergence)**

   - Fast: 12, Slow: 26, Signal: 9
   - Calculated from close prices using EMA
   - Used for momentum and trend confirmation

4. **ATR (Average True Range)**

   - Period: 14
   - Calculated from OHLC candle data
   - Used for stop loss and target price calculation

5. **Volume Analysis**

   - 20-period average volume
   - Used for volume confirmation scoring

## Signal Scoring System

Signals are scored 0-100 based on multiple factors:

### Scoring Breakdown

- **+30 points**: Trend bias (EMA stack alignment)
- **+20 points**: RSI alignment (momentum conditions)
- **+20 points**: MACD alignment (crossover confirmation)
- **+15 points**: Volume confirmation (above average)
- **+15 points**: Higher timeframe confirmation (multi-TF alignment)

### Threshold

- **Minimum Score**: 70 (configurable via `SIGNAL_SCORE_THRESHOLD`)
- Only signals with score ≥ 70 are created/updated

### Direction Rules

**LONG Setup:**

- EMA stack: `close > EMA20 > EMA50 ≥ EMA200`
- RSI: `48 < RSI < 65` and `RSI > RSI_prev` (rising momentum)
- MACD: `MACD > Signal` and `MACD > 0` (bullish crossover)
- Volume: Above 1.1× average (preferred) or above 0.9× (partial credit)
- Higher TF: Same direction alignment (if available)

**SHORT Setup:**

- EMA stack: `close < EMA20 < EMA50 ≤ EMA200`
- RSI: `35 < RSI < 52` and `RSI < RSI_prev` (falling momentum)
- MACD: `MACD < Signal` and `MACD < 0` (bearish crossover)
- Volume: Above 1.1× average (preferred) or above 0.9× (partial credit)
- Higher TF: Same direction alignment (if available)

## Entry, Stop Loss, Target Calculation

### LONG Signals

- **Entry**: `close * 0.999` (small discount)
- **Stop Loss**: `entry - (ATR * 1.5)`
- **Target**: `entry + (ATR * 1.5 * 2.5)` = **1:2.5 Risk:Reward**

### SHORT Signals

- **Entry**: `close * 1.001` (small premium)
- **Stop Loss**: `entry + (ATR * 1.5)`
- **Target**: `entry - (ATR * 1.5 * 2.5)` = **1:2.5 Risk:Reward**

## Duplicate Prevention

### Timeframe-Aware Freshness Windows

- **1min, 5min**: 2 hours
- **15min**: 8 hours
- **1h**: 24 hours
- **4h**: 72 hours (3 days)
- **1day**: 168 hours (7 days)

### Update Logic

- If an active signal exists within the freshness window:
  - **Update** if new score > existing score
  - **Skip** if new score ≤ existing score

### Database Constraints

- Unique index: `(symbol_id, timeframe, direction) WHERE status = 'active'`
- Prevents duplicate active signals per symbol/timeframe/direction

## API Contract

### Request Body (JSON)

```json
{
  "source": "cron|manual|debug",
  "timeframes": ["1min", "5min", "15min", "1h", "4h", "1day"]
}
```

**Default**: If body is empty or missing, defaults to `["5min", "1h"]`

### Response

```json
{
  "source": "cron",
  "timeframes": ["5min", "1h"],
  "evaluated": 40,
  "inserted": 8,
  "updated": 2,
  "skipped": 28,
  "errors": []
}
```

## Cron Job Setup

### Supabase Cron Configuration

Create multiple cron jobs in Supabase Dashboard → Database → Cron Jobs, each calling the same Edge Function with different timeframes:

#### 1. Fast Scalps (1min, 5min)

```sql
SELECT cron.schedule(
  'signal-engine-fast-scalps',
  '*/3 * * * *', -- Every 3 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/smart-endpoint',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body := '{"source": "cron", "timeframes": ["1min", "5min"]}'::jsonb
    ) AS request_id;
  $$
);
```

#### 2. Intraday (15min, 1h)

```sql
SELECT cron.schedule(
  'signal-engine-intraday',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/smart-endpoint',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body := '{"source": "cron", "timeframes": ["15min", "1h"]}'::jsonb
    ) AS request_id;
  $$
);
```

#### 3. Swing (4h, 1day)

```sql
SELECT cron.schedule(
  'signal-engine-swing',
  '0 */4 * * *', -- Every 4 hours
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/smart-endpoint',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body := '{"source": "cron", "timeframes": ["4h", "1day"]}'::jsonb
    ) AS request_id;
  $$
);
```

### Alternative: Using Supabase Cron UI

1. Go to **Supabase Dashboard** → **Database** → **Cron Jobs**
2. Click **"New Cron Job"**
3. Configure:
   - **Name**: `signal-engine-fast-scalps`
   - **Schedule**: `*/3 * * * *` (every 3 minutes)
   - **Type**: **Edge Function**
   - **Function**: `smart-endpoint`
   - **HTTP Method**: `POST`
   - **Body**:
     ```json
     {
       "source": "cron",
       "timeframes": ["1min", "5min"]
     }
     ```
4. Repeat for other timeframes with appropriate schedules

### Recommended Schedules

| Timeframe | Cron Schedule | Description |
|-----------|--------------|-------------|
| 1min, 5min | `*/3 * * * *` | Every 3 minutes |
| 15min | `*/15 * * * *` | Every 15 minutes |
| 1h | `0 * * * *` | Every hour (at :00) |
| 4h | `0 */4 * * *` | Every 4 hours |
| 1day | `0 0 * * *` | Daily at midnight UTC |

## Environment Variables

Required in Supabase Edge Function secrets:

- `FMP_API_KEY` - Financial Modeling Prep API key (premium)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (bypasses RLS)

## Error Handling

- Per-symbol error handling (one failure doesn't stop the batch)
- Detailed error logging to Supabase Edge Logs
- Graceful handling of missing indicator data
- Duplicate key violations are caught and logged (not errors)

## Performance

- **Parallel API calls**: All indicators fetched in parallel per symbol
- **Batch processing**: Processes all symbols in sequence (safe for rate limits)
- **Efficient queries**: Uses indexed columns (`symbol_id`, `timeframe`, `status`)
- **Rate limit friendly**: ~750 calls/min FMP quota supports 20+ symbols

## Monitoring

### Edge Function Logs
View logs in **Supabase Dashboard** → **Edge Functions** → **smart-endpoint** → **Logs**

### Key Metrics to Monitor
- `evaluated`: Total symbol×timeframe combinations processed
- `inserted`: New signals created
- `updated`: Existing signals updated (higher score)
- `skipped`: Signals below threshold or duplicate
- `errors`: Array of error messages (should be empty in production)

## Tuning Parameters

### Adjustable Constants (in `index.ts`)

```typescript
const SIGNAL_SCORE_THRESHOLD = 70  // Minimum score to create signal
const FRESHNESS_WINDOWS = {        // Hours before allowing new signal
  "1min": 2,
  "5min": 2,
  "15min": 8,
  "1h": 24,
  "4h": 72,
  "1day": 168,
}
```

### Scoring Weights (in `calculateSignalScore`)

- Trend bias: 30 points
- RSI alignment: 20 points
- MACD alignment: 20 points
- Volume confirmation: 15 points
- Higher TF confirmation: 15 points

Adjust these weights based on backtesting results.

## Future Enhancements

- [ ] Multi-timeframe confluence scoring
- [ ] Volume profile analysis
- [ ] Support/resistance level detection
- [ ] News sentiment integration
- [ ] Machine learning model integration
- [ ] Auto-closing signals when TP/SL hit

## Troubleshooting

### No signals generated

1. Check FMP API key is valid and has premium access
2. Verify symbols in `public.symbols` have `is_active = true`
3. Check Edge Function logs for API errors
4. Ensure sufficient historical data exists for indicators

### Duplicate signals

- Check unique index exists: `signals_unique_active_per_pair_tf_dir`
- Verify freshness window logic is working
- Check for timezone issues in `created_at` comparisons

### Low signal count

- Lower `SIGNAL_SCORE_THRESHOLD` (e.g., 60) for more signals
- Adjust scoring weights to be less strict
- Check if market conditions are unfavorable (low volatility, choppy markets)

