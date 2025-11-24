"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, ArrowLeft, Lock, Crown, Clock, Home, Coins, Sparkles, BookOpen, UserIcon, ArrowUpRight, ArrowDownRight } from "lucide-react"
import type { Signal } from "@/lib/types"
import { formatNumber, parseNumber } from "@/types/trades"
import { getSymbolLogo } from "@/lib/utils/symbolLogos"
import { isSymbolUnlocked, getRequiredPlanForSymbol } from "@/lib/utils/planSymbols"
import { createSupabaseClient } from "@/lib/supabase/client"

type TimeframeStyle = {
  strip: string
  badge: string
}

const TIMEFRAME_STYLE_MAP: Record<string, TimeframeStyle> = {
  "5m": { strip: "from-cyan-500/70 via-blue-500/40 to-transparent", badge: "bg-cyan-500/15 border-cyan-500/40 text-cyan-50" },
  "5min": { strip: "from-cyan-500/70 via-blue-500/40 to-transparent", badge: "bg-cyan-500/15 border-cyan-500/40 text-cyan-50" },
  "15m": { strip: "from-indigo-500/70 via-purple-500/40 to-transparent", badge: "bg-purple-500/15 border-purple-500/40 text-purple-50" },
  "15min": { strip: "from-indigo-500/70 via-purple-500/40 to-transparent", badge: "bg-purple-500/15 border-purple-500/40 text-purple-50" },
  "1h": { strip: "from-amber-500/70 via-orange-500/40 to-transparent", badge: "bg-amber-500/15 border-amber-500/40 text-amber-50" },
  "4h": { strip: "from-rose-500/70 via-pink-500/40 to-transparent", badge: "bg-rose-500/15 border-rose-500/40 text-rose-50" },
  "1d": { strip: "from-sky-500/70 via-slate-500/40 to-transparent", badge: "bg-sky-500/15 border-sky-500/40 text-sky-50" },
  "1day": { strip: "from-sky-500/70 via-slate-500/40 to-transparent", badge: "bg-sky-500/15 border-sky-500/40 text-sky-50" },
  default: { strip: "from-emerald-500/60 via-blue-500/30 to-transparent", badge: "bg-emerald-500/15 border-emerald-500/40 text-emerald-50" },
}

