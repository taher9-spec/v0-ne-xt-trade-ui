import { NextResponse } from "next/server"
import { type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { cookies } from "next/headers"

// GET - Fetch user's favorites
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const tgUserId = cookieStore.get("tg_user_id")?.value

    if (!tgUserId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection error" }, { status: 500 })
    }

    // Get user's internal ID
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", tgUserId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get favorites with symbol details
    const { data: favorites, error: favError } = await supabase
      .from("user_favorites")
      .select("symbol_id, created_at, symbols(id, fmp_symbol, display_symbol, name, asset_class)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (favError) {
      console.error("[v0] Error fetching favorites:", favError)
      return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 })
    }

    return NextResponse.json({ favorites: favorites || [] })
  } catch (error: any) {
    console.error("[v0] Unexpected error in GET /api/favorites:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Add a favorite
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const tgUserId = cookieStore.get("tg_user_id")?.value

    if (!tgUserId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await request.json()
    const { symbolId } = body

    if (!symbolId) {
      return NextResponse.json({ error: "Symbol ID is required" }, { status: 400 })
    }

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection error" }, { status: 500 })
    }

    // Get user's internal ID
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", tgUserId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Insert favorite (upsert to handle duplicates gracefully)
    const { data: favorite, error: insertError } = await supabase
      .from("user_favorites")
      .upsert({ user_id: user.id, symbol_id: symbolId }, { onConflict: "user_id,symbol_id" })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] Error adding favorite:", insertError)
      return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 })
    }

    return NextResponse.json({ success: true, favorite })
  } catch (error: any) {
    console.error("[v0] Unexpected error in POST /api/favorites:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Remove a favorite
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const tgUserId = cookieStore.get("tg_user_id")?.value

    if (!tgUserId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const symbolId = searchParams.get("symbolId")

    if (!symbolId) {
      return NextResponse.json({ error: "Symbol ID is required" }, { status: 400 })
    }

    let supabase
    try {
      supabase = supabaseServer()
    } catch (error: any) {
      console.error("[v0] Failed to initialize Supabase:", error)
      return NextResponse.json({ error: "Database connection error" }, { status: 500 })
    }

    // Get user's internal ID
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", tgUserId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Delete favorite
    const { error: deleteError } = await supabase
      .from("user_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("symbol_id", symbolId)

    if (deleteError) {
      console.error("[v0] Error removing favorite:", deleteError)
      return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Unexpected error in DELETE /api/favorites:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

