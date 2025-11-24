"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { TrendingUp, TrendingDown, Coins, DollarSign, BarChart3, Building2 } from "lucide-react"
import { createSupabaseClient } from "@/lib/supabase/client"

type Symbol = {
  id: string
  fmp_symbol: string
  display_symbol: string
  name: string | null
  asset_class: "forex" | "crypto" | "stock" | "index" | "commodity"
  is_active: boolean
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

export default function SymbolsPage() {
  const [symbols, setSymbols] = useState<Symbol[]>([])
  const [filteredSymbols, setFilteredSymbols] = useState<Symbol[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAssetClass, setSelectedAssetClass] = useState<string>("all")

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
        setFilteredSymbols(data || [])
      } catch (e: any) {
        console.error("[symbols] Failed to load symbols:", e)
      } finally {
        setLoading(false)
      }
    }

    fetchSymbols()
  }, [])

  useEffect(() => {
    let filtered = symbols

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.display_symbol.toLowerCase().includes(query) ||
          s.fmp_symbol.toLowerCase().includes(query) ||
          (s.name && s.name.toLowerCase().includes(query))
      )
    }

    // Filter by asset class
    if (selectedAssetClass !== "all") {
      filtered = filtered.filter((s) => s.asset_class === selectedAssetClass)
    }

    setFilteredSymbols(filtered)
  }, [searchQuery, selectedAssetClass, symbols])

  const assetClasses = Array.from(new Set(symbols.map((s) => s.asset_class)))

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Trading Symbols</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
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
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Trading Symbols</h1>
          <p className="text-zinc-400 text-sm">
            Browse all available trading instruments ({filteredSymbols.length} active)
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          <Input
            placeholder="Search symbols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-zinc-950 border-zinc-800 text-white"
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedAssetClass("all")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
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

        {/* Symbols Grid */}
        {filteredSymbols.length === 0 ? (
          <Card className="p-8 bg-zinc-950 border-zinc-800 text-center">
            <p className="text-zinc-400">No symbols found matching your filters.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSymbols.map((symbol) => {
              const Icon = assetClassIcons[symbol.asset_class]
              const colorClass = assetClassColors[symbol.asset_class]

              return (
                <Card
                  key={symbol.id}
                  className="p-4 bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold">{symbol.display_symbol}</h3>
                        <Badge variant="outline" className={`h-5 text-[10px] ${colorClass}`}>
                          <Icon className="w-3 h-3 mr-1" />
                          {symbol.asset_class}
                        </Badge>
                      </div>
                      {symbol.name && (
                        <p className="text-sm text-zinc-400 mb-1">{symbol.name}</p>
                      )}
                      <p className="text-xs text-zinc-600">FMP: {symbol.fmp_symbol}</p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

