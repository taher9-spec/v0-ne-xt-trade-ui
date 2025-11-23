/**
 * Helper to detect if we're running inside Telegram WebApp
 */
export function isTelegramWebApp(): boolean {
  if (typeof window === "undefined") return false

  // @ts-ignore - Telegram WebApp is injected by Telegram
  return !!(window.Telegram?.WebApp?.initDataUnsafe?.user || window.Telegram?.WebApp?.initData)
}

/**
 * Get Telegram WebApp instance
 */
export function getTelegramWebApp() {
  if (typeof window === "undefined") return null
  // @ts-ignore
  return window.Telegram?.WebApp || null
}

/**
 * Get initData from Telegram WebApp
 */
export function getTelegramInitData(): string | null {
  const tg = getTelegramWebApp()
  if (!tg) return null
  return tg.initData || null
}

