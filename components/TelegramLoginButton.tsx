"use client"

import { useEffect, useRef } from "react"

export function TelegramLoginButton() {
  const containerRef = useRef<HTMLDivElement>(null)
  const scriptLoadedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || scriptLoadedRef.current) return

    // Check if script already exists
    const existingScript = document.querySelector('script[src="https://telegram.org/js/telegram-widget.js?22"]')
    if (existingScript) {
      scriptLoadedRef.current = true
    }

    // Create script element for Telegram widget
    const script = document.createElement("script")
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.async = true
    script.setAttribute("data-telegram-login", "nexttrade_SIGNAL_bot")
    script.setAttribute("data-size", "large")
    script.setAttribute("data-userpic", "false")
    script.setAttribute("data-request-access", "write")
    script.setAttribute("data-auth-url", window.location.origin + "/api/auth/telegram")
    
    script.onerror = () => {
      console.error("[v0] Failed to load Telegram widget script")
      if (containerRef.current) {
        containerRef.current.innerHTML = '<p class="text-xs text-red-400">Failed to load Telegram widget. Please check bot configuration.</p>'
      }
    }

    containerRef.current.innerHTML = ""
    containerRef.current.appendChild(script)
    scriptLoadedRef.current = true

    return () => {
      // Cleanup handled by React
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <p className="text-sm text-zinc-400 text-center">Sign in with Telegram to save your profile and trades.</p>
      <p className="text-xs text-zinc-500 text-center">Note: Make sure your bot domain is configured in BotFather</p>
      <div ref={containerRef} className="min-h-[40px] flex items-center justify-center w-full" />
    </div>
  )
}
