import { NextRequest, NextResponse } from "next/server"
import { runSignalEngine } from "@/lib/signalEngine"

const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.SIGNAL_ENGINE_SECRET

export async function POST(req: NextRequest) {
  try {
    // Verify admin secret
    const authHeader = req.headers.get("authorization")
    const secretParam = req.nextUrl.searchParams.get("secret")

    const providedSecret = authHeader?.replace("Bearer ", "") || secretParam

    if (!ADMIN_SECRET || providedSecret !== ADMIN_SECRET) {
      console.error("[v0] Unauthorized signal engine run attempt")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Running signal engine...")
    const result = await runSignalEngine()

    return NextResponse.json({
      success: true,
      generated: result.generated,
      signals: result.signals,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("[v0] Signal engine route error:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}

// Also support GET for cron jobs
export async function GET(req: NextRequest) {
  return POST(req)
}

