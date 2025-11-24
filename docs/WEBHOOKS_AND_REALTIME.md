# Webhooks & Realtime Implementation

## Overview

This document describes the webhook infrastructure and Realtime subscriptions implemented for NeXT TRADE.

## Webhook Infrastructure

### Database Tables

1. **`webhook_subscribers`**: Stores webhook endpoints and configuration
   - `id`: UUID primary key
   - `name`: Human-readable name for the webhook
   - `url`: HTTP endpoint URL to call
   - `event_type`: One of `signal_insert`, `signal_update`, `trade_insert`, `trade_update`
   - `is_active`: Boolean flag to enable/disable
   - `secret_token`: Optional secret for webhook authentication
   - `created_at`, `updated_at`: Timestamps

2. **`webhook_log`**: Stores webhook events for processing
   - `id`: UUID primary key
   - `event_type`: Type of event
   - `payload`: JSONB payload with event data
   - `subscriber_url`: URL that will receive this webhook
   - `status`: `pending`, `processed`, or `failed`
   - `attempts`: Number of retry attempts
   - `error_message`: Error details if failed
   - `created_at`, `processed_at`: Timestamps

### Database Triggers

1. **`signals_webhook_trigger`**: Fires on INSERT/UPDATE to `signals` table
   - On INSERT with `status='active'`: Creates `signal_insert` event
   - On UPDATE: Creates `signal_update` event with old/new status

2. **`trades_webhook_trigger`**: Fires on INSERT/UPDATE to `trades` table
   - On INSERT: Creates `trade_insert` event
   - On UPDATE (status or exit_price changes): Creates `trade_update` event

### Edge Function: `process-webhooks`

The `process-webhooks` Edge Function processes pending webhook logs and calls subscriber URLs.

**How it works:**
1. Fetches pending webhook logs from `webhook_log` table
2. Finds active subscribers for each event type
3. Calls each subscriber's URL with POST request containing:
   - `event_type`: Type of event
   - `payload`: Event data (signal/trade details)
   - `timestamp`: When the event occurred
4. Updates webhook log status (`processed` or `failed`)

**To use:**
- Call via HTTP: `POST https://<project-ref>.supabase.co/functions/v1/process-webhooks`
- Or set up a cron job to call it periodically (e.g., every minute)

**Example webhook payload:**
```json
{
  "event_type": "signal_insert",
  "payload": {
    "id": "uuid",
    "symbol": "EURUSD",
    "direction": "long",
    "timeframe": "5min",
    "entry": 1.0850,
    "sl": 1.0820,
    "tp1": 1.0920,
    "signal_score": 75,
    "confidence": 2,
    "created_at": "2024-01-15T10:30:00Z"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Setting Up Webhooks

1. **Add a webhook subscriber:**
```sql
INSERT INTO public.webhook_subscribers (name, url, event_type, is_active, secret_token)
VALUES (
  'Telegram Notifications',
  'https://your-telegram-bot-webhook.com/signals',
  'signal_insert',
  true,
  'your-secret-token-here'
);
```

2. **Set up cron job to process webhooks:**
   - In Supabase Dashboard → Database → Cron Jobs
   - Create a new cron job:
     - Schedule: `* * * * *` (every minute)
     - SQL: `SELECT net.http_post(url := 'https://<project-ref>.supabase.co/functions/v1/process-webhooks', headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb);`

## Realtime Subscriptions

### Signals Realtime

The home page automatically subscribes to Realtime changes on the `signals` table:

- **Event**: `postgres_changes`
- **Table**: `signals`
- **Filter**: `status=eq.active`
- **Actions**: INSERT, UPDATE

When a new active signal is inserted or an existing signal is updated, the UI automatically refreshes the signals list without manual refresh.

### Trades Realtime

The journal page subscribes to Realtime changes on the `trades` table for the current user:

- **Event**: `postgres_changes`
- **Table**: `trades`
- **Filter**: `user_id=eq.<current-user-id>`
- **Actions**: INSERT, UPDATE

When a trade is created or updated for the logged-in user, the journal automatically updates without refresh.

### Implementation Details

Realtime subscriptions are set up in `app/page.tsx`:

1. **Signals subscription** (in `useEffect` for home tab):
   - Subscribes to all active signals
   - Refreshes signals list when changes occur

2. **Trades subscription** (in `useEffect` for journal tab):
   - Only subscribes when user is logged in
   - Filters by user ID to only receive relevant updates
   - Refreshes trades list and stats when changes occur

## Symbols Page

A new `/symbols` page displays all active trading symbols with:

- **Search functionality**: Filter by symbol name, FMP symbol, or display name
- **Asset class filters**: Filter by forex, crypto, stock, index, or commodity
- **Beautiful cards**: Each symbol shows:
  - Display symbol
  - Full name (if available)
  - Asset class badge with icon
  - FMP symbol reference

Access the symbols page via:
- Link in the home page header ("Symbols" badge)
- Direct URL: `/symbols`

## Security Fixes

### Function Search Path

Fixed security warnings for functions with mutable search_path:
- `calc_r_multiple`: Now has `SET search_path = ''`
- `update_symbols_updated_at`: Now has `SET search_path = ''`

### RLS Policies

Consolidated duplicate permissive RLS policies on `trades` table:
- Removed overly permissive `trades_insert_all` and `trades_select_all` policies
- Kept more restrictive policies that check user ownership

## Symbol Names

Updated all symbol names to match FMP format:
- Forex pairs: "Currency1 / Currency2" format
- Stocks: Company names
- Indices: Full index names
- Commodities: Full commodity names

All symbols now have proper `name` values in the database.

