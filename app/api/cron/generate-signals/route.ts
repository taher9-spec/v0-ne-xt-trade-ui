import { NextRequest, NextResponse } from "next/server"
import { runSignalEngine } from "@/lib/signalEngine"

const CRON_SECRET = process.env.CRON_SECRET || process.env.ADMIN_SECRET || process.env.SIGNAL_ENGINE_SECRET

/**
 * GET/POST /api/cron/generate-signals
 * Cron endpoint for automated signal generation
 * Protected by X-CRON-SECRET header or ?secret= query param
 */
export async function GET(req: NextRequest) {
  return handleRequest(req)
}

export async function POST(req: NextRequest) {
  return handleRequest(req)
}

async function handleRequest(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("x-cron-secret")
    const secretParam = req.nextUrl.searchParams.get("secret")

    const providedSecret = authHeader || secretParam

    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.error("[v0] Unauthorized cron signal generation attempt")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Running cron signal generation...")
    const result = await runSignalEngine()

    return NextResponse.json({
      success: true,
      generated: result.generated,
      signals: result.signals,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("[v0] Cron signal generation error:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}

