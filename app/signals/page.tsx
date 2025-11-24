"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, ArrowLeft } from "lucide-react"
import type { Signal } from "@/lib/types"
import { formatNumber } from "@/types/trades"

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "active" | "history">("all")
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)

  useEffect(() => {
    const fetchSignals = async () => {
      setLoading(true)
      try {
        // Build URL with status filter
        const statusParam = filter === "all" ? "all" : filter === "active" ? "active" : "history"
        const url = `/api/signals/all?status=${statusParam}`
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
  }, [filter]) // Re-fetch when filter changes

  // Get unique symbols for filter
  const uniqueSymbols = [...new Set(signals.map((s) => s.symbol))].sort()

  // Filter signals
  let filteredSignals = signals
  if (filter === "active") {
    filteredSignals = signals.filter((s) => s.status === "active" || s.status === "pending")
  } else if (filter === "history") {
    filteredSignals = signals.filter((s) => s.status !== "active" && s.status !== "pending")
  }

  if (selectedSymbol) {
    filteredSignals = filteredSignals.filter((s) => s.symbol === selectedSymbol)
  }

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
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

          {uniqueSymbols.length > 0 && (
            <select
              value={selectedSymbol || ""}
              onChange={(e) => setSelectedSymbol(e.target.value || null)}
              className="h-8 px-3 text-xs bg-zinc-950 border border-zinc-800 rounded-md text-white"
            >
              <option value="">All Symbols</option>
              {uniqueSymbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
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
              <Card key={signal.id} className="p-4 bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-bold">{signal.symbol}</h3>
                      <Badge
                        variant="outline"
                        className={`h-5 text-[10px] ${
                          signal.direction === "long"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {signal.direction === "long" ? (
                          <TrendingUp className="w-3 h-3 mr-1" />
                        ) : (
                          <TrendingDown className="w-3 h-3 mr-1" />
                        )}
                        {signal.direction.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="h-5 text-[10px] border-zinc-700 text-zinc-400">
                        {signal.type}
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
                          {signal.status.replace("_", " ").toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    {signal.reason_summary && (
                      <p className="text-xs text-zinc-500 mb-2">{signal.reason_summary}</p>
                    )}
                    <p className="text-xs text-zinc-400">{formatRelativeTime(signal.created_at)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div className="bg-zinc-900 p-2 rounded-lg">
                    <p className="text-[10px] text-zinc-500 mb-0.5">Entry</p>
                    <p className="text-sm font-bold">
                      {formatNumber(signal.entry || signal.entry_price)}
                    </p>
                  </div>
                  <div className="bg-zinc-900 p-2 rounded-lg">
                    <p className="text-[10px] text-zinc-500 mb-0.5">Stop Loss</p>
                    <p className="text-sm font-bold text-rose-400">{formatNumber(signal.sl)}</p>
                  </div>
                  <div className="bg-zinc-900 p-2 rounded-lg">
                    <p className="text-[10px] text-zinc-500 mb-0.5">Target</p>
                    <p className="text-sm font-bold text-emerald-400">
                      {signal.tp1 !== null && signal.tp1 !== undefined ? formatNumber(signal.tp1) : "TBD"}
                    </p>
                  </div>
                </div>

                {signal.tp2 && (
                  <div className="mt-2 text-xs text-zinc-500">
                    TP2: {formatNumber(signal.tp2)}
                    {signal.tp3 && ` • TP3: ${formatNumber(signal.tp3)}`}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

