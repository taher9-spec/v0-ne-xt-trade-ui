# Security Implementation Guide

## Overview
This document outlines the security measures implemented in the NeXT TRADE Telegram mini app.

## Authentication & Authorization

### Telegram Login Widget
- **Implementation**: Official Telegram Login Widget (https://core.telegram.org/widgets/login)
- **Hash Verification**: HMAC-SHA256 using bot token
- **Auth Date Validation**: Prevents replay attacks (24-hour window)
- **Rate Limiting**: 5 auth attempts per IP per 15 minutes

### Session Management
- **Cookie Security**: 
  - `httpOnly: true` (prevents XSS)
  - `secure: true` in production (HTTPS only)
  - `sameSite: "lax"` (CSRF protection)
  - 1-year expiration with database tracking
- **Session Expiry**: Tracked in database, validated on each request
- **Logout**: Proper session cleanup via `/api/auth/logout`

## Data Collection

### User Data Collected (Telegram Mini App)
1. **telegram_id** (required) - Unique Telegram user ID
2. **username** (optional) - Telegram username
3. **full_name** (optional) - First + Last name from Telegram
4. **photo_url** (optional) - Profile photo URL from Telegram CDN
5. **phone_number** (optional) - Reserved for future use
6. **last_auth_date** - Audit trail
7. **last_login_ip** - Security audit
8. **session_expires_at** - Session management

### Security Fields
- All user inputs are sanitized and length-limited
- Photo URLs validated (must be HTTPS, preferably Telegram CDN)
- Telegram ID validated (numeric only)

## Rate Limiting

### Implemented Limits
1. **Authentication**: 5 attempts per IP per 15 minutes
2. **AI Copilot**: 20 requests per user/IP per minute
3. **Trade Actions**: 10 trades per user per minute

### Implementation
- In-memory rate limiter (simple, effective for single-server deployments)
- For production scale, consider Redis-based rate limiting
- Automatic cleanup of expired entries

## Security Headers

All authenticated responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Input Validation

### Telegram Auth Parameters
- `id`: Must be numeric (Telegram user ID)
- `first_name`, `last_name`: Trimmed, max 100 chars
- `username`: Trimmed, max 50 chars
- `photo_url`: Must start with `https://`
- `auth_date`: Validated timestamp

### API Request Validation
- All user inputs sanitized
- SQL injection prevention via Supabase parameterized queries
- XSS prevention via React's built-in escaping

## Database Security

### Row Level Security (RLS)
- Enabled on all tables
- Users can only access their own data
- Public read access for signals and plans only

### Audit Trail
- `last_auth_date`: When user last authenticated
- `last_login_ip`: IP address of last login
- `session_expires_at`: When session expires

## Error Handling

### Security-Conscious Error Messages
- Generic error messages to users
- Detailed logging server-side only
- No sensitive data in error responses
- Rate limit errors include `Retry-After` header

## Best Practices

1. **Environment Variables**: All secrets in `.env.local` (never committed)
2. **Bot Token**: Rotated periodically, stored securely
3. **HTTPS**: Required in production
4. **Session Management**: Proper expiry and cleanup
5. **Rate Limiting**: Prevents abuse and DoS
6. **Input Sanitization**: All user inputs validated
7. **Security Headers**: Applied to all responses

## API Error Handling

### OpenAI API Errors
- **401 Unauthorized**: API key is invalid or expired
  - Check `.env.local` for correct `OPENAI_API_KEY`
  - Ensure no quotes around the key value
  - Verify key is active at https://platform.openai.com/account/api-keys
  - Restart dev server after changing `.env.local`
- **429 Rate Limit**: Too many requests
  - Automatic retry-after header
  - User-friendly error messages
- **500 Server Error**: Internal server issues
  - Detailed logging server-side
  - Generic error messages to users

## Future Enhancements

1. **Email Verification**: Optional, for users who provide email
2. **2FA**: Can be added using Telegram's 2FA support
3. **Redis Rate Limiting**: For multi-server deployments
4. **Audit Logging**: Comprehensive activity logs
5. **IP Whitelisting**: For admin endpoints
6. **API Key Rotation**: Automatic key validation and rotation

## Compliance

- Follows Telegram's official authentication guidelines
- Implements security best practices for web applications
- GDPR-ready (minimal data collection, user control)

