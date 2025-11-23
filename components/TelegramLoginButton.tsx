"use client"

import Script from "next/script"

export function TelegramLoginButton() {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <p className="text-sm text-zinc-400 text-center">Sign in with Telegram to save your profile and trades.</p>

      {/* Telegram widget script */}
      <Script
        src="https://telegram.org/js/telegram-widget.js?22"
        strategy="afterInteractive"
        data-telegram-login="NeXT_TRADE_Bot"
        data-size="large"
        data-userpic="false"
        data-request-access="write"
        data-auth-url="/api/auth/telegram"
      />

      {/* Fallback/Dev visualization since widget might not render in preview */}
      <div className="text-xs text-zinc-600 mt-2">(Ensure TELEGRAM_BOT_TOKEN is set in Vercel)</div>
    </div>
  )
}
