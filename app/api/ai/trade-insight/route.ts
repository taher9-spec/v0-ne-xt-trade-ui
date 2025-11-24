import { NextResponse } from "next/server"
import { type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { cookies } from "next/headers"
import { checkRateLimit, getClientIP } from "@/lib/rateLimit"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// Casual, friendly AI responses for trade insights
const TONE_EXAMPLES = `
TONE GUIDELINES - Be casual, friendly, sometimes funny, but always real:

If position is profitable and approaching TP:
- "You're cooking! 🔥 Don't let greed ruin a good trade. Consider taking some off the table."
- "Nice one! TP1 is right there. Remember: a bird in hand..."
- "Looking good! But the market can flip fast. Secure some gains, yeah?"

If position hit TP1, TP2 still pending:
- "TP1 secured! 💪 Now the question: let it ride or lock in more? Your call, champ."
- "One target down! You're in profit - the rest is bonus money. Play it smart."

If position is struggling near SL:
- "Getting tight here. If SL hits, it's not the end of the world. Part of the game."
- "Price testing your patience. Stay calm - your SL is there for a reason."
- "Rough patch. But hey, even pros take losses. Risk management > emotions."

If SL was hit:
- "SL hit. So what? Every trader has losses. Dust yourself off and move on."
- "Lost this one. It happens to literally everyone. On to the next!"
- "Trade didn't work out. That's trading, bro. Review it, learn, keep going."

If position is in profit but pulling back:
- "Pullback happening. Normal market behavior. Don't panic-close a winner."
- "Price taking a breather. Watch your levels but don't overthink it."

General advice:
- "Remember: protect your capital. No single trade should make or break you."
- "Manage risk first, profits second. That's how you stay in the game."
`

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    // Rate limiting
    const clientIP = getClientIP(request)
    const rateLimitKey = userId ? `trade-insight:user:${userId}` : `trade-insight:ip:${clientIP}`
    const rateLimit = checkRateLimit(rateLimitKey, 30, 60 * 1000) // 30 requests per minute
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retry_after: Math.ceil((rateLimit.resetAt - Date.now()) / 1000) },
        { status: 429 }
      )
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
    }

    const body = await request.json()
    const { tradeId } = body

    if (!tradeId) {
      return NextResponse.json({ error: "Trade ID is required" }, { status: 400 })
    }

    // Fetch trade data
    let supabase
    try {
      supabase = supabaseServer()
    } catch (error) {
      return NextResponse.json({ error: "Database connection failed" }, { status: 500 })
    }

    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .select("*, signals(*)")
      .eq("id", tradeId)
      .single()

    if (tradeError || !trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 })
    }

    // Build context for AI
    const direction = (trade.direction || "").toLowerCase()
    const entryPrice = trade.entry_price || trade.signals?.entry || 0
    const currentPrice = trade.current_price || entryPrice
    const stopLoss = trade.sl || trade.signals?.sl || 0
    const tp1 = trade.tp1 || trade.signals?.tp1 || 0
    const tp2 = trade.tp2 || trade.signals?.tp2 || null
    const tp3 = trade.tp3 || trade.signals?.tp3 || null
    const status = trade.status
    const floatingR = trade.floating_r || 0
    const floatingPnl = trade.floating_pnl_percent || 0
    const resultR = trade.result_r || 0
    const pnlPercent = trade.pnl_percent || 0

    // Calculate progress to targets
    let tp1Progress = 0
    let tp2Progress = 0
    if (direction === "long" && tp1 > entryPrice) {
      tp1Progress = Math.min(100, Math.max(0, ((currentPrice - entryPrice) / (tp1 - entryPrice)) * 100))
      if (tp2) tp2Progress = Math.min(100, Math.max(0, ((currentPrice - entryPrice) / (tp2 - entryPrice)) * 100))
    } else if (direction === "short" && tp1 < entryPrice) {
      tp1Progress = Math.min(100, Math.max(0, ((entryPrice - currentPrice) / (entryPrice - tp1)) * 100))
      if (tp2) tp2Progress = Math.min(100, Math.max(0, ((entryPrice - currentPrice) / (entryPrice - tp2)) * 100))
    }

    // Determine situation
    let situation = "open trade"
    if (status === "tp_hit") situation = "TP hit - trade closed in profit"
    else if (status === "sl_hit") situation = "SL hit - trade closed at loss"
    else if (status === "closed_manual") situation = "manually closed"
    else if (floatingR > 0 && tp1Progress >= 80) situation = "approaching TP1, in profit"
    else if (floatingR > 0 && tp1Progress >= 100) situation = "TP1 reached, still open"
    else if (floatingR > 0) situation = "in profit"
    else if (floatingR < -0.5) situation = "in drawdown, approaching SL"
    else if (floatingR < 0) situation = "slightly negative"

    const systemPrompt = `You are a casual, friendly trading buddy giving quick insights on a trade position.
Your responses should be SHORT (1-2 sentences max), casual, sometimes funny, but always helpful and real.
Don't use formal language. Talk like a friend who happens to know trading.

${TONE_EXAMPLES}

IMPORTANT:
- Keep it SHORT - max 2 sentences
- Be encouraging but realistic
- Never give specific price predictions
- Focus on risk management and emotional control
- Use casual language, occasional slang is fine
- Don't be preachy or lecture-y`

    const userPrompt = `Trade situation:
- Symbol: ${trade.symbol}
- Direction: ${direction.toUpperCase()}
- Status: ${status}
- Entry: ${entryPrice}
- Current price: ${currentPrice}
- Stop Loss: ${stopLoss}
- TP1: ${tp1}${tp2 ? `, TP2: ${tp2}` : ""}${tp3 ? `, TP3: ${tp3}` : ""}
- Current R: ${status === "open" ? floatingR.toFixed(2) : resultR.toFixed(2)}R
- Current P&L: ${status === "open" ? floatingPnl.toFixed(2) : pnlPercent.toFixed(2)}%
- TP1 Progress: ${tp1Progress.toFixed(0)}%
- Situation: ${situation}

Give a quick, casual insight or advice for this trade.`

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 100,
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error("[trade-insight] OpenAI error:", errorText)
      return NextResponse.json({ error: "AI service error" }, { status: 500 })
    }

    const data = await openaiResponse.json()
    const insight = data.choices?.[0]?.message?.content?.trim()

    if (!insight) {
      return NextResponse.json({ error: "No insight generated" }, { status: 500 })
    }

    return NextResponse.json({ insight })
  } catch (error: any) {
    console.error("[trade-insight] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

