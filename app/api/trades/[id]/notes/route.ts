import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabaseServer"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { notes } = await req.json()
    const tradeId = params.id

    const supabase = supabaseServer()

    // Update trade notes
    const { error } = await supabase
      .from("trades")
      .update({ notes: notes || null })
      .eq("id", tradeId)
      .eq("user_id", userId) // Ensure user owns this trade

    if (error) {
      console.error("[v0] Error updating trade notes:", error)
      return NextResponse.json({ error: "Failed to update notes" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Unexpected error in /api/trades/[id]/notes:", error)
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error.message 
    }, { status: 500 })
  }
}

