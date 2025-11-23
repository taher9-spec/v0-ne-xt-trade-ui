# Troubleshooting Guide

## OpenAI API Key Issues

### Error: "Incorrect API key provided" (401)

This error means OpenAI is rejecting your API key. Follow these steps:

#### Step 1: Verify Key Format in .env.local

Open `.env.local` and check your `OPENAI_API_KEY` line:

**❌ WRONG (with quotes):**
```env
OPENAI_API_KEY="sk-proj-7hsEBMxvMBhIIU-6TYIy8yx9WbYC5..."
```

**❌ WRONG (with spaces):**
```env
OPENAI_API_KEY = sk-proj-7hsEBMxvMBhIIU-6TYIy8yx9WbYC5...
```

**✅ CORRECT (no quotes, no spaces around =):**
```env
OPENAI_API_KEY=sk-proj-7hsEBMxvMBhIIU-6TYIy8yx9WbYC5...
```

#### Step 2: Check for Hidden Characters

1. Open `.env.local` in a text editor
2. Find the `OPENAI_API_KEY` line
3. Make sure there are:
   - No quotes (`"` or `'`) around the key
   - No spaces before or after the `=`
   - No spaces at the start or end of the key
   - No newlines in the middle of the key

#### Step 3: Verify Key is Active

1. Go to https://platform.openai.com/account/api-keys
2. Check if your key is listed and active
3. If not listed or shows as "revoked", generate a new key
4. Copy the new key and update `.env.local`

#### Step 4: Test Key Directly

Run the test script to verify the key works:

```bash
# Option 1: Set env var and run
$env:OPENAI_API_KEY="your_key_here"; node test-openai-key.js

# Option 2: The script will prompt you if key is missing
node test-openai-key.js
```

**Expected results:**
- ✅ Status 200 = Key is valid
- ❌ Status 401 = Key is invalid (generate new one)
- ❌ Status 429 = Rate limited (wait and retry)

#### Step 5: Restart Dev Server

After changing `.env.local`:
1. Stop the dev server (Ctrl+C)
2. Start it again: `npm run dev`
3. Try the AI Copilot again

#### Step 6: Check Server Console

When you send a message in AI Copilot, check the server console for:

```
[DEBUG] ========== API KEY DIAGNOSTICS ==========
[DEBUG] API key length: 164
[DEBUG] API key first 10 chars: sk-proj-7h
[DEBUG] API key last 10 chars: ...yGcA
[DEBUG] API key has whitespace: false
[DEBUG] API key has quotes: false
[DEBUG] API key has newlines: false
```

If any of these show `true`, fix the issue in `.env.local`.

### Common Issues

1. **Key has quotes**: Remove quotes from `.env.local`
2. **Key has spaces**: Remove spaces around `=` and key value
3. **Key expired/revoked**: Generate new key at platform.openai.com
4. **Wrong account**: Ensure key is from the correct OpenAI account
5. **Billing issue**: Check if OpenAI account has billing enabled
6. **Server not restarted**: Always restart after changing `.env.local`

## Telegram Authentication Issues

### Error: "Bot domain invalid"

1. Open Telegram and message [@BotFather](https://t.me/botfather)
2. Send `/setdomain`
3. Select your bot: `nexttrade_SIGNAL_bot`
4. Set domain to: `localhost:3000` (for development)
5. For production, use your actual domain

### Error: "Invalid hash" or "Auth failed"

- Check `TELEGRAM_BOT_TOKEN` in `.env.local`
- Ensure bot token matches the bot used in Login Widget
- Verify hash verification is working (check server logs)

## Rate Limiting

If you see "Rate limit exceeded":
- **Auth**: Wait 15 minutes between attempts
- **AI Copilot**: Wait 1 minute (20 requests/min limit)
- **Trades**: Wait 1 minute (10 trades/min limit)

## Database Issues

### Error: "Database connection failed"

1. Check `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`
2. Check `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
3. Verify Supabase project is active
4. Check server console for specific error messages

## General Debugging

1. **Check server console** for `[DEBUG]` and `[v0]` logs
2. **Check browser console** for client-side errors
3. **Check Network tab** in DevTools for API response status codes
4. **Verify environment variables** are loaded (check build output)

