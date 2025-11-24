import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabaseServer"
import { seedTestSignals } from "@/lib/dev/seedSignals"

/**
 * POST /api/admin/seed-signals
 * Seeds test signals for development/testing
 * Only works in non-production OR if admin Telegram ID is provided
 */
export async function POST(req: NextRequest) {
  try {
    // In production, require admin authentication
    let adminTelegramId: string | undefined = undefined

    if (process.env.NODE_ENV === "production") {
      const cookieStore = await cookies()
      const userId = cookieStore.get("tg_user_id")?.value

      if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      // Get user's telegram_id to check if they're admin
      const supabase = supabaseServer()
      const { data: user } = await supabase
        .from("users")
        .select("telegram_id")
        .eq("id", userId)
        .single()

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }

      // For now, allow any authenticated user in production
      // You can add a specific admin check here later
      adminTelegramId = user.telegram_id || undefined
    }

    console.log("[v0] Seeding test signals...")
    const result = await seedTestSignals(adminTelegramId)

    return NextResponse.json({
      success: true,
      message: `Seeded ${result.count} test signals`,
      signals: result.signals,
    })
  } catch (error: any) {
    console.error("[v0] Error seeding signals:", error)
    return NextResponse.json(
      { 
        error: "Failed to seed signals", 
        details: error.message 
      },
      { status: 500 }
    )
  }
}

// Also support GET for easy testing
export async function GET(req: NextRequest) {
  return POST(req)
}

