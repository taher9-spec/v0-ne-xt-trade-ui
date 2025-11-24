"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Coins, DollarSign, BarChart3, Building2, ArrowLeft, Sparkles, Home, BookOpen, Bot, UserIcon, Star } from "lucide-react"
import Link from "next/link"
import { getSymbolLogo } from "@/lib/utils/symbolLogos"
import { isSymbolUnlocked, getRequiredPlanForSymbol } from "@/lib/utils/planSymbols"
import { Lock, Crown } from "lucide-react"
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
  priceChangePercent: number | null
  priceChangeDollar: number | null
  lastPriceUpdate: string | null
  activeSignal: Signal | null
  signalCount: number
  directionStats: {
    long: number
    short: number
  }
  volatility?: number
  volume?: number
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

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return "—"
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export default function SymbolsPage() {
  const router = useRouter()
  const [symbols, setSymbols] = useState<Symbol[]>([])
  const [symbolsWithData, setSymbolsWithData] = useState<SymbolWithPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAssetClass, setSelectedAssetClass] = useState<string>("all")
  const [user, setUser] = useState<{ plan_code: string | null } | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  // Fetch user plan and favorites
  useEffect(() => {
    const fetchUserAndFavorites = async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" })
        if (res.ok) {
          const json = await res.json()
          setUser(json.user || null)
          
          // If user is logged in, fetch favorites
          if (json.user) {
            const favRes = await fetch("/api/favorites", { cache: "no-store" })
            if (favRes.ok) {
              const favJson = await favRes.json()
              const favIds = new Set<string>(favJson.favorites?.map((f: any) => f.symbol_id) || [])
              setFavorites(favIds)
            }
          }
        }
      } catch (e) {
        // Silent fail - user might not be logged in
      }
    }
    fetchUserAndFavorites()
  }, [])

  // Toggle favorite
  const toggleFavorite = async (symbolId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user) return // Must be logged in
    
    const isFavorite = favorites.has(symbolId)
    
    // Optimistic update
    setFavorites(prev => {
      const next = new Set(prev)
      if (isFavorite) {
        next.delete(symbolId)
      } else {
        next.add(symbolId)
      }
      return next
    })
    
    try {
      if (isFavorite) {
        await fetch(`/api/favorites?symbolId=${symbolId}`, { method: "DELETE" })
      } else {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbolId })
        })
      }
    } catch (e) {
      // Revert on error
      setFavorites(prev => {
        const next = new Set(prev)
        if (isFavorite) {
          next.add(symbolId)
        } else {
          next.delete(symbolId)
        }
        return next
      })
    }
  }

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

        // Fetch active signals grouped by symbol_id and count them
        const { data: signalsData } = await supabase
          .from("signals")
          .select("*, symbol_id, symbols(fmp_symbol, display_symbol)")
          .eq("status", "active")
          .order("activated_at", { ascending: false })

        // Create a map of symbol_id -> latest signal and count
        const signalMap = new Map<string, Signal>()
        const signalCountMap = new Map<string, number>()
        const directionMap = new Map<string, { long: number; short: number }>()
        if (signalsData) {
          signalsData.forEach((signal: any) => {
            if (signal.symbol_id) {
              // Count signals per symbol
              signalCountMap.set(signal.symbol_id, (signalCountMap.get(signal.symbol_id) || 0) + 1)
              const normalizedDirection = (signal.direction || "").toString().toLowerCase()
              const summary = directionMap.get(signal.symbol_id) || { long: 0, short: 0 }
              if (normalizedDirection === "long") summary.long += 1
              if (normalizedDirection === "short") summary.short += 1
              directionMap.set(signal.symbol_id, summary)
              // Store latest signal
              if (!signalMap.has(signal.symbol_id)) {
                signalMap.set(signal.symbol_id, signal as Signal)
              }
            }
          })
        }

        // Fetch prices from live_prices table (much faster than individual API calls)
        const fmpSymbols = symbols.map(s => s.fmp_symbol)
        const { data: livePricesData, error: pricesError } = await supabase
          .from("live_prices")
          .select("fmp_symbol, symbol, price, change, change_percent, volume, updated_at")
          .in("fmp_symbol", fmpSymbols)

        if (pricesError) {
          console.error("[symbols] Error fetching live prices:", pricesError)
        }

        // Create a map of fmp_symbol -> price data
        const priceMap = new Map<string, { 
          price: number | null; 
          changePercent: number | null; 
          changeDollar: number | null; 
          timestamp: string | null;
          volume: number | null;
        }>()
        
        if (livePricesData) {
          livePricesData.forEach((lp: any) => {
            priceMap.set(lp.fmp_symbol, {
              price: lp.price ? parseFloat(String(lp.price)) : null,
              changePercent: lp.change_percent ? parseFloat(String(lp.change_percent)) : null,
              changeDollar: lp.change ? parseFloat(String(lp.change)) : null,
              timestamp: lp.updated_at,
              volume: lp.volume ? parseInt(String(lp.volume)) : null,
            })
          })
        }

        // Combine symbols with prices and signals
        const symbolsWithData: SymbolWithPrice[] = symbols.map((symbol) => {
          const priceData = priceMap.get(symbol.fmp_symbol) || { 
            price: null, 
            changePercent: null, 
            changeDollar: null, 
            timestamp: null,
            volume: null 
          }
          const activeSignal = signalMap.get(symbol.id) || null
          const signalCount = signalCountMap.get(symbol.id) || 0

          return {
            ...symbol,
            currentPrice: priceData.price,
            priceChangePercent: priceData.changePercent,
            priceChangeDollar: priceData.changeDollar,
            lastPriceUpdate: priceData.timestamp,
            activeSignal,
            signalCount,
            directionStats: directionMap.get(symbol.id) || { long: 0, short: 0 },
            // Calculate volatility from price change (0-100 scale)
            volatility: priceData.changePercent !== null ? Math.min(100, Math.abs(priceData.changePercent) * 20) : 0,
            volume: priceData.volume,
          }
        })

        setSymbolsWithData(symbolsWithData)

        // Refresh prices every 10 seconds from live_prices table
        const interval = setInterval(async () => {
          try {
            const fmpSymbols = symbols.map(s => s.fmp_symbol)
            const { data: livePricesData } = await supabase
              .from("live_prices")
              .select("fmp_symbol, symbol, price, change, change_percent, volume, updated_at")
              .in("fmp_symbol", fmpSymbols)

            if (livePricesData) {
              const newPriceMap = new Map<string, any>()
              livePricesData.forEach((lp: any) => {
                newPriceMap.set(lp.fmp_symbol, {
                  price: lp.price ? parseFloat(String(lp.price)) : null,
                  changePercent: lp.change_percent ? parseFloat(String(lp.change_percent)) : null,
                  changeDollar: lp.change ? parseFloat(String(lp.change)) : null,
                  timestamp: lp.updated_at,
                  volume: lp.volume ? parseInt(String(lp.volume)) : null,
                })
              })

              setSymbolsWithData((prev) =>
                prev.map((s) => {
                  const priceData = newPriceMap.get(s.fmp_symbol)
                  if (priceData) {
                    return {
                      ...s,
                      currentPrice: priceData.price,
                      priceChangePercent: priceData.changePercent,
                      priceChangeDollar: priceData.changeDollar,
                      lastPriceUpdate: priceData.timestamp,
                      volatility: priceData.changePercent !== null 
                        ? Math.min(100, Math.abs(priceData.changePercent) * 20) 
                        : s.volatility,
                      volume: priceData.volume,
                    }
                  }
                  return s
                })
              )
            }
          } catch (e) {
            // Silent fail for price updates
          }
        }, 10000)

        return () => clearInterval(interval)
      } catch (e: any) {
        console.error("[symbols] Failed to fetch prices/signals:", e)
      }
    }

    fetchPricesAndSignals()
  }, [symbols])

  // Filter and sort symbols: favorites first, then unlocked, then locked
  const filteredSymbols = symbolsWithData
    .filter((s) => {
      // Filter by favorites if enabled
      if (showFavoritesOnly && !favorites.has(s.id)) {
        return false
      }
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
    .sort((a, b) => {
      // Favorites first
      const aFav = favorites.has(a.id)
      const bFav = favorites.has(b.id)
      if (aFav !== bFav) return aFav ? -1 : 1
      
      // Then unlocked
      const planCode = user?.plan_code || null
      const aUnlocked = isSymbolUnlocked(a.display_symbol || a.fmp_symbol, planCode)
      const bUnlocked = isSymbolUnlocked(b.display_symbol || b.fmp_symbol, planCode)
      if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1
      
      return 0
    })

  const assetClasses = Array.from(new Set(symbols.map((s) => s.asset_class)))

  const handleSymbolClick = (symbol: SymbolWithPrice) => {
    // Navigate to signals page filtered by this symbol
    router.push(`/signals?symbol=${encodeURIComponent(symbol.display_symbol)}&status=active`)
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
            {/* Favorites filter - only show if user is logged in */}
            {user && (
              <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                  showFavoritesOnly
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-transparent"
                }`}
              >
                <Star className={`w-4 h-4 ${showFavoritesOnly ? "fill-amber-400" : ""}`} />
                <span className="text-xs">{favorites.size}</span>
              </button>
            )}
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

              const planCode = user?.plan_code || null
              const symbolUnlocked = isSymbolUnlocked(symbol.display_symbol || symbol.fmp_symbol, planCode)
              const requiredPlan = getRequiredPlanForSymbol(symbol.display_symbol || symbol.fmp_symbol)
              const logoUrl = getSymbolLogo(symbol.display_symbol || symbol.fmp_symbol, symbol.asset_class)

              return (
                <SymbolCard
                  key={symbol.id}
                  symbol={symbol}
                  Icon={Icon}
                  colorClass={colorClass}
                  logoUrl={logoUrl}
                  symbolUnlocked={symbolUnlocked}
                  requiredPlan={requiredPlan}
                  onSymbolClick={handleSymbolClick}
                  isFavorite={favorites.has(symbol.id)}
                  onToggleFavorite={toggleFavorite}
                  isLoggedIn={!!user}
                />
              )
            })}
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

// Symbol Card Component
function SymbolCard({ 
  symbol, 
  Icon, 
  colorClass, 
  logoUrl, 
  symbolUnlocked, 
  requiredPlan,
  onSymbolClick,
  isFavorite,
  onToggleFavorite,
  isLoggedIn
}: { 
  symbol: SymbolWithPrice
  Icon: any
  colorClass: string
  logoUrl: string
  symbolUnlocked: boolean
  requiredPlan: string
  onSymbolClick: (symbol: SymbolWithPrice) => void
  isFavorite: boolean
  onToggleFavorite: (symbolId: string, e: React.MouseEvent) => void
  isLoggedIn: boolean
}) {
  const [logoError, setLogoError] = useState(false)

  // Determine sentiment from price change
  const sentiment = symbol.priceChangePercent !== null 
    ? (symbol.priceChangePercent > 0 ? 'bullish' : symbol.priceChangePercent < 0 ? 'bearish' : 'neutral')
    : 'neutral'
  
  // Volatility indicator based on actual price change percentage (0-100 scale)
  // Scale: 0% change = 0, 5%+ change = 100
  const actualVolatility = symbol.priceChangePercent !== null 
    ? Math.min(100, Math.abs(symbol.priceChangePercent) * 20) 
    : 0
  const volatilityLevel = Math.max(5, actualVolatility) // Minimum 5% height for visibility
  const volatilityColor = actualVolatility > 60 ? 'rose' : actualVolatility > 30 ? 'yellow' : 'emerald'

  return (
    <Card
      onClick={() => onSymbolClick(symbol)}
      className={`p-4 bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer active:scale-[0.98] relative overflow-hidden group ${
        !symbolUnlocked ? "opacity-75" : ""
      }`}
    >
      {/* Sentiment-based background gradient */}
      <div className={`absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity ${
        sentiment === 'bullish'
          ? "bg-gradient-to-br from-emerald-500/20 via-emerald-400/10 to-transparent"
          : sentiment === 'bearish'
          ? "bg-gradient-to-br from-rose-500/20 via-rose-400/10 to-transparent"
          : "bg-gradient-to-br from-zinc-500/10 to-transparent"
      }`} />
      
      {/* Volatility indicator - corner design from top to bottom */}
      <div className="absolute top-0 right-0 w-1 h-full z-0">
        <div 
          className={`w-full h-full bg-gradient-to-b ${
            volatilityColor === 'rose' 
              ? 'from-rose-500/60 via-rose-500/40 to-rose-500/20'
              : volatilityColor === 'yellow'
              ? 'from-yellow-500/60 via-yellow-500/40 to-yellow-500/20'
              : 'from-emerald-500/60 via-emerald-500/40 to-emerald-500/20'
          }`}
          style={{ height: `${volatilityLevel}%` }}
        />
      </div>
      
      {/* Favorite button - subtle star in top left */}
      {isLoggedIn && (
        <button
          onClick={(e) => onToggleFavorite(symbol.id, e)}
          className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
            isFavorite 
              ? "text-amber-400" 
              : "text-zinc-600 hover:text-zinc-400"
          }`}
        >
          <Star className={`w-4 h-4 transition-all ${isFavorite ? "fill-amber-400" : ""}`} />
        </button>
      )}
      
      {/* Lock overlay for locked symbols */}
      {!symbolUnlocked && (
        <div className="absolute top-2 right-2 z-10">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center backdrop-blur-sm">
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
        </div>
      )}
      
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2.5 mb-1">
            {/* Symbol logo */}
            {logoUrl && !logoError ? (
              <div className="w-10 h-10 rounded-lg bg-zinc-900/50 border border-zinc-800 flex items-center justify-center overflow-hidden p-1">
                <img 
                  src={logoUrl} 
                  alt={symbol.display_symbol}
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : (
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                symbol.asset_class === 'crypto'
                  ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                  : symbol.asset_class === 'forex'
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                  : symbol.asset_class === 'commodity'
                  ? "bg-yellow-500/10 border-yellow-500/30 text-amber-300"
                  : "bg-zinc-800/50 border-zinc-700 text-zinc-300"
              }`}>
                <Icon className="w-4 h-4" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold">{symbol.display_symbol}</h3>
              {!symbolUnlocked && (
                <p className="text-[10px] text-amber-400">
                  {requiredPlan === 'starter' ? 'Starter' : requiredPlan === 'pro' ? 'Pro' : 'Elite'} plan
                </p>
              )}
            </div>
            {/* Category as integrated design element */}
            <div className={`h-5 px-2 rounded-md text-[10px] font-medium flex items-center gap-1 ${colorClass} backdrop-blur-sm`}>
              <Icon className="w-3 h-3" />
              <span>{
                symbol.asset_class === 'commodity' && (symbol.display_symbol.includes('XAU') || symbol.display_symbol.includes('XAG'))
                  ? 'Metal'
                  : symbol.asset_class
              }</span>
            </div>
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
              {symbol.priceChangePercent !== null && (
                <div>
                  <p
                    className={`text-sm font-semibold flex items-center gap-2 ${
                      symbol.priceChangePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {symbol.priceChangePercent >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    <span>
                      {symbol.priceChangeDollar !== null
                        ? `${symbol.priceChangePercent >= 0 ? "+" : ""}${formatNumber(symbol.priceChangeDollar, 2)}`
                        : ""}
                    </span>
                    <span>
                      ({symbol.priceChangePercent >= 0 ? "+" : ""}
                      {formatNumber(symbol.priceChangePercent, 2)}%)
                    </span>
                  </p>
                  {symbol.lastPriceUpdate && (
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Updated {formatRelativeTime(symbol.lastPriceUpdate)}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-600">Loading price...</p>
          )}
        </div>

        {/* Signal Count - Show count and navigate to symbol signals */}
        <div className="text-right">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSymbolClick(symbol)
            }}
            className="relative inline-block group"
          >
            <div className={`absolute inset-0 rounded-lg blur-sm transition-colors ${symbol.signalCount > 0 ? "bg-emerald-500/20 group-hover:bg-emerald-500/30 animate-pulse" : "bg-zinc-800"}`} />
            <div className={`h-12 px-3 rounded-lg border backdrop-blur-sm relative z-10 flex flex-col justify-center gap-1 text-[10px] font-medium min-w-[90px] ${
              symbol.signalCount > 0
                ? "bg-gradient-to-r from-emerald-500/15 to-emerald-600/15 border-emerald-500/40 text-emerald-100"
                : "bg-zinc-900 border-zinc-800 text-zinc-400"
            }`}>
              <div className="flex items-center justify-between text-[11px]">
                <span>Signals</span>
                <Sparkles className="w-3 h-3" />
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className={`flex items-center gap-1 ${symbol.signalCount > 0 ? "text-emerald-300" : "text-zinc-500"}`}>
                  <TrendingUp className="w-3 h-3" />
                  {symbol.directionStats.long}
                </span>
                <span className={`flex items-center gap-1 ${symbol.signalCount > 0 ? "text-rose-300" : "text-zinc-500"}`}>
                  <TrendingDown className="w-3 h-3" />
                  {symbol.directionStats.short}
                </span>
              </div>
              <div className="text-[9px] text-right">
                Total {symbol.signalCount}
              </div>
            </div>
          </button>
        </div>
      </div>
    </Card>
  )
}
