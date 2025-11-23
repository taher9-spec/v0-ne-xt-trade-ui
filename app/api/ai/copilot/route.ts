import { NextResponse } from "next/server"
import { type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { cookies } from "next/headers"
import { checkRateLimit, getClientIP } from "@/lib/rateLimit"

// OpenAI API Key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// Rate limiting: 20 AI requests per user per minute
const AI_RATE_LIMIT = {
  maxRequests: 20,
  windowMs: 60 * 1000, // 1 minute
}

// Debug logging for OpenAI API key (only in development)
if (process.env.NODE_ENV === "development") {
  console.log("[DEBUG] Module load - OPENAI_API_KEY present:", !!OPENAI_API_KEY)
  console.log("[DEBUG] Module load - OPENAI_API_KEY length:", OPENAI_API_KEY?.length)
  console.log("[DEBUG] Module load - OPENAI_API_KEY prefix:", OPENAI_API_KEY?.slice(0, 10))
  console.log("[DEBUG] Module load - OPENAI_API_KEY suffix:", OPENAI_API_KEY?.slice(-10))
  
  // Check for common issues
  if (OPENAI_API_KEY) {
    const trimmed = OPENAI_API_KEY.trim()
    if (trimmed.length !== OPENAI_API_KEY.length) {
      console.warn("[DEBUG] ⚠️ WARNING: API key has leading/trailing whitespace!")
    }
    if (OPENAI_API_KEY.includes('"') || OPENAI_API_KEY.includes("'")) {
      console.warn("[DEBUG] ⚠️ WARNING: API key contains quotes!")
    }
    if (!OPENAI_API_KEY.startsWith("sk-")) {
      console.warn("[DEBUG] ⚠️ WARNING: API key doesn't start with 'sk-'")
    }
  }
}

type Body = {
  message: string
  signalId?: string
  conversationId?: string
  tradeId?: string
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    // Rate limiting
    const clientIP = getClientIP(request)
    const rateLimitKey = userId ? `ai:user:${userId}` : `ai:ip:${clientIP}`
    const rateLimit = checkRateLimit(rateLimitKey, AI_RATE_LIMIT.maxRequests, AI_RATE_LIMIT.windowMs)
    
    if (!rateLimit.allowed) {
      console.warn(`[v0] AI rate limit exceeded for ${rateLimitKey}`)
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

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
    }

    const body = (await request.json()) as Body

    if (!body.message || body.message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Load user data if authenticated
    let userData = null
    let signalData = null
    let conversationId = body.conversationId || null
    
    // Initialize Supabase (works for both authenticated and guest users)
    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      // Continue without DB - AI can still work
    }
    
    if (supabase) {
      // Load user data if authenticated
      if (userId) {
        const { data: user } = await supabase
          .from("users")
          .select("plan_code, approx_balance, risk_percent, username")
          .eq("id", userId)
          .single()
        userData = user
      }

      // Load signal data if signalId provided
      if (body.signalId) {
        const { data: signal } = await supabase.from("signals").select("*").eq("id", body.signalId).single()
        signalData = signal
      }
      
      // Handle conversation storage (for both authenticated and guest users)
      // 1) Determine conversation - verify ownership if provided, or find/create
      if (body.conversationId) {
        // Verify conversation exists and belongs to current user (if authenticated)
        try {
          const { data: existingConvo, error: verifyError } = await supabase
            .from("conversations")
            .select("id, user_id")
            .eq("id", body.conversationId)
            .maybeSingle()

          if (verifyError || !existingConvo) {
            console.log("[v0] Conversation not found, will create new one")
            conversationId = null
          } else if (userId && existingConvo.user_id !== userId) {
            console.log("[v0] Conversation belongs to different user, will create new one")
            conversationId = null
          } else {
            conversationId = existingConvo.id
            console.log("[v0] Using provided conversation:", conversationId)
          }
        } catch (e) {
          console.error("[v0] Error verifying conversation:", e)
          conversationId = null
        }
      }

      // If no valid conversationId, find or create one
      if (!conversationId) {
        try {
          // For authenticated users, look for latest conversation from today
          if (userId) {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const { data: existingConvo } = await supabase
              .from("conversations")
              .select("id")
              .eq("user_id", userId)
              .gte("created_at", today.toISOString())
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()

            if (existingConvo) {
              conversationId = existingConvo.id
              console.log("[v0] Reusing existing conversation from today:", conversationId)
            }
          }

          // Create new conversation if none found
          if (!conversationId) {
            const { data: newConversation, error: convError } = await supabase
              .from("conversations")
              .insert({
                user_id: userId || null, // null for guest users
                title: body.message.slice(0, 40) || "New Conversation",
                signal_id: body.signalId || null,
                trade_id: body.tradeId || null,
              })
              .select("id")
              .single()
          
            if (!convError && newConversation) {
              conversationId = newConversation.id
              console.log("[v0] Created new conversation:", conversationId)
            } else {
              console.error("[v0] Failed to create conversation:", convError)
              // Continue without conversation storage - AI can still work
            }
          }
        } catch (dbError: any) {
          console.error("[v0] Database error creating conversation:", dbError)
          // Continue without conversation storage - AI can still work
        }
      }
      
      // 2) Store user message BEFORE calling OpenAI (if conversation exists)
      if (conversationId) {
        try {
          const { error: msgError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "user",
            content: body.message,
            metadata: {
              ...(body.signalId ? { signalId: body.signalId } : {}),
              ...(body.tradeId ? { tradeId: body.tradeId } : {}),
            },
          })
          if (msgError) {
            console.error("[v0] Failed to store user message:", msgError)
            // Continue - message storage is optional
          } else {
            console.log("[v0] Stored user message in conversation:", conversationId)
          }
        } catch (dbError: any) {
          console.error("[v0] Database error storing message:", dbError)
          // Continue - message storage is optional
        }
      }
    }
    
    // 3) Load conversation history from Supabase (if conversation exists)
    // Fetch last N messages ordered by created_at ascending (includes the user message we just stored)
    let history: Array<{ role: "user" | "assistant"; content: string }> = []
    
    if (supabase && conversationId) {
      try {
        const { data: rows, error: historyError } = await supabase
          .from("messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(20) // Last 20 messages for context
        
        if (!historyError && rows) {
          history = rows.map((r) => ({
            role: r.role as "user" | "assistant",
            content: r.content,
          }))
          console.log(`[v0] Loaded ${history.length} messages from conversation history`)
        } else if (historyError) {
          console.error("[v0] Failed to load history:", historyError)
        }
      } catch (dbError: any) {
        console.error("[v0] Database error loading history:", dbError)
        // Continue without history - AI can still work
      }
    }

    // Build system prompt
    const systemPrompt = `You are the NeXT TRADE AI Copilot, a helpful trading assistant for the NeXT TRADE Telegram mini app.

IMPORTANT RULES:
- You are a trading assistant, NOT a broker or financial advisor
- You explain trading signals, risk management, and help users understand their trades
- You MUST NOT invent prices, open trades, or make trading decisions for users
- You focus on education, signal explanations, and journaling support
- Signals come from a rules-based engine using technical indicators (EMA, ATR, RSI)
- You help users understand risk/reward ratios, position sizing, and trade management

${userData ? `User context:
- Plan: ${userData.plan_code || "Free"}
- Balance: $${userData.approx_balance || 0}
- Risk per trade: ${userData.risk_percent || 1}%
` : ""}

${signalData ? `Current signal context:
- Symbol: ${signalData.symbol}
- Direction: ${signalData.direction}
- Entry: ${signalData.entry}
- Stop Loss: ${signalData.sl}
- Take Profit: ${signalData.tp1}
- Type: ${signalData.type}
- Reason: ${signalData.reason_summary || "N/A"}
` : ""}

Be concise, helpful, and focus on practical trading advice. Always remind users about risk management.`

    try {
      // CRITICAL: Read directly from process.env to ensure we get the latest value
      // Next.js might cache the module-level constant, so read fresh each time
      const apiKeyFromEnv = process.env.OPENAI_API_KEY?.trim()
      const apiKeyFromGlobal = OPENAI_API_KEY?.trim()
      
      // Use env var directly (more reliable than module-level constant)
      const apiKey = apiKeyFromEnv || apiKeyFromGlobal
      
      console.log("[DEBUG] ========== API KEY CHECK ==========")
      console.log("[DEBUG] process.env.OPENAI_API_KEY exists:", !!process.env.OPENAI_API_KEY)
      console.log("[DEBUG] process.env.OPENAI_API_KEY length:", process.env.OPENAI_API_KEY?.length)
      console.log("[DEBUG] process.env.OPENAI_API_KEY prefix:", process.env.OPENAI_API_KEY?.slice(0, 10))
      console.log("[DEBUG] process.env.OPENAI_API_KEY suffix:", process.env.OPENAI_API_KEY?.slice(-10))
      console.log("[DEBUG] Global OPENAI_API_KEY exists:", !!OPENAI_API_KEY)
      console.log("[DEBUG] Global OPENAI_API_KEY length:", OPENAI_API_KEY?.length)
      console.log("[DEBUG] apiKey (final) length:", apiKey?.length)
      console.log("[DEBUG] apiKey (final) prefix:", apiKey?.slice(0, 10))
      console.log("[DEBUG] apiKey (final) suffix:", apiKey?.slice(-10))
      console.log("[DEBUG] Keys match:", apiKeyFromEnv === apiKeyFromGlobal)
      console.log("[DEBUG] ===================================")
      
      if (!apiKey) {
        console.error("[v0] OpenAI API key is empty or missing")
        return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
      }

      console.log("[v0] Calling OpenAI API with model: gpt-4o-mini")
    
      // Build messages array: system prompt + history (which includes current user message if stored)
      // If history is empty, add current message manually
      const openaiMessages = [
        { role: "system", content: systemPrompt },
        ...(history.length > 0 
          ? history.map((m) => ({ role: m.role, content: m.content }))
          : [{ role: "user" as const, content: body.message }]
        ),
      ]

      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText }
      }
      
      console.error("[v0] OpenAI API error:", openaiResponse.status, errorData)
      console.error("[DEBUG] Full error response:", errorText)
      
      // Enhanced debugging for 401 errors
      if (openaiResponse.status === 401) {
        console.error("[DEBUG] ========== API KEY DIAGNOSTICS ==========")
        console.error("[DEBUG] API key length:", apiKey.length)
        console.error("[DEBUG] API key first 15 chars:", apiKey.slice(0, 15))
        console.error("[DEBUG] API key last 15 chars:", apiKey.slice(-15))
        console.error("[DEBUG] API key full (for comparison):", apiKey)
        console.error("[DEBUG] API key has whitespace:", apiKey !== apiKey.trim())
        console.error("[DEBUG] API key has quotes:", apiKey.includes('"') || apiKey.includes("'"))
        console.error("[DEBUG] API key has newlines:", apiKey.includes("\n") || apiKey.includes("\r"))
        console.error("[DEBUG] API key char codes (first 50):", Array.from(apiKey.slice(0, 50)).map(c => c.charCodeAt(0)).join(','))
        console.error("[DEBUG] API key char codes (last 50):", Array.from(apiKey.slice(-50)).map(c => c.charCodeAt(0)).join(','))
        console.error("[DEBUG] =========================================")
        
        const errorMessage = errorData.error?.message || "Invalid API key"
        if (errorMessage.includes("Incorrect API key") || errorMessage.includes("Invalid API key")) {
          console.error("[DEBUG] ❌ OpenAI rejected the API key. Troubleshooting steps:")
          console.error("[DEBUG] 1. Check if key is valid at: https://platform.openai.com/account/api-keys")
          console.error("[DEBUG] 2. Ensure no quotes in .env.local: OPENAI_API_KEY=sk-proj-... (NOT OPENAI_API_KEY=\"sk-proj-...\")")
          console.error("[DEBUG] 3. Ensure no spaces before/after the key")
          console.error("[DEBUG] 4. Ensure no newlines in the key")
          console.error("[DEBUG] 5. Check if OpenAI account has billing enabled")
          console.error("[DEBUG] 6. Restart dev server after changing .env.local")
          console.error("[DEBUG] 7. Generate a new key if current one is revoked/expired")
        }
      }
      
      // Return user-friendly error
      let userError = errorData.error?.message || `OpenAI API error: ${openaiResponse.status}`
      if (openaiResponse.status === 401) {
        userError = "Invalid OpenAI API key. Please check your API key configuration."
      }
      
      return NextResponse.json({ 
        error: userError,
        code: errorData.error?.code,
        type: errorData.error?.type,
        details: process.env.NODE_ENV === "development" ? {
          status: openaiResponse.status,
          message: errorData.error?.message,
        } : undefined
      }, { status: openaiResponse.status })
    }

    const data = await openaiResponse.json()
    const reply = data.choices?.[0]?.message?.content
    
    if (!reply) {
      console.error("[v0] No reply in OpenAI response:", data)
      return NextResponse.json({ error: "No response from AI" }, { status: 500 })
    }

      console.log("[v0] OpenAI response received successfully")
      
      // Store assistant message in database (gracefully handle errors)
      if (supabase && conversationId && reply) {
        try {
          const { error: msgError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: reply,
            metadata: { model: "gpt-4o-mini" },
          })
          if (msgError) {
            console.error("[v0] Failed to store assistant message:", msgError)
          } else {
            console.log("[v0] Stored assistant message in conversation:", conversationId)
          }
          
          // Update conversation updated_at (if column exists)
          try {
            const { error: updateError } = await supabase
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversationId)
            if (updateError) {
              // updated_at column might not exist, ignore error
              console.log("[v0] Note: updated_at update failed (column may not exist):", updateError)
            }
          } catch (e) {
            // Ignore - updated_at is optional
          }
        } catch (dbError: any) {
          console.error("[v0] Database error storing assistant message:", dbError)
          // Continue - message storage is optional, AI response is already generated
        }
      }
      
      return NextResponse.json({ 
        reply,
        conversationId: conversationId || undefined,
      })
    } catch (error: any) {
      console.error("[v0] AI Copilot error:", error.message || error)
      return NextResponse.json({ 
        error: error.message || "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error("[v0] Unexpected error in /api/ai/copilot:", error)
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error.message 
    }, { status: 500 })
  }
}
