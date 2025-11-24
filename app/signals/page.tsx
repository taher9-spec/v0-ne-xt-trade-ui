"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, ArrowLeft } from "lucide-react"
import type { Signal } from "@/lib/types"
import { formatNumber, parseNumber } from "@/types/trades"

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [symbols, setSymbols] = useState<Array<{ fmp_symbol: string; display_symbol: string }>>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "active" | "history">("all")
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState<string | null>(null)

  // Read URL parameters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const symbolParam = urlParams.get('symbol')
      const statusParam = urlParams.get('status')
      
      if (symbolParam) {
        setSelectedSymbol(symbolParam)
      }
      if (statusParam === 'active') {
        setFilter('active')
      }
    }
  }, [])

  useEffect(() => {
    const fetchSignals = async () => {
      setLoading(true)
      try {
        // Build URL with status filter, symbol filter, and timeframe filter
        const statusParam = filter === "all" ? "all" : filter === "active" ? "active" : "history"
        let url = `/api/signals/all?status=${statusParam}`
        if (selectedSymbol) {
          url += `&symbol=${encodeURIComponent(selectedSymbol)}`
        }
        if (selectedTimeframe) {
          url += `&timeframe=${encodeURIComponent(selectedTimeframe)}`
        }
        const res = await fetch(url, { cache: "no-store" })
        if (!res.ok) {
          console.error("[v0] Failed to fetch signals:", res.status)
          setSignals([])
          return
        }
        const json = await res.json()
        console.log("[v0] Fetched signals:", json.signals?.length || 0)
        setSignals(json.signals || [])
      } catch (e: any) {
        console.error("[v0] Error fetching signals:", e)
        setSignals([])
      } finally {
        setLoading(false)
      }
    }
    fetchSignals()
  }, [filter, selectedSymbol, selectedTimeframe]) // Re-fetch when filter, symbol, or timeframe changes

  // Fetch symbols from database
  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const res = await fetch("/api/symbols", { cache: "no-store" })
        if (res.ok) {
          const json = await res.json()
          setSymbols(json.symbols || [])
        }
      } catch (e) {
        console.error("[v0] Error fetching symbols:", e)
      }
    }
    fetchSymbols()
  }, [])

  // Signals are already filtered by the API based on filter and selectedSymbol
  const filteredSignals = signals

  // Format relative time
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

  // SignalCard component with price tracking
  const SignalCard = ({ signal }: { signal: Signal }) => {
    const [currentPrice, setCurrentPrice] = useState<number | null>(null)
    const [priceChange, setPriceChange] = useState<number | null>(null)

    // Fetch current price for the signal
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

              // Calculate % change from entry
              const entry = signal.entry || signal.entry_price
              if (entry && entry > 0) {
                const change = ((price - entry) / entry) * 100
                setPriceChange(change)
              }
            }
          }
        } catch (e) {
          console.error("[v0] Failed to fetch current price:", e)
        }
      }

      fetchPrice()
      // Refresh price every 30 seconds
      const interval = setInterval(fetchPrice, 30000)
      return () => clearInterval(interval)
    }, [signal.symbol, signal.symbols?.fmp_symbol, signal.entry, signal.entry_price])

    const entry = signal.entry || signal.entry_price || 0
    const stopLoss = signal.sl || signal.stop_loss || 0
    const target = signal.tp1 || signal.target_price || null
    // Handle both "LONG"/"SHORT" and "long"/"short" from database
    const direction = typeof signal.direction === "string" 
      ? signal.direction.toLowerCase() 
      : "long"
    const timestamp = signal.activated_at || signal.created_at

    return (
      <Card className="p-4 bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-bold">{signal.symbol}</h3>
              <Badge
                variant="outline"
                className={`h-5 text-[10px] ${
                  direction === "long"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                }`}
              >
                {direction === "long" ? (
                  <TrendingUp className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-1" />
                )}
                {direction.toUpperCase()}
              </Badge>
              {signal.timeframe && (
                <Badge variant="outline" className="h-5 text-[10px] border-zinc-700 text-zinc-400">
                  {signal.timeframe}
                </Badge>
              )}
              {signal.status && (
                <Badge
                  variant="outline"
                  className={`h-5 text-[10px] ${
                    signal.status === "active" || signal.status === "pending"
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                      : signal.status === "hit_tp"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : signal.status === "stopped_out"
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                      : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  {signal.status === "active" ? "ACTIVE" : signal.status.replace("_", " ").toUpperCase()}
                </Badge>
              )}
            </div>
            {signal.reason_summary && (
              <p className="text-xs text-zinc-500 mb-1">{signal.reason_summary}</p>
            )}
            {timestamp && (
              <p className="text-[10px] text-zinc-600">
                Published {formatRelativeTime(timestamp)}
              </p>
            )}
          </div>
          <div className="text-right ml-3">
            {currentPrice !== null && (
              <>
                <p className="text-sm font-bold">${formatNumber(currentPrice, 2)}</p>
                {priceChange !== null && (
                  <p className={`text-xs font-semibold ${priceChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {priceChange >= 0 ? "+" : ""}
                    {formatNumber(priceChange, 2)}%
                  </p>
                )}
              </>
            )}
            {signal.signal_score !== null && signal.signal_score !== undefined && (
              <p className="text-[10px] text-zinc-500 mt-1">Score: {Math.round(signal.signal_score)}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="bg-zinc-900 p-2 rounded-lg">
            <p className="text-[10px] text-zinc-500 mb-0.5">Entry</p>
            <p className="text-sm font-bold">{formatNumber(entry, 2)}</p>
          </div>
          <div className="bg-zinc-900 p-2 rounded-lg">
            <p className="text-[10px] text-zinc-500 mb-0.5">Stop Loss</p>
            <p className="text-sm font-bold text-rose-400">{formatNumber(stopLoss, 2)}</p>
          </div>
          <div className="bg-zinc-900 p-2 rounded-lg">
            <p className="text-[10px] text-zinc-500 mb-0.5">Target</p>
            <p className="text-sm font-bold text-emerald-400">
              {target !== null && target !== undefined ? formatNumber(target, 2) : "TBD"}
            </p>
          </div>
        </div>

        {signal.tp2 && (
          <div className="mt-2 text-xs text-zinc-500">
            TP2: {formatNumber(signal.tp2, 2)}
            {signal.tp3 && ` • TP3: ${formatNumber(signal.tp3, 2)}`}
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-24">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">All Signals</h1>
              <p className="text-xs text-zinc-500">Trading signals history</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
              className="h-8 text-xs"
            >
              All
            </Button>
            <Button
              variant={filter === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("active")}
              className="h-8 text-xs"
            >
              Active
            </Button>
            <Button
              variant={filter === "history" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("history")}
              className="h-8 text-xs"
            >
              History
            </Button>
          </div>

          <select
            value={selectedTimeframe || ""}
            onChange={(e) => setSelectedTimeframe(e.target.value || null)}
            className="h-8 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-md text-white"
          >
            <option value="">All Timeframes</option>
            <option value="1min">1m</option>
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
              className="h-8 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-md text-white"
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

        {/* Signals List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="p-4 bg-zinc-950 border-zinc-800 animate-pulse">
                <div className="h-20 bg-zinc-900 rounded" />
              </Card>
            ))}
          </div>
        ) : filteredSignals.length === 0 ? (
          <Card className="p-8 bg-zinc-950 border-zinc-800 text-center">
            <p className="text-zinc-500">No signals found</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSignals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

