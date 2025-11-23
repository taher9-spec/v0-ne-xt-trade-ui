import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabaseServer"

/**
 * Logout endpoint - clears session and updates database
 */
export async function POST() {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("tg_user_id")?.value

    // Update session expiry in database if user exists
    if (userId) {
      try {
        const supabase = supabaseServer()
        await supabase
          .from("users")
          .update({ session_expires_at: new Date().toISOString() })
          .eq("id", userId)
      } catch (error) {
        console.error("[v0] Error updating session expiry:", error)
        // Continue with logout even if DB update fails
      }
    }

    // Clear authentication cookie
    const res = NextResponse.json({ success: true, message: "Logged out successfully" })
    res.cookies.set("tg_user_id", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0, // Delete cookie
    })

    return res
  } catch (error: any) {
    console.error("[v0] Logout error:", error)
    return NextResponse.json({ error: "Logout failed" }, { status: 500 })
  }
}

