# Cron Job Fix for smart-endpoint Edge Function

## Issue Summary

The cron job was experiencing 401 (Unauthorized) errors when calling the `smart-endpoint` edge function. This was caused by:

1. **Incorrect header format**: The cron job had duplicate/incorrect headers
2. **Timeout too short**: The timeout was only 1000ms (1 second), but the function takes 2-7 seconds to execute
3. **JWT verification**: The edge function has `verify_jwt: true`, requiring proper authentication

## Solution Applied

### Fixed Cron Job Configuration

The cron job has been updated with:

```sql
SELECT cron.alter_job(
  1,
  schedule := '*/5 * * * *',
  command := $$
    SELECT
      net.http_post(
        url := 'https://pmxnyekezghulybftuqh.supabase.co/functions/v1/smart-endpoint',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer YOUR_ANON_KEY'
        ),
        body := '{"source": "cron", "timeframes": ["5min", "1h"]}'::jsonb,
        timeout_milliseconds := 60000  -- 60 seconds (was 1000ms)
      ) AS request_id;
  $$
);
```

### Key Changes

1. **Removed duplicate `apikey` header** - Only `Authorization` header is needed
2. **Increased timeout to 60 seconds** - Function needs 2-7 seconds, so 60s provides buffer
3. **Proper JSON body** - Ensures timeframes are passed correctly
4. **Using `jsonb_build_object`** - More reliable than string concatenation

## Verification

Check if the cron job is working:

```sql
-- Check cron job status
SELECT 
  jobid,
  schedule,
  active,
  command
FROM cron.job
WHERE jobid = 1;

-- Check recent edge function logs
-- Go to Supabase Dashboard → Edge Functions → smart-endpoint → Logs
-- Look for 200 status codes (success) instead of 401 (unauthorized)
```

## Edge Function Authentication

The `smart-endpoint` function has `verify_jwt: true`, which means:

- ✅ **Cron jobs** must send `Authorization: Bearer <ANON_KEY>` header
- ✅ **Manual calls** can use anon key or service role key
- ❌ **Unauthenticated requests** will receive 401

If you need to disable JWT verification (not recommended for production):

```bash
supabase functions deploy smart-endpoint --no-verify-jwt
```

## Monitoring

Monitor the cron job execution:

1. **Edge Function Logs**: Supabase Dashboard → Edge Functions → smart-endpoint → Logs
2. **Postgres Logs**: Look for "cron job 1 starting" messages
3. **Check signals table**: Verify new signals are being created

## Expected Behavior

- ✅ Cron runs every 5 minutes
- ✅ Function executes successfully (200 status)
- ✅ New signals appear in `public.signals` table
- ✅ Execution time: 2-7 seconds per run

## Troubleshooting

### 401 Errors

If you still see 401 errors:

1. **Verify anon key is correct**: Check Supabase Dashboard → Settings → API
2. **Check edge function JWT setting**: Should be `verify_jwt: true`
3. **Verify cron job is active**: `SELECT * FROM cron.job WHERE jobid = 1;`
4. **Check timeout**: Should be at least 60000ms (60 seconds)

### No Signals Being Generated

If the function returns 200 but no signals appear in the database:

1. **Check edge function logs**: Supabase Dashboard → Edge Functions → smart-endpoint → Logs
   - Look for "Signal threshold not met" messages showing LONG/SHORT scores
   - Check for FMP API errors
   - Verify symbols are being processed

2. **Verify FMP API key**: Ensure `FMP_API_KEY` is set in Edge Function secrets

3. **Check signal scores**: The function logs signal scores when threshold isn't met
   - Threshold is 70 (configurable via `SIGNAL_SCORE_THRESHOLD`)
   - If scores are consistently below 70, market conditions may not meet criteria

4. **Verify symbols are active**: 
   ```sql
   SELECT id, fmp_symbol, display_symbol, is_active 
   FROM public.symbols 
   WHERE is_active = true;
   ```

5. **Test function manually**: Call the edge function directly with proper auth to see detailed logs

