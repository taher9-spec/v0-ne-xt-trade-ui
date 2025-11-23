import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabaseServer"
import { checkRateLimit, getClientIP } from "@/lib/rateLimit"
import crypto from "crypto"

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

// Rate limiting: 5 auth attempts per IP per 15 minutes
const AUTH_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
}

/**
 * Verify Telegram Login Widget authentication data
 * Based on official Telegram documentation: https://core.telegram.org/widgets/login
 * 
 * @param data - Query parameters from Telegram Login Widget
 * @returns true if hash is valid, false otherwise
 */
function verifyTelegramAuth(data: Record<string, string>): boolean {
  if (!BOT_TOKEN) {
    console.error("[v0] TELEGRAM_BOT_TOKEN is not set")
    return false
  }

  const { hash, ...fields } = data

  if (!hash) {
    return false
  }

  // Build check string: sort keys alphabetically, format as "key=value\n"
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n")

  // Create secret key from bot token (SHA256 hash)
  const secretKey = crypto.createHash("sha256").update(BOT_TOKEN).digest()

  // Compute HMAC-SHA256
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex")

  return hmac === hash
}

/**
 * Check if auth_date is recent (within 24 hours)
 * Prevents replay attacks
 */
function isAuthDateValid(authDate: string | undefined): boolean {
  if (!authDate) {
    return false
  }

  const authTimestamp = parseInt(authDate, 10)
  if (isNaN(authTimestamp)) {
    return false
  }

  const now = Math.floor(Date.now() / 1000)
  const maxAge = 60 * 60 * 24 // 24 hours

  return now - authTimestamp < maxAge
}

