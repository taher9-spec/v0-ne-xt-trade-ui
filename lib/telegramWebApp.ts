/**
 * Helper to detect if we're running inside Telegram WebApp
 * Only returns true if we have actual user data (not just the script loaded)
 */
export function isTelegramWebApp(): boolean {
  if (typeof window === "undefined") return false

  // @ts-ignore - Telegram WebApp is injected by Telegram
  const tg = window.Telegram?.WebApp
  
  // Only consider it a WebApp if we have actual user data
  // Just having the WebApp object isn't enough - we need initDataUnsafe.user
  if (!tg) return false
  
  // Check if we have actual user data (this only exists inside Telegram Mini App)
  const hasUserData = !!tg.initDataUnsafe?.user
  
  // Also check if initData exists (raw string from Telegram)
  const hasInitData = !!tg.initData && tg.initData.length > 0
  
  // Only return true if we have actual user data, not just the script loaded
  return hasUserData && hasInitData
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

