"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TrendingUp, TrendingDown, Sparkles, Send, Home, BookOpen, Bot, UserIcon, Crown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { getRealTimeQuotes, getHistoricalData } from "./actions"
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts"
import { TelegramLoginButton } from "@/components/TelegramLoginButton"
import { LogOut, Check } from "lucide-react"

type Signal = {
  id: string
  symbol: string
  direction: "long" | "short"
  type: "scalp" | "intraday" | "swing"
  market: string
  entry: number
  sl: number
  tp1: number | null
  tp2: number | null
  confidence: number
  reason_summary: string | null
  created_at: string
}

type Trade = {
  id: string
  user_id: string
  signal_id: string | null
  symbol: string
  direction: string
  entry_price: number | null
  exit_price: number | null
  timeframe: string | null
  result_r: number | null
  pnl: number | null
  status: string
  opened_at: string
  closed_at: string | null
}

type Plan = {
  code: string
  name: string
  price_usd: number
  description: string
  features: any
  sort_order: number
}

type AuthUser = {
  username: string
  photo_url: string
  plan_code: string
  approx_balance: number
  risk_percent: number
}

export default function NextTradeUI() {
  const [activeTab, setActiveTab] = useState("home")
  const [signals, setSignals] = useState<Signal[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [tradeStats, setTradeStats] = useState({ total: 0, wins: 0, losses: 0, open: 0 })
  const [loadingSignals, setLoadingSignals] = useState(true)
  const [loadingTrades, setLoadingTrades] = useState(false)
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [quotes, setQuotes] = useState<any[]>([])
  const [chartData, setChartData] = useState<any[]>([])
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSD")

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const res = await fetch("/api/signals/today")
        const json = await res.json()
        console.log("[v0] Fetched signals:", json.signals)
        setSignals(json.signals ?? [])
      } catch (e) {
        console.error("[v0] Failed to load signals", e)
      } finally {
        setLoadingSignals(false)
      }
    }
    fetchSignals()
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      const data = await getRealTimeQuotes(["BTCUSD", "ETHUSD", "AAPL", "NVDA", "TSLA"])
      setQuotes(data)
    }
    fetchData()

    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchChart = async () => {
      const data = await getHistoricalData(selectedSymbol)
      setChartData(data)
    }
    fetchChart()
  }, [selectedSymbol])

  useEffect(() => {
    if (activeTab === "journal") {
      const fetchTrades = async () => {
        setLoadingTrades(true)
        try {
          // TODO: Replace with real user ID from auth
          const userId = "00000000-0000-0000-0000-000000000001"
          const res = await fetch(`/api/trades/list?userId=${userId}`)
          const json = await res.json()
          console.log("[v0] Fetched trades:", json)
          setTrades(json.trades ?? [])
          setTradeStats(json.stats ?? { total: 0, wins: 0, losses: 0, open: 0 })
        } catch (e) {
          console.error("[v0] Failed to load trades", e)
        } finally {
          setLoadingTrades(false)
        }
      }
      fetchTrades()
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === "account") {
      const fetchPlans = async () => {
        setLoadingPlans(true)
        try {
          const res = await fetch("/api/plans")
          const json = await res.json()
          console.log("[v0] Fetched plans:", json)
          setPlans(json.plans ?? [])
        } catch (e) {
          console.error("[v0] Failed to load plans", e)
        } finally {
          setLoadingPlans(false)
        }
      }
      fetchPlans()
    }
  }, [activeTab])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/me")
        const json = await res.json()
        console.log("[v0] Auth check:", json)
        setUser(json.user)
      } catch (err) {
        console.error("[v0] Auth check failed", err)
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [])

  const mainQuote = quotes.find((q) => q.symbol === selectedSymbol) || { price: 0, changesPercentage: 0 }

  const HomeSignals = () => (
    <div className="space-y-6 pb-20">
      <header className="flex justify-between items-center pt-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold">NeXT TRADE</h1>
            <p className="text-xs text-zinc-500">Pro Trader</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-400">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse" />
            Live
          </Badge>
        </div>
      </header>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-400">Market Overview</h2>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-500">
            View All
          </Button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {quotes.map((quote) => (
            <Card
              key={quote.symbol}
              className={`min-w-[140px] p-3 bg-zinc-950 border-zinc-800 cursor-pointer transition-colors ${
                selectedSymbol === quote.symbol ? "border-emerald-500/50" : ""
              }`}
              onClick={() => setSelectedSymbol(quote.symbol)}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-zinc-400">{quote.symbol}</p>
                <Badge
                  variant="outline"
                  className={`h-5 text-[10px] ${
                    quote.changesPercentage >= 0
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                  }`}
                >
                  {quote.changesPercentage >= 0 ? "+" : ""}
                  {quote.changesPercentage.toFixed(2)}%
                </Badge>
              </div>
              <p className="text-lg font-bold">${quote.price.toLocaleString()}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <Card className="p-4 bg-zinc-950 border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-zinc-500">Selected Asset</p>
              <p className="text-2xl font-bold">{selectedSymbol}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">Current Price</p>
              <p className="text-2xl font-bold">${mainQuote.price.toLocaleString()}</p>
              <Badge
                variant="outline"
                className={`h-5 text-[10px] mt-1 ${
                  mainQuote.changesPercentage >= 0
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                }`}
              >
                {mainQuote.changesPercentage >= 0 ? "+" : ""}
                {mainQuote.changesPercentage.toFixed(2)}%
              </Badge>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={mainQuote.changesPercentage >= 0 ? "#10b981" : "#f43f5e"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={mainQuote.changesPercentage >= 0 ? "#10b981" : "#f43f5e"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <YAxis domain={["auto", "auto"]} hide />
              <Area
                type="monotone"
                dataKey="close"
                stroke={mainQuote.changesPercentage >= 0 ? "#10b981" : "#f43f5e"}
                strokeWidth={2}
                fill="url(#priceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-400">Today's Signals</h2>
          <Badge variant="outline" className="border-zinc-700 text-zinc-400">
            {loadingSignals ? "..." : signals.length} active
          </Badge>
        </div>

        {loadingSignals ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 bg-zinc-950 border-zinc-800 animate-pulse">
                <div className="h-20 bg-zinc-900 rounded" />
              </Card>
            ))}
          </div>
        ) : signals.length === 0 ? (
          <Card className="p-6 bg-zinc-950 border-zinc-800 text-center">
            <p className="text-zinc-500">No signals available yet today</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </section>
    </div>
  )

  const SignalCard = ({ signal }: { signal: Signal }) => {
    const [taken, setTaken] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleTakeSignal = async () => {
      setLoading(true)
      try {
        // TODO: Replace with real user ID from auth
        const userId = "00000000-0000-0000-0000-000000000001"
        const res = await fetch("/api/trades/mark-taken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, signalId: signal.id, entryPrice: signal.entry }),
        })
        if (res.ok) {
          setTaken(true)
          console.log("[v0] Signal marked as taken:", signal.symbol)
        }
      } catch (e) {
        console.error("[v0] Failed to mark trade taken", e)
      } finally {
        setLoading(false)
      }
    }

    return (
      <Card className="p-4 bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
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
            </div>
            <p className="text-xs text-zinc-500">{signal.reason_summary || "AI-powered signal"}</p>
          </div>
          <div className="flex items-center gap-1">
            {Array.from({ length: signal.confidence }).map((_, i) => (
              <div key={i} className="w-1 h-1 bg-emerald-500 rounded-full" />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-zinc-900 p-2 rounded-lg">
            <p className="text-[10px] text-zinc-500 mb-0.5">Entry</p>
            <p className="text-sm font-bold">{signal.entry.toFixed(2)}</p>
          </div>
          <div className="bg-zinc-900 p-2 rounded-lg">
            <p className="text-[10px] text-zinc-500 mb-0.5">Stop Loss</p>
            <p className="text-sm font-bold text-rose-400">{signal.sl.toFixed(2)}</p>
          </div>
          <div className="bg-zinc-900 p-2 rounded-lg">
            <p className="text-[10px] text-zinc-500 mb-0.5">Target</p>
            <p className="text-sm font-bold text-emerald-400">{signal.tp1?.toFixed(2) || "TBD"}</p>
          </div>
        </div>

        <Button
          className={`w-full h-9 text-xs font-semibold ${
            taken ? "bg-zinc-800 text-zinc-400 cursor-not-allowed" : "bg-emerald-500 hover:bg-emerald-600 text-black"
          }`}
          disabled={taken || loading}
          onClick={handleTakeSignal}
        >
          {loading ? "Saving..." : taken ? "Signal Taken" : "Take Signal"}
        </Button>
      </Card>
    )
  }

  const MyJournal = () => (
    <div className="space-y-6 pb-20">
      <header className="flex justify-between items-center pt-2">
        <div>
          <h1 className="text-xl font-bold">My Trades</h1>
          <p className="text-xs text-zinc-500">Performance tracker</p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 bg-zinc-950 border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Total</p>
          <p className="text-2xl font-bold">{loadingTrades ? "..." : tradeStats.total}</p>
        </Card>
        <Card className="p-3 bg-zinc-950 border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Wins</p>
          <p className="text-2xl font-bold text-emerald-400">{loadingTrades ? "..." : tradeStats.wins}</p>
        </Card>
        <Card className="p-3 bg-zinc-950 border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Losses</p>
          <p className="text-2xl font-bold text-rose-400">{loadingTrades ? "..." : tradeStats.losses}</p>
        </Card>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-zinc-400 mb-4">Recent Trades</h2>
        {loadingTrades ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 bg-zinc-950 border-zinc-800 animate-pulse">
                <div className="h-16 bg-zinc-900 rounded" />
              </Card>
            ))}
          </div>
        ) : trades.length === 0 ? (
          <Card className="p-6 bg-zinc-950 border-zinc-800 text-center">
            <p className="text-zinc-500">No trades recorded yet. Start by taking signals!</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {trades.map((trade) => (
              <Card key={trade.id} className="p-4 bg-zinc-950 border-zinc-800">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-bold">{trade.symbol}</h3>
                      <Badge
                        variant="outline"
                        className={`h-5 text-[10px] ${
                          trade.direction === "long"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {trade.direction.toUpperCase()}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`h-5 text-[10px] ${
                          trade.status === "open"
                            ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                            : "border-zinc-700 text-zinc-400"
                        }`}
                      >
                        {trade.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Entry: {trade.entry_price?.toFixed(2) || "N/A"}
                      {trade.exit_price && ` • Exit: ${trade.exit_price.toFixed(2)}`}
                    </p>
                  </div>
                  {trade.result_r !== null && (
                    <div className={`text-right ${trade.result_r >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      <p className="text-lg font-bold">
                        {trade.result_r > 0 ? "+" : ""}
                        {trade.result_r.toFixed(2)}R
                      </p>
                      {trade.pnl && <p className="text-xs">${trade.pnl.toFixed(2)}</p>}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )

  const AICopilot = () => (
    <div className="space-y-6 pb-20">
      <header className="pt-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Copilot</h1>
            <p className="text-xs text-zinc-500">Your trading assistant</p>
          </div>
        </div>
      </header>

      <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Hello! I'm your AI trading assistant.</p>
            <p className="text-xs text-zinc-400">
              Ask me anything about market analysis, signal explanations, or trading strategies.
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <Card className="p-3 bg-zinc-950 border-zinc-800">
          <p className="text-sm">Why is BTC moving up today?</p>
        </Card>
        <Card className="p-3 bg-zinc-950 border-zinc-800">
          <p className="text-sm">Explain the Gold signal</p>
        </Card>
        <Card className="p-3 bg-zinc-950 border-zinc-800">
          <p className="text-sm">What's my win rate this month?</p>
        </Card>
      </div>

      <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-black via-black to-transparent">
        <div className="flex gap-2">
          <Input
            placeholder="Ask me anything..."
            className="flex-1 bg-zinc-950 border-zinc-800 focus-visible:ring-purple-500"
          />
          <Button size="icon" className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )

  const Account = () => {
    if (authLoading) {
      return (
        <div className="space-y-6 pb-20">
          <header className="pt-2">
            <h1 className="text-xl font-bold">Account</h1>
            <p className="text-xs text-zinc-500">Loading...</p>
          </header>
          <Card className="p-6 bg-zinc-950 border-zinc-800 animate-pulse">
            <div className="h-20 bg-zinc-900 rounded" />
          </Card>
        </div>
      )
    }

    if (!user) {
      return (
        <div className="space-y-6 pb-20">
          <header className="pt-2">
            <h1 className="text-xl font-bold">Account</h1>
            <p className="text-xs text-zinc-500">Sign in to continue</p>
          </header>

          <Card className="p-6 bg-zinc-950 border-zinc-800">
            <TelegramLoginButton />
          </Card>

          <section>
            <h2 className="text-sm font-semibold text-zinc-400 mb-4">Subscription Plans</h2>
            {loadingPlans ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Card key={i} className="p-4 bg-zinc-950 border-zinc-800 animate-pulse">
                    <div className="h-24 bg-zinc-900 rounded" />
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {plans.map((plan) => (
                  <Card key={plan.code} className="p-4 bg-zinc-950 border-zinc-800">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-bold">{plan.name}</h3>
                          {plan.code === "elite" && <Crown className="w-4 h-4 text-amber-500" />}
                        </div>
                        <p className="text-xs text-zinc-500">{plan.description}</p>
                      </div>
                      <p className="text-xl font-bold">
                        ${plan.price_usd}
                        <span className="text-xs text-zinc-500 font-normal">/mo</span>
                      </p>
                    </div>
                    <Button className="w-full h-9 mt-3 bg-zinc-800 hover:bg-zinc-700 text-white" disabled>
                      Sign in to subscribe
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )
    }

    return (
      <div className="space-y-6 pb-20">
        <header className="flex justify-between items-center pt-2">
          <div>
            <h1 className="text-xl font-bold">Account</h1>
            <p className="text-xs text-zinc-500">Manage your subscription</p>
          </div>
          <button
            onClick={() => {
              document.cookie = "tg_user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
              window.location.reload()
            }}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </header>

        <Card className="p-4 bg-zinc-950 border-zinc-800">
          <div className="flex items-center gap-3 mb-4">
            {user.photo_url ? (
              <img
                src={user.photo_url || "/placeholder.svg"}
                alt={user.username || "User"}
                className="w-14 h-14 rounded-full border-2 border-zinc-800 object-cover"
              />
            ) : (
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center text-xl font-bold">
                {user.username?.[0]?.toUpperCase() || "T"}
              </div>
            )}
            <div className="flex-1">
              <p className="font-bold">{user.username || "Trader User"}</p>
              <p className="text-xs text-zinc-500">@{user.username || "trader"}</p>
            </div>
            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-black font-bold" />
            </div>
          </div>
          <Separator className="my-4 bg-zinc-800" />
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Current Plan</span>
              <span className="font-semibold text-emerald-400 uppercase">{user.plan_code || "Free"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Balance</span>
              <span className="font-semibold">${(user.approx_balance || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Risk per Trade</span>
              <span className="font-semibold">{user.risk_percent || 1.0}%</span>
            </div>
          </div>
        </Card>

        <section>
          <h2 className="text-sm font-semibold text-zinc-400 mb-4">Upgrade Your Plan</h2>
          {loadingPlans ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Card key={i} className="p-4 bg-zinc-950 border-zinc-800 animate-pulse">
                  <div className="h-24 bg-zinc-900 rounded" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {plans.map((plan) => (
                <Card
                  key={plan.code}
                  className={`p-4 bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors ${
                    plan.code === "elite" ? "border-amber-500/30" : ""
                  } ${user.plan_code === plan.code ? "border-emerald-500/30 bg-emerald-500/5" : ""}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold">{plan.name}</h3>
                        {plan.code === "elite" && <Crown className="w-4 h-4 text-amber-500" />}
                      </div>
                      <p className="text-xs text-zinc-500">{plan.description}</p>
                    </div>
                    <p className="text-xl font-bold">
                      ${plan.price_usd}
                      <span className="text-xs text-zinc-500 font-normal">/mo</span>
                    </p>
                  </div>
                  <Button
                    className={`w-full h-9 mt-3 ${
                      user.plan_code === plan.code
                        ? "bg-emerald-500/20 text-emerald-400 cursor-default border border-emerald-500/30"
                        : plan.code === "elite"
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-600 hover:to-orange-600"
                          : "bg-zinc-800 hover:bg-zinc-700 text-white"
                    }`}
                    disabled={user.plan_code === plan.code}
                  >
                    {user.plan_code === plan.code ? "Current Plan" : "Upgrade"}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-purple-500/30">
      <div className="max-w-md mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "home" && <HomeSignals />}
            {activeTab === "journal" && <MyJournal />}
            {activeTab === "ai" && <AICopilot />}
            {activeTab === "account" && <Account />}
          </motion.div>
        </AnimatePresence>

        <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-zinc-800">
          <div className="max-w-md mx-auto px-4 py-3">
            <div className="flex items-center justify-around">
              <button
                onClick={() => setActiveTab("home")}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  activeTab === "home" ? "text-emerald-400" : "text-zinc-500"
                }`}
              >
                <Home className="w-5 h-5" />
                <span className="text-[10px] font-medium">Home</span>
              </button>
              <button
                onClick={() => setActiveTab("journal")}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  activeTab === "journal" ? "text-emerald-400" : "text-zinc-500"
                }`}
              >
                <BookOpen className="w-5 h-5" />
                <span className="text-[10px] font-medium">Journal</span>
              </button>
              <button onClick={() => setActiveTab("ai")} className="flex flex-col items-center -mt-8">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center mb-1 ${
                    activeTab === "ai"
                      ? "bg-gradient-to-br from-purple-500 to-pink-500"
                      : "bg-zinc-900 border-2 border-zinc-800"
                  }`}
                >
                  <Sparkles className="w-6 h-6" />
                </div>
                <span className={`text-[10px] font-medium ${activeTab === "ai" ? "text-purple-400" : "text-zinc-500"}`}>
                  AI
                </span>
              </button>
              <button
                onClick={() => setActiveTab("account")}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  activeTab === "account" ? "text-emerald-400" : "text-zinc-500"
                }`}
              >
                <UserIcon className="w-5 h-5" />
                <span className="text-[10px] font-medium">Account</span>
              </button>
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}
