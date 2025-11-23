import type React from "react"
import type { Metadata } from "next"
// import { Geist, Geist_Mono } from "next/font/google"
// import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

// const _geist = Geist({ subsets: ["latin"] })
// const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "NeXT TRADE - Trading Signals",
  description: "Modern trading signals Telegram mini app with AI-powered analysis",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/next_trade_logo.png",
      },
      {
        url: "/favicon.ico",
        rel: "shortcut icon",
      },
    ],
    apple: "/next_trade_logo.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        {/* Telegram WebApp SDK - Required for Mini App authentication */}
        <script src="https://telegram.org/js/telegram-web-app.js" async />
      </head>
      <body className={`font-sans antialiased`}>
        {children}
        {/* <Analytics /> */}
      </body>
    </html>
  )
}