const getTimeframeStyle = (raw?: string | null): TimeframeStyle => {
  if (!raw) return TIMEFRAME_STYLE_MAP.default
  const key = raw.toLowerCase()
  return TIMEFRAME_STYLE_MAP[key] || TIMEFRAME_STYLE_MAP.default
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [symbols, setSymbols] = useState<Array<{ fmp_symbol: string; display_symbol: string }>>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "active" | "history">("all")
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState<string | null>(null)
  const [user, setUser] = useState<{ plan_code: string | null } | null>(null)

  // Fetch user plan
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" })
        if (res.ok) {
          const json = await res.json()
          setUser(json.user || null)
        }
      } catch (e) {
        // Silent fail
      }
    }
    fetchUser()
  }, [])

  // Read URL parameters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const symbolParam = urlParams.get('symbol')
      const statusParam = urlParams.get('status')
      
      if (symbolParam) setSelectedSymbol(symbolParam)
      if (statusParam === 'active') setFilter('active')
      else if (statusParam === 'history') setFilter('history')
    }
  }, [])

  // Fetch signals
  useEffect(() => {
    const fetchSignals = async () => {
      setLoading(true)
      try {
        const statusParam = filter === "all" ? "all" : filter === "active" ? "active" : "history"
        let url = `/api/signals/all?status=${statusParam}`
        if (selectedSymbol) url += `&symbol=${encodeURIComponent(selectedSymbol)}`
        if (selectedTimeframe) url += `&timeframe=${encodeURIComponent(selectedTimeframe)}`
        
        const res = await fetch(url, { cache: "no-store" })
        if (!res.ok) {
          setSignals([])
          return
        }
        const json = await res.json()
        setSignals(json.signals || [])
      } catch (e) {
        setSignals([])
      } finally {
        setLoading(false)
      }
    }
    fetchSignals()
  }, [filter, selectedSymbol, selectedTimeframe])

  // Fetch symbols
  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const res = await fetch("/api/symbols", { cache: "no-store" })
        if (res.ok) {
          const json = await res.json()
          setSymbols(json.symbols || [])
        }
      } catch (e) {
        console.error("[signals] Error fetching symbols:", e)
      }
    }
    fetchSymbols()
  }, [])

  const formatRelativeTime = (dateString: string | null | undefined) => {
    if (!dateString) return ""
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return "Just now"
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      if (diffDays < 7) return `${diffDays}d ago`
      return date.toLocaleDateString()
    } catch {
      return ""
    }
  }

  // SignalCard component
  const SignalCard = ({ signal }: { signal: Signal }) => {
    const [currentPrice, setCurrentPrice] = useState<number | null>(null)
    const [priceChange, setPriceChange] = useState<number | null>(null)
    const [logoError, setLogoError] = useState(false)

    const planCode = user?.plan_code || null
    const symbolUnlocked = isSymbolUnlocked(signal.symbol, planCode)
    const requiredPlan = getRequiredPlanForSymbol(signal.symbol)

    useEffect(() => {
      const fmpSymbol = signal.symbols?.fmp_symbol || signal.symbol
      if (!fmpSymbol) return

      const fetchPrice = async () => {
        try {
          const res = await fetch(`/api/quote?symbol=${encodeURIComponent(fmpSymbol)}`, {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
          })
          if (res.ok) {
            const data = await res.json()
            if (data.price) {
              const price = parseFloat(String(data.price))
              setCurrentPrice(price)
              const entry = signal.entry || signal.entry_price
              if (entry && entry > 0) {
                setPriceChange(((price - entry) / entry) * 100)
              }
            }
          }
        } catch (e) {
          console.error("[signals] Failed to fetch price:", e)
        }
      }

      fetchPrice()
      const interval = setInterval(fetchPrice, 30000)
      return () => clearInterval(interval)
    }, [signal.symbol, signal.symbols?.fmp_symbol, signal.entry, signal.entry_price])

    const entry = signal.entry || signal.entry_price || 0
    const stopLoss = signal.sl || signal.stop_loss || 0
    const direction = typeof signal.direction === "string" ? signal.direction.toLowerCase() : "long"
    const timestamp = signal.activated_at || signal.created_at
    const logoUrl = getSymbolLogo(signal.symbol, signal.symbols?.asset_class)
    const assetClass = signal.symbols?.asset_class || 'forex'
    const priceDecimals = assetClass === 'forex' ? 5 : 2
    const timeframeStyle = getTimeframeStyle(signal.timeframe)
    
    const tpLevels = [
      { label: "TP1", value: signal.tp1 ?? signal.target_price ?? null },
      { label: "TP2", value: signal.tp2 ?? null },
      { label: "TP3", value: signal.tp3 ?? null },
    ].filter((level): level is { label: string; value: number } => level.value !== null && level.value !== undefined)

    // Volatility from price change
    const volatility = priceChange !== null ? Math.min(100, Math.abs(priceChange) * 20) : 0
    const volatilityColor = volatility > 70 ? 'rose' : volatility > 40 ? 'yellow' : 'emerald'

    return (
      <Card className={`p-4 border-zinc-800 hover:border-zinc-700 transition-all duration-300 relative overflow-hidden group ${
        direction === "long"
          ? "bg-gradient-to-br from-emerald-950/50 via-zinc-950 to-emerald-950/30"
          : "bg-gradient-to-br from-rose-950/50 via-zinc-950 to-rose-950/30"
      }`}>
        {/* Timeframe accent strip */}
        <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${timeframeStyle.strip} opacity-80`} />
        
        {/* Volatility indicator */}
        <div className="absolute top-0 right-0 w-1.5 h-full z-0">
          <div 
            className={`w-full h-full bg-gradient-to-b ${
              volatilityColor === 'rose' ? 'from-rose-500/80 via-rose-500/60 to-rose-500/40'
              : volatilityColor === 'yellow' ? 'from-yellow-500/80 via-yellow-500/60 to-yellow-500/40'
              : 'from-emerald-500/80 via-emerald-500/60 to-emerald-500/40'
            }`}
            style={{ height: `${Math.max(10, volatility)}%` }}
          />
        </div>

        {/* Lock overlay */}
        {!symbolUnlocked && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-20 rounded-lg flex flex-col items-center justify-center p-4">
            <div className="text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-2 border-amber-500/30 flex items-center justify-center">
                <Lock className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-1">Premium Signal</h4>
                <p className="text-xs text-zinc-400 mb-2">
                  {requiredPlan === 'starter' ? 'Starter' : requiredPlan === 'pro' ? 'Pro' : 'Elite'} plan required
                </p>
                <Link href="/?tab=account">
                  <Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold px-4 py-2 h-8">
                    <Crown className="w-3 h-3 mr-1.5" />
                    Upgrade
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start justify-between mb-3 relative z-10">
          <div className="flex items-center gap-2.5 flex-1">
            {/* Logo */}
            {logoUrl && !logoError ? (
              <div className="w-10 h-10 rounded-lg bg-zinc-900/50 border border-zinc-800 flex items-center justify-center overflow-hidden p-1">
                <img 
                  src={logoUrl} 
                  alt={signal.symbol}
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : (
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                direction === "long" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-rose-500/10 border-rose-500/30"
              }`}>
                <span className="text-xs font-bold text-zinc-300">{signal.symbol.substring(0, 2)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold truncate">{signal.symbol}</h3>
                {/* Direction arrow - prominent */}
                <div className={`flex-shrink-0 ${direction === "long" ? "text-emerald-400" : "text-rose-400"}`}>
                  {direction === "long" ? (
                    <ArrowUpRight className="w-5 h-5" />
                  ) : (
                    <ArrowDownRight className="w-5 h-5" />
                  )}
                </div>
              </div>
              {signal.symbols?.name && (
                <p className="text-[10px] text-zinc-500 truncate">{signal.symbols.name}</p>
              )}
            </div>
          </div>
          <div className="text-right ml-2">
            {currentPrice !== null && (
              <>
                <p className="text-sm font-bold">${formatNumber(currentPrice, 2)}</p>
                {priceChange !== null && (
                  <p className={`text-xs font-semibold ${priceChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {priceChange >= 0 ? "+" : ""}{formatNumber(priceChange, 2)}%
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3 relative z-10">
          {signal.timeframe && (
            <Badge variant="outline" className={`h-6 px-2 text-[10px] backdrop-blur-sm ${timeframeStyle.badge}`}>
              {signal.timeframe.toUpperCase()}
            </Badge>
          )}
          <Badge variant="outline" className={`h-6 px-2 text-[10px] ${
            direction === "long"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500/30 bg-rose-500/10 text-rose-400"
          }`}>
            {direction === "long" ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {direction.toUpperCase()}
          </Badge>
          {(signal as any).quality_tier && (
            <Badge variant="outline" className="h-6 px-2 text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-400">
              TIER {(signal as any).quality_tier}
            </Badge>
          )}
          {signal.score !== null && signal.score !== undefined && (
            <Badge variant="outline" className={`h-6 px-2 text-[10px] ${
              signal.score >= 70 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 text-zinc-400"
            }`}>
              Score {Math.round(signal.score)}
            </Badge>
          )}
        </div>

        {/* Explanation */}
        {((signal as any).explanation || signal.reason_summary) && (
          <p className="text-xs text-zinc-400 mb-3 line-clamp-2 relative z-10">
            {(signal as any).explanation || signal.reason_summary}
          </p>
        )}

        {/* Entry/SL/TP grid */}
        <div className="grid grid-cols-3 gap-2 mb-3 relative z-10">
          <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 p-2 rounded-lg">
            <p className="text-[9px] text-zinc-500 mb-0.5">Entry</p>
            <p className="text-sm font-bold">{formatNumber(entry, priceDecimals)}</p>
          </div>
          <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 p-2 rounded-lg">
            <p className="text-[9px] text-zinc-500 mb-0.5">Stop Loss</p>
            <p className="text-sm font-bold text-rose-400">{formatNumber(stopLoss, priceDecimals)}</p>
          </div>
          <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 p-2 rounded-lg">
            <p className="text-[9px] text-zinc-500 mb-0.5">{tpLevels.length > 1 ? "Targets" : "Target"}</p>
            {tpLevels.length > 0 ? (
              <div className="space-y-0.5">
                {tpLevels.slice(0, 2).map((level) => (
                  <div key={level.label} className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-400">{level.label}</span>
                    <span className="font-semibold text-emerald-400">{formatNumber(level.value, priceDecimals)}</span>
                  </div>
                ))}
                {tpLevels.length > 2 && (
                  <p className="text-[9px] text-zinc-500">+{tpLevels.length - 2} more</p>
                )}
              </div>
            ) : (
              <p className="text-sm font-bold text-emerald-400">TBD</p>
            )}
          </div>
        </div>

        {/* Timestamp */}
        {timestamp && (
          <div className="flex items-center gap-1 text-[10px] text-zinc-600 relative z-10">
            <Clock className="w-3 h-3" />
            <span>Published {formatRelativeTime(timestamp)}</span>
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-md mx-auto p-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">All Signals</h1>
            <p className="text-xs text-zinc-500">{signals.length} signals found</p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-6">
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
              className={`h-8 text-xs ${filter === "all" ? "bg-emerald-500 text-black" : "border-zinc-800 text-zinc-300"}`}
            >
              All
            </Button>
            <Button
              variant={filter === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("active")}
              className={`h-8 text-xs ${filter === "active" ? "bg-emerald-500 text-black" : "border-zinc-800 text-zinc-300"}`}
            >
              Active
            </Button>
            <Button
              variant={filter === "history" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("history")}
              className={`h-8 text-xs ${filter === "history" ? "bg-emerald-500 text-black" : "border-zinc-800 text-zinc-300"}`}
            >
              History
            </Button>
          </div>

          <div className="flex gap-2">
            <select
              value={selectedTimeframe || ""}
              onChange={(e) => setSelectedTimeframe(e.target.value || null)}
              className="h-8 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-md text-white flex-1"
            >
              <option value="">All Timeframes</option>
              <option value="5min">5m</option>
              <option value="15min">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1day">1D</option>
            </select>

            {symbols.length > 0 && (
              <select
                value={selectedSymbol || ""}
                onChange={(e) => setSelectedSymbol(e.target.value || null)}
                className="h-8 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-md text-white flex-1"
              >
                <option value="">All Symbols</option>
                {symbols.map((symbol) => (
                  <option key={symbol.fmp_symbol} value={symbol.fmp_symbol}>
                    {symbol.display_symbol || symbol.fmp_symbol}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Signals List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-4 bg-zinc-950 border-zinc-800 animate-pulse">
                <div className="h-24 bg-zinc-900 rounded" />
              </Card>
            ))}
          </div>
        ) : signals.length === 0 ? (
          <Card className="p-8 bg-zinc-950 border-zinc-800 text-center">
            <p className="text-zinc-500">No signals found</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black border-t border-zinc-800 z-50 shadow-2xl">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-around">
            <Link href="/" className="flex flex-col items-center gap-1 transition-colors text-zinc-500 hover:text-emerald-400">
              <Home className="w-5 h-5" />
              <span className="text-[10px] font-medium">Home</span>
            </Link>
            <Link href="/symbols" className="flex flex-col items-center gap-1 transition-colors text-zinc-500 hover:text-emerald-400">
              <Coins className="w-5 h-5" />
              <span className="text-[10px] font-medium">Symbols</span>
            </Link>
            <Link href="/?tab=ai" className="flex flex-col items-center -mt-8">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-1 bg-zinc-900 border-2 border-zinc-800">
                <Sparkles className="w-6 h-6 text-zinc-500" />
              </div>
              <span className="text-[10px] font-medium text-zinc-500">AI</span>
            </Link>
            <Link href="/?tab=journal" className="flex flex-col items-center gap-1 transition-colors text-zinc-500 hover:text-emerald-400">
              <BookOpen className="w-5 h-5" />
              <span className="text-[10px] font-medium">Journal</span>
            </Link>
            <Link href="/?tab=account" className="flex flex-col items-center gap-1 transition-colors text-zinc-500 hover:text-emerald-400">
              <UserIcon className="w-5 h-5" />
              <span className="text-[10px] font-medium">Account</span>
            </Link>
          </div>
        </div>
      </nav>
    </div>
  )
}
