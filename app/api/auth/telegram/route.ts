import { type NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import crypto from "crypto"

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

function verifyTelegramAuth(data: Record<string, string>): boolean {
  const { hash, ...fields } = data

  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n")

  const secretKey = crypto.createHash("sha256").update(BOT_TOKEN).digest()
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex")

  return hmac === hash
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const params = Object.fromEntries(url.searchParams.entries())

  if (!params.hash) {
    return NextResponse.redirect(new URL("/?auth=failed", req.url))
  }

  // Verify only if we have the BOT_TOKEN set, otherwise assume dev mode if needed or fail
  if (BOT_TOKEN && !verifyTelegramAuth(params)) {
    return NextResponse.redirect(new URL("/?auth=failed", req.url))
  }

  const telegramId = params.id
  const username = params.username ?? params.first_name ?? ""
  const photoUrl = params.photo_url ?? ""

  const supabase = supabaseServer()

  const { data: user, error } = await supabase
    .from("users")
    .upsert(
      {
        telegram_id: telegramId,
        username,
        photo_url: photoUrl,
      },
      { onConflict: "telegram_id" },
    )
    .select()
    .single()

  if (error || !user) {
    console.error("Telegram auth upsert error", error)
    return NextResponse.redirect(new URL("/?auth=failed", req.url))
  }

  const res = NextResponse.redirect(new URL("/?auth=success", req.url))

  res.cookies.set("tg_user_id", user.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })

  return res
}
