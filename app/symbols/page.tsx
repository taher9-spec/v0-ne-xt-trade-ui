"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Coins, DollarSign, BarChart3, Building2, ArrowLeft, Sparkles, Home, BookOpen, Bot, UserIcon } from "lucide-react"
import Link from "next/link"
import { createSupabaseClient } from "@/lib/supabase/client"
import type { Signal } from "@/lib/types"

type Symbol = {
  id: string
  fmp_symbol: string
  display_symbol: string
  name: string | null
  asset_class: "forex" | "crypto" | "stock" | "index" | "commodity"
  is_active: boolean
}

type SymbolWithPrice = Symbol & {
  currentPrice: number | null
  priceChange: number | null
  activeSignal: Signal | null
}

const assetClassIcons = {
  forex: DollarSign,
  crypto: Coins,
  stock: Building2,
  index: BarChart3,
  commodity: TrendingUp,
}

const assetClassColors = {
  forex: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  crypto: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  stock: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  index: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  commodity: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
}

function formatNumber(num: number | null, decimals: number = 2): string {
  if (num === null || num === undefined || isNaN(num)) return "—"
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

export default function SymbolsPage() {
  const router = useRouter()
  const [symbols, setSymbols] = useState<Symbol[]>([])
  const [symbolsWithData, setSymbolsWithData] = useState<SymbolWithPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAssetClass, setSelectedAssetClass] = useState<string>("all")

  // Fetch symbols
  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const supabase = createSupabaseClient()
        const { data, error } = await supabase
          .from("symbols")
          .select("*")
          .eq("is_active", true)
          .order("asset_class")
          .order("display_symbol")

        if (error) {
          console.error("[symbols] Error fetching symbols:", error)
          return
        }

        setSymbols(data || [])
      } catch (e: any) {
        console.error("[symbols] Failed to load symbols:", e)
      } finally {
        setLoading(false)
      }
    }

    fetchSymbols()
  }, [])

  // Fetch prices and signals for symbols
  useEffect(() => {
    if (symbols.length === 0) return

    const fetchPricesAndSignals = async () => {
      try {
        const supabase = createSupabaseClient()

        // Fetch active signals grouped by symbol_id
        const { data: signalsData } = await supabase
          .from("signals")
          .select("*, symbol_id, symbols(fmp_symbol, display_symbol)")
          .eq("status", "active")
          .order("activated_at", { ascending: false })

        // Create a map of symbol_id -> latest signal
        const signalMap = new Map<string, Signal>()
        if (signalsData) {
          signalsData.forEach((signal: any) => {
            if (signal.symbol_id && !signalMap.has(signal.symbol_id)) {
              signalMap.set(signal.symbol_id, signal as Signal)
            }
          })
        }

        // Fetch prices for all symbols in parallel
        const pricePromises = symbols.map(async (symbol) => {
          try {
            const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol.fmp_symbol)}`, {
              cache: "no-store",
              headers: { "Cache-Control": "no-cache" },
            })
            if (res.ok) {
              const data = await res.json()
              return {
                symbolId: symbol.id,
                price: data.price ? parseFloat(String(data.price)) : null,
                change: data.changesPercentage ? parseFloat(String(data.changesPercentage)) : null,
              }
            }
          } catch (e) {
            console.error(`[symbols] Failed to fetch price for ${symbol.fmp_symbol}:`, e)
          }
          return { symbolId: symbol.id, price: null, change: null }
        })

        const priceResults = await Promise.all(pricePromises)
        const priceMap = new Map(
          priceResults.map((r) => [r.symbolId, { price: r.price, change: r.change }])
        )

        // Combine symbols with prices and signals
        const symbolsWithData: SymbolWithPrice[] = symbols.map((symbol) => {
          const priceData = priceMap.get(symbol.id) || { price: null, change: null }
          const activeSignal = signalMap.get(symbol.id) || null

          return {
            ...symbol,
            currentPrice: priceData.price,
            priceChange: priceData.change,
            activeSignal,
          }
        })

        setSymbolsWithData(symbolsWithData)

        // Refresh prices every 30 seconds
        const interval = setInterval(() => {
          symbols.forEach(async (symbol) => {
            try {
              const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol.fmp_symbol)}`, {
                cache: "no-store",
                headers: { "Cache-Control": "no-cache" },
              })
              if (res.ok) {
                const data = await res.json()
                setSymbolsWithData((prev) =>
                  prev.map((s) =>
                    s.id === symbol.id
                      ? {
                          ...s,
                          currentPrice: data.price ? parseFloat(String(data.price)) : null,
                          priceChange: data.changesPercentage ? parseFloat(String(data.changesPercentage)) : null,
                        }
                      : s
                  )
                )
              }
            } catch (e) {
              // Silent fail for price updates
            }
          })
        }, 30000)

        return () => clearInterval(interval)
      } catch (e: any) {
        console.error("[symbols] Failed to fetch prices/signals:", e)
      }
    }

    fetchPricesAndSignals()
  }, [symbols])

  // Filter symbols
  const filteredSymbols = symbolsWithData.filter((s) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      if (
        !s.display_symbol.toLowerCase().includes(query) &&
        !s.fmp_symbol.toLowerCase().includes(query) &&
        !(s.name && s.name.toLowerCase().includes(query))
      ) {
        return false
      }
    }
    if (selectedAssetClass !== "all") {
      return s.asset_class === selectedAssetClass
    }
    return true
  })

  const assetClasses = Array.from(new Set(symbols.map((s) => s.asset_class)))

  const handleSymbolClick = (symbol: SymbolWithPrice) => {
    if (symbol.activeSignal) {
      // Navigate to home page and show signal details
      router.push(`/?signal=${symbol.activeSignal.id}`)
    } else {
      // Show symbol details or navigate to signals filtered by symbol
      router.push(`/signals?symbol=${symbol.display_symbol}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="max-w-md mx-auto p-4 pb-24">
          <div className="flex items-center gap-3 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold">Trading Symbols</h1>
          </div>
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="p-4 bg-zinc-950 border-zinc-800 animate-pulse">
                <div className="h-6 bg-zinc-800 rounded mb-2"></div>
                <div className="h-4 bg-zinc-800 rounded w-2/3"></div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-md mx-auto p-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Trading Symbols</h1>
            <p className="text-zinc-400 text-sm">{filteredSymbols.length} active instruments</p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <Input
            placeholder="Search symbols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-600"
          />
        </div>

        {/* Asset Class Filters */}
        <div className="mb-6">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <button
              onClick={() => setSelectedAssetClass("all")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                selectedAssetClass === "all"
                  ? "bg-emerald-500 text-black"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              All
            </button>
            {assetClasses.map((ac) => {
              const Icon = assetClassIcons[ac]
              return (
                <button
                  key={ac}
                  onClick={() => setSelectedAssetClass(ac)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                    selectedAssetClass === ac
                      ? "bg-emerald-500 text-black"
                      : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {ac.charAt(0).toUpperCase() + ac.slice(1)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Symbols List */}
        {filteredSymbols.length === 0 ? (
          <Card className="p-8 bg-zinc-950 border-zinc-800 text-center">
            <p className="text-zinc-400">No symbols found matching your filters.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSymbols.map((symbol) => {
              const Icon = assetClassIcons[symbol.asset_class]
              const colorClass = assetClassColors[symbol.asset_class]

              return (
                <Card
                  key={symbol.id}
                  onClick={() => handleSymbolClick(symbol)}
                  className="p-4 bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer active:scale-[0.98]"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold">{symbol.display_symbol}</h3>
                        <Badge variant="outline" className={`h-5 text-[10px] ${colorClass}`}>
                          <Icon className="w-3 h-3 mr-1" />
                          {symbol.asset_class}
                        </Badge>
                        {symbol.activeSignal && (
                          <Badge
                            variant="outline"
                            className="h-5 text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            Signal
                          </Badge>
                        )}
                      </div>
                      {symbol.name && (
                        <p className="text-xs text-zinc-400 mb-2">{symbol.name}</p>
                      )}
                    </div>
                  </div>

                  {/* Price and Change */}
                  <div className="flex items-center justify-between">
                    <div>
                      {symbol.currentPrice !== null ? (
                        <>
                          <p className="text-lg font-bold">
                            ${formatNumber(symbol.currentPrice, symbol.asset_class === "forex" ? 5 : 2)}
                          </p>
                          {symbol.priceChange !== null && (
                            <p
                              className={`text-sm font-semibold flex items-center gap-1 ${
                                symbol.priceChange >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {symbol.priceChange >= 0 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {symbol.priceChange >= 0 ? "+" : ""}
                              {formatNumber(symbol.priceChange, 2)}%
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-zinc-600">Loading price...</p>
                      )}
                    </div>

                    {/* Signal Preview */}
                    {symbol.activeSignal && (
                      <div className="text-right">
                        <p className="text-xs text-zinc-500 mb-1">Active Signal</p>
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className={`h-4 text-[9px] ${
                              symbol.activeSignal.direction === "long"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                            }`}
                          >
                            {symbol.activeSignal.direction.toUpperCase()}
                          </Badge>
                          {symbol.activeSignal.timeframe && (
                            <Badge variant="outline" className="h-4 text-[9px] border-zinc-700 text-zinc-400">
                              {symbol.activeSignal.timeframe}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-zinc-800 z-50">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-around">
            <Link href="/" className="flex flex-col items-center gap-1 transition-colors text-zinc-500 hover:text-emerald-400">
              <Home className="w-5 h-5" />
              <span className="text-[10px] font-medium">Home</span>
            </Link>
            <div className="flex flex-col items-center gap-1 transition-colors text-emerald-400">
              <Coins className="w-5 h-5" />
              <span className="text-[10px] font-medium">Symbols</span>
            </div>
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