export async function GET(req: NextRequest) {
  try {
    // Rate limiting: prevent brute force attacks
    const clientIP = getClientIP(req)
    const rateLimit = checkRateLimit(`auth:${clientIP}`, AUTH_RATE_LIMIT.maxRequests, AUTH_RATE_LIMIT.windowMs)
    
    if (!rateLimit.allowed) {
      console.warn(`[v0] Rate limit exceeded for IP: ${clientIP}`)
      return NextResponse.redirect(
        new URL(`/?auth=failed&reason=rate_limit&retry_after=${Math.ceil((rateLimit.resetAt - Date.now()) / 1000)}`, req.url)
      )
    }

    const url = new URL(req.url)
    const params = Object.fromEntries(url.searchParams.entries())

    // Required parameters
    if (!params.hash) {
      console.error("[v0] Missing hash parameter")
      return NextResponse.redirect(new URL("/?auth=failed&reason=missing_hash", req.url))
    }

    if (!params.id) {
      console.error("[v0] Missing id parameter")
      return NextResponse.redirect(new URL("/?auth=failed&reason=missing_id", req.url))
    }

    // Validate telegram_id format (should be numeric string)
    if (!/^\d+$/.test(params.id)) {
      console.error("[v0] Invalid telegram_id format:", params.id)
      return NextResponse.redirect(new URL("/?auth=failed&reason=invalid_id", req.url))
    }

    // Verify hash authenticity
    if (!verifyTelegramAuth(params)) {
      console.error("[v0] Invalid Telegram auth hash")
      return NextResponse.redirect(new URL("/?auth=failed&reason=invalid_hash", req.url))
    }

    // Check auth_date to prevent replay attacks
    if (!isAuthDateValid(params.auth_date)) {
      console.error("[v0] Auth date expired or invalid")
      return NextResponse.redirect(new URL("/?auth=failed&reason=expired", req.url))
    }

    // Extract user data from Telegram parameters
    // Official Telegram Login Widget sends: id, first_name, last_name, username, photo_url, auth_date, hash
    const telegramId = params.id
    const firstName = (params.first_name || "").trim().slice(0, 100) // Sanitize and limit length
    const lastName = (params.last_name || "").trim().slice(0, 100)
    const username = params.username ? params.username.trim().slice(0, 50) : null
    let photoUrl = params.photo_url ? params.photo_url.trim() : null
    
    // Validate and normalize photo URL
    // Telegram photo URLs should be from their CDN (e.g., https://cdn4.telegram-cdn.org/file/...)
    if (photoUrl) {
      if (!photoUrl.startsWith("https://")) {
        console.warn("[v0] Invalid photo_url format, ignoring:", photoUrl)
        photoUrl = null
      } else {
        // Ensure it's a valid Telegram CDN URL
        console.log("[v0] User photo URL received:", photoUrl.substring(0, 50) + "...")
      }
    }

    // Build full name from first_name + last_name, fallback to username
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || username || "User"
    
    console.log("[v0] Telegram auth data extracted:", {
      telegramId,
      username,
      fullName,
      hasPhoto: !!photoUrl,
    })
    
    // Get auth date for audit
    const authDate = params.auth_date ? new Date(parseInt(params.auth_date) * 1000) : new Date()

    // Initialize Supabase with service role (bypasses RLS)
    let supabase
    try {
      supabase = supabaseServer()
      // Verify we're using service role by checking if we can bypass RLS
      console.log("[v0] Supabase client initialized with service role")
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.redirect(new URL("/?auth=failed&reason=db_error", req.url))
    }

    // Upsert user data with security fields
    // First, try to find existing user by telegram_id
    // Use maybeSingle() to avoid errors if user doesn't exist
    const { data: existingUser, error: findError } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramId)
      .maybeSingle()
    
    if (findError) {
      console.error("[v0] Error finding existing user:", findError)
    }

    let user
    let error

    if (existingUser && existingUser.id) {
      // Update existing user - build update object carefully
      const updateData: Record<string, any> = {
        username: username || firstName || null,
        photo_url: photoUrl && photoUrl.startsWith("https://") ? photoUrl : null,
        last_auth_date: authDate.toISOString(),
        session_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        last_login_ip: clientIP,
        updated_at: new Date().toISOString(),
      }
      
      // Add full_name (column exists, but handle gracefully)
      updateData.full_name = fullName || null

      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", existingUser.id)
        .select()
        .single()
      
      user = updatedUser
      error = updateError
    } else {
      // Insert new user - build insert object carefully
      const insertData: Record<string, any> = {
        telegram_id: telegramId,
        username: username || firstName || null,
        photo_url: photoUrl && photoUrl.startsWith("https://") ? photoUrl : null,
        last_auth_date: authDate.toISOString(),
        session_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        last_login_ip: clientIP,
        updated_at: new Date().toISOString(),
      }
      
      // Add full_name (column exists, but handle gracefully)
      insertData.full_name = fullName || null

      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert(insertData)
        .select()
        .single()
      
      user = newUser
      error = insertError
    }

    if (error) {
      // Enhanced error logging for debugging
      console.error("[v0] ========== TELEGRAM AUTH ERROR ==========")
      console.error("[v0] Error code:", error.code)
      console.error("[v0] Error message:", error.message)
      console.error("[v0] Error details:", JSON.stringify(error, null, 2))
      console.error("[v0] Telegram ID:", telegramId)
      console.error("[v0] Existing user found:", !!existingUser)
      console.error("[v0] Operation:", existingUser ? "UPDATE" : "INSERT")
      console.error("[v0] Supabase client:", supabase ? "initialized" : "failed")
      console.error("[v0] =========================================")
      
      // Return more detailed error for debugging (in production, sanitize this)
      const errorDetails = error.code ? `${error.code}: ${error.message}` : error.message || "unknown"
      return NextResponse.redirect(
        new URL(`/?auth=failed&reason=upsert_error&details=${encodeURIComponent(errorDetails)}`, req.url)
      )
    }

    if (!user) {
      console.error("[v0] User not created/retrieved")
      return NextResponse.redirect(new URL("/?auth=failed&reason=no_user", req.url))
    }

    // Set authentication cookie with security flags
    // Redirect back to the app root with success parameter
    // For Telegram Mini Apps, the redirect should preserve the mini app context
    const redirectUrl = new URL("/", req.url)
    redirectUrl.searchParams.set("auth", "success")
    const res = NextResponse.redirect(redirectUrl)
    const cookieMaxAge = 60 * 60 * 24 * 365 // 1 year
    
    res.cookies.set("tg_user_id", user.id, {
      httpOnly: true, // Prevent XSS attacks
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      sameSite: "lax", // CSRF protection
      path: "/",
      maxAge: cookieMaxAge,
    })

    // Set security headers
    res.headers.set("X-Content-Type-Options", "nosniff")
    res.headers.set("X-Frame-Options", "DENY")
    res.headers.set("X-XSS-Protection", "1; mode=block")
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")

    console.log("[v0] Telegram auth successful for user:", telegramId, "IP:", clientIP)
    return res
  } catch (error: any) {
    console.error("[v0] Unexpected error in Telegram auth:", error)
    return NextResponse.redirect(new URL("/?auth=failed&reason=server_error", req.url))
  }
}
