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
    // Official Telegram Login Widget documentation: https://core.telegram.org/widgets/login
    const script = document.createElement("script")
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.async = true
    script.setAttribute("data-telegram-login", "nexttrade_SIGNAL_bot")
    script.setAttribute("data-size", "large")
    script.setAttribute("data-userpic", "true") // Show user photo in widget
    script.setAttribute("data-request-access", "write")
    // data-auth-url: URL where Telegram will send the authentication data via GET request
    // Must be an absolute URL (same origin or configured in BotFather)
    const authUrl = window.location.origin + "/api/auth/telegram"
    script.setAttribute("data-auth-url", authUrl)
    console.log("[v0] Telegram Login Widget configured with auth URL:", authUrl)
    
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
