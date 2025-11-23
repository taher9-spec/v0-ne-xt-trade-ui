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
 * Verify Telegram WebApp initData signature
 * Based on: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyInitData(initData: string): boolean {
  if (!BOT_TOKEN) {
    console.error("[v0] TELEGRAM_BOT_TOKEN is not set")
    return false
  }

  const params = new URLSearchParams(initData)
  const hash = params.get("hash")

  if (!hash) {
    return false
  }

  // Remove hash from params for verification
  params.delete("hash")

  // Build data-check-string: sort all key=value pairs alphabetically, join with \n
  const dataCheckString = Array.from(params.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n")

  // Create secret key from bot token (SHA256 hash)
  const secretKey = crypto.createHash("sha256").update(BOT_TOKEN).digest()

  // Compute HMAC-SHA256
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex")

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

export async function POST(req: NextRequest) {
  try {
    // Rate limiting: prevent brute force attacks
    const clientIP = getClientIP(req)
    const rateLimit = checkRateLimit(`auth-webapp:${clientIP}`, AUTH_RATE_LIMIT.maxRequests, AUTH_RATE_LIMIT.windowMs)
    
    if (!rateLimit.allowed) {
      console.warn(`[v0] Rate limit exceeded for IP: ${clientIP}`)
      return NextResponse.json(
        { 
          error: "Rate limit exceeded", 
          retry_after: Math.ceil((rateLimit.resetAt - Date.now()) / 1000) 
        },
        { 
          status: 429,
          headers: {
            "Retry-After": Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
          }
        }
      )
    }

    const body = await req.json()
    const { initData } = body

    if (!initData || typeof initData !== "string") {
      console.error("[v0] Missing or invalid initData")
      return NextResponse.json({ error: "Missing initData" }, { status: 400 })
    }

    // Verify initData signature
    if (!verifyInitData(initData)) {
      console.error("[v0] Invalid initData signature")
      return NextResponse.json({ error: "Invalid initData signature" }, { status: 401 })
    }

    // Parse initData
    const params = new URLSearchParams(initData)
    
    // Check auth_date to prevent replay attacks
    const authDate = params.get("auth_date")
    if (!isAuthDateValid(authDate || undefined)) {
      console.error("[v0] Auth date expired or invalid")
      return NextResponse.json({ error: "Auth date expired" }, { status: 401 })
    }

    // Extract user data from initData
    const rawUser = params.get("user")
    if (!rawUser) {
      console.error("[v0] No user in initData")
      return NextResponse.json({ error: "No user in initData" }, { status: 400 })
    }

    let tgUser
    try {
      tgUser = JSON.parse(rawUser)
    } catch (e) {
      console.error("[v0] Failed to parse user data:", e)
      return NextResponse.json({ error: "Invalid user data" }, { status: 400 })
    }

    // Validate telegram_id format
    const telegramId = String(tgUser.id)
    if (!/^\d+$/.test(telegramId)) {
      console.error("[v0] Invalid telegram_id format:", telegramId)
      return NextResponse.json({ error: "Invalid telegram ID" }, { status: 400 })
    }

    // Extract user data
    const firstName = (tgUser.first_name || "").trim().slice(0, 100)
    const lastName = (tgUser.last_name || "").trim().slice(0, 100)
    const username = tgUser.username ? tgUser.username.trim().slice(0, 50) : null
    const photoUrl = tgUser.photo_url ? tgUser.photo_url.trim() : null
    
    // Validate photo URL
    if (photoUrl && !photoUrl.startsWith("https://")) {
      console.warn("[v0] Invalid photo_url format, ignoring:", photoUrl)
      // Don't fail auth, just ignore invalid photo URL
    }

    // Build full name
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || username || "User"
    
    // Get auth date for audit
    const authDateObj = authDate ? new Date(parseInt(authDate) * 1000) : new Date()

    // Initialize Supabase
    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection error" }, { status: 500 })
    }

    // Find existing user or create new one
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
      // Update existing user
      const updateData: Record<string, any> = {
        username: username || firstName || null,
        photo_url: photoUrl && photoUrl.startsWith("https://") ? photoUrl : null,
        full_name: fullName || null,
        last_auth_date: authDateObj.toISOString(),
        session_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
        last_login_ip: clientIP,
        updated_at: new Date().toISOString(),
      }

      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", existingUser.id)
        .select()
        .single()
      
      user = updatedUser
      error = updateError
    } else {
      // Insert new user
      const insertData: Record<string, any> = {
        telegram_id: telegramId,
        username: username || firstName || null,
        photo_url: photoUrl && photoUrl.startsWith("https://") ? photoUrl : null,
        full_name: fullName || null,
        last_auth_date: authDateObj.toISOString(),
        session_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
        last_login_ip: clientIP,
        updated_at: new Date().toISOString(),
      }

      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert(insertData)
        .select()
        .single()
      
      user = newUser
      error = insertError
    }

    if (error) {
      console.error("[v0] WebApp auth upsert error:", error)
      console.error("[v0] Error details:", JSON.stringify(error, null, 2))
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    if (!user) {
      console.error("[v0] User not created/retrieved")
      return NextResponse.json({ error: "User creation failed" }, { status: 500 })
    }

    // Set authentication cookie
    const res = NextResponse.json({ user })
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

    console.log("[v0] Telegram WebApp auth successful for user:", telegramId, "IP:", clientIP)
    return res
  } catch (error: any) {
    console.error("[v0] Unexpected error in Telegram WebApp auth:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

