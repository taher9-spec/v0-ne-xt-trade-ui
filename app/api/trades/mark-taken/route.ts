import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type Body = {
  userId: string
  signalId: string
  entryPrice?: number
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = (await request.json()) as Body

  if (!body.userId || !body.signalId) {
    return NextResponse.json({ error: "Missing userId or signalId" }, { status: 400 })
  }

  // Get the signal details
  const { data: signal, error: sigErr } = await supabase.from("signals").select("*").eq("id", body.signalId).single()

  if (sigErr || !signal) {
    console.error("[v0] Signal not found", sigErr)
    return NextResponse.json({ error: "Signal not found" }, { status: 404 })
  }

  const { data, error } = await supabase
    .from("trades")
    .insert({
      user_id: body.userId,
      signal_id: body.signalId,
      symbol: signal.symbol,
      direction: signal.direction,
      entry_price: body.entryPrice ?? signal.entry,
      timeframe: signal.type,
      status: "open",
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] Error inserting trade", error)
    return NextResponse.json({ error: "Failed to record trade" }, { status: 500 })
  }

  return NextResponse.json({ trade: data })
}
