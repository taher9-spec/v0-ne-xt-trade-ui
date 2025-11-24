import { NextResponse } from "next/server"
import { getAllSymbols } from "@/lib/supabase/symbols"

/**
 * GET /api/symbols
 * Returns all active symbols from the database
 */
export async function GET() {
  try {
    const symbols = await getAllSymbols()
    return NextResponse.json({ symbols })
  } catch (error: any) {
    console.error("[v0] Error in /api/symbols:", error)
    return NextResponse.json({ error: "Internal server error", symbols: [] }, { status: 500 })
  }
}
