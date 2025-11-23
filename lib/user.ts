/**
 * Client-side helper to get current user ID from cookies
 * Used consistently across the app for user identification
 */

export function getCurrentUserId(): string | null {
  if (typeof document === "undefined") return null

  const cookies = document.cookie.split(";")
  const tgUserIdCookie = cookies.find((c) => c.trim().startsWith("tg_user_id="))

  if (!tgUserIdCookie) return null

  const value = tgUserIdCookie.split("=")[1]?.trim()
  return value || null
}

/**
 * Server-side helper to get current user ID from cookies
 * Use this in API routes
 */
export async function getCurrentUserIdServer(): Promise<string | null> {
  const { cookies } = await import("next/headers")
  const cookieStore = await cookies()
  return cookieStore.get("tg_user_id")?.value || null
}

