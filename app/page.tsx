"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  LineChart,
  Wallet,
  Bot,
  User,
  Bell,
  Search,
  Menu,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Activity,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getRealTimeQuotes, getHistoricalData } from "./actions"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

// --- Components ---

function MetricCard({ title, value, change, isPositive, icon: Icon }: any) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardContent className="p-4 relative z-10">
        <div className="flex justify-between items-start mb-2">
          <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider">{title}</p>
          <div
            className={`p-1.5 rounded-full ${isPositive ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="space-y-1">
          <h3 className="text-2xl font-bold text-white tracking-tight">{value}</h3>
          <div className={`flex items-center text-xs font-medium ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
            {isPositive ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
            {change}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MarketCard({ symbol, name, price, change, changePercent }: any) {
  const isPositive = change >= 0

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:bg-zinc-900/50 hover:border-zinc-700 transition-all cursor-pointer group">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${isPositive ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}
        >
          {symbol.substring(0, 2)}
        </div>
        <div>
          <h4 className="font-bold text-zinc-100">{symbol}</h4>
          <p className="text-xs text-zinc-500 font-medium">{name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono font-medium text-zinc-100">
          ${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
        <p
          className={`text-xs font-medium flex items-center justify-end ${isPositive ? "text-emerald-500" : "text-rose-500"}`}
        >
          {isPositive ? "+" : ""}
          {changePercent.toFixed(2)}%
        </p>
      </div>
    </div>
  )
}

function SignalCard({ symbol, type, price, confidence, time, profit }: any) {
  const isLong = type === "LONG"

  return (
    <Card className="bg-zinc-900 border-zinc-800 overflow-hidden relative">
      <div className={`absolute top-0 left-0 w-1 h-full ${isLong ? "bg-emerald-500" : "bg-rose-500"}`} />
      <CardContent className="p-4 pl-6">
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-lg text-white">{symbol}</h3>
              <Badge
                variant="outline"
                className={`${isLong ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5" : "border-rose-500/30 text-rose-400 bg-rose-500/5"} text-[10px] h-5 px-1.5`}
              >
                {type}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500">{time}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end text-sm font-medium text-zinc-300">
              <Zap className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
              {confidence}%
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Confidence</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-[10px] uppercase text-zinc-500 font-medium mb-0.5">Entry Price</p>
            <p className="text-sm font-mono text-zinc-200">${price}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-zinc-500 font-medium mb-0.5">Potential</p>
            <p className="text-sm font-mono text-emerald-400">+{profit}%</p>
          </div>
        </div>

        <Button
          className={`w-full h-9 text-xs font-medium ${isLong ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}`}
        >
          Execute Trade
        </Button>
      </CardContent>
    </Card>
  )
}

function ChartComponent({ data, color = "#10b981" }: { data: any[]; color?: string }) {
  if (!data || data.length === 0)
    return <div className="h-[200px] flex items-center justify-center text-zinc-500 text-sm">Loading chart data...</div>

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="date" hide axisLine={false} tickLine={false} />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", color: "#fff" }}
            itemStyle={{ color: "#fff" }}
            labelStyle={{ display: "none" }}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorPrice)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// --- Main Views ---

function HomeView() {
  const [quotes, setQuotes] = useState<any[]>([])
  const [chartData, setChartData] = useState<any[]>([])
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSD")

  useEffect(() => {
    // Initial fetch
    const fetchData = async () => {
      const data = await getRealTimeQuotes(["BTCUSD", "ETHUSD", "AAPL", "NVDA", "TSLA"])
      setQuotes(data)
    }
    fetchData()

    // Setup interval for pseudo-realtime feeling (every 10s)
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Fetch Chart Data when symbol changes
    const fetchChart = async () => {
      const data = await getHistoricalData(selectedSymbol)
      setChartData(data)
    }
    fetchChart()
  }, [selectedSymbol])

  const mainQuote = quotes.find((q) => q.symbol === selectedSymbol) || { price: 0, changesPercentage: 0 }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <header className="flex justify-between items-center pt-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-black" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">NeXT TRADE</span>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800">
            <Search className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800">
            <Bell className="w-5 h-5" />
          </Button>
          <Avatar className="w-8 h-8 border border-zinc-700">
            <AvatarImage src="/placeholder.svg" />
            <AvatarFallback className="bg-zinc-800 text-zinc-300">JD</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Chart Card */}
      <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
        <CardContent className="p-0">
          <div className="p-5 border-b border-zinc-800">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">
                  ${mainQuote.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </h2>
                <div
                  className={`flex items-center gap-2 mt-1 ${mainQuote.changesPercentage >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                >
                  <span className="font-medium flex items-center">
                    {mainQuote.changesPercentage >= 0 ? (
                      <ArrowUpRight className="w-4 h-4 mr-1" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 mr-1" />
                    )}
                    {Math.abs(mainQuote.changesPercentage).toFixed(2)}%
                  </span>
                  <span className="text-zinc-500 text-sm">Today</span>
                </div>
              </div>
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
                {selectedSymbol}
              </Badge>
            </div>
          </div>

          <div className="pt-4">
            <ChartComponent data={chartData} color={mainQuote.changesPercentage >= 0 ? "#10b981" : "#f43f5e"} />
          </div>

          <div className="grid grid-cols-4 divide-x divide-zinc-800 border-t border-zinc-800 bg-zinc-900/50">
            {["1H", "1D", "1W", "1M"].map((period, i) => (
              <button
                key={period}
                className={`py-3 text-xs font-medium hover:bg-zinc-800/50 transition-colors ${i === 1 ? "text-white bg-zinc-800" : "text-zinc-500"}`}
              >
                {period}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Market List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-semibold text-zinc-100">Market Overview</h3>
          <span className="text-xs text-zinc-500">Real-time Data</span>
        </div>
        <div className="space-y-2">
          {quotes.map((q) => (
            <div key={q.symbol} onClick={() => setSelectedSymbol(q.symbol)}>
              <MarketCard
                symbol={q.symbol}
                name={q.name}
                price={q.price}
                change={q.change}
                changePercent={q.changesPercentage}
              />
            </div>
          ))}
          {quotes.length === 0 && <div className="text-center py-8 text-zinc-500 text-sm">Loading market data...</div>}
        </div>
      </div>

      {/* Active Signals */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-semibold text-zinc-100">AI Signals</h3>
          <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20">
            3 Active
          </Badge>
        </div>
        <div className="grid gap-3">
          <SignalCard symbol="NVDA" type="LONG" price={890.45} confidence={94} time="2m ago" profit={12.5} />
          <SignalCard symbol="TSLA" type="SHORT" price={178.2} confidence={88} time="15m ago" profit={8.2} />
        </div>
      </div>
    </div>
  )
}

function JournalView() {
  return (
    <div className="space-y-6 pb-20 pt-2">
      <h1 className="text-2xl font-bold text-white">Trading Journal</h1>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard title="Win Rate" value="68%" change="4.2%" isPositive={true} icon={TrendingUp} />
        <MetricCard title="Net P&L" value="+$2,450" change="12.5%" isPositive={true} icon={Wallet} />
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-zinc-100 px-1">Recent Trades</h3>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-10 rounded-full ${i === 2 ? "bg-rose-500" : "bg-emerald-500"}`} />
                <div>
                  <h4 className="font-bold text-white">BTC/USD</h4>
                  <p className="text-xs text-zinc-500">Oct 24, 14:30</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-mono font-bold ${i === 2 ? "text-rose-500" : "text-emerald-500"}`}>
                  {i === 2 ? "-$120.50" : "+$450.00"}
                </p>
                <Badge variant="outline" className="text-[10px] h-5 border-zinc-700 text-zinc-400">
                  Scalp
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function AIView() {
  return (
    <div className="flex flex-col h-[calc(100vh-80px)] pt-2">
      <div className="flex-none mb-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Bot className="w-6 h-6 text-purple-500" />
          Copilot
        </h1>
        <p className="text-zinc-500 text-sm">Ask me anything about the market</p>
      </div>

      <Card className="flex-1 bg-zinc-900 border-zinc-800 flex flex-col overflow-hidden mb-4">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-purple-400" />
              </div>
              <div className="bg-zinc-800/50 rounded-2xl rounded-tl-none p-3 text-sm text-zinc-200">
                Hello! I've analyzed the market structure for BTC. We're seeing strong support at $94,000 with
                increasing buy volume. Would you like to see the key resistance levels?
              </div>
            </div>

            <div className="flex gap-3 flex-row-reverse">
              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-none p-3 text-sm">
                Yes, and check ETH correlation too.
              </div>
            </div>
          </div>
        </ScrollArea>
        <div className="p-3 bg-zinc-900 border-t border-zinc-800">
          <div className="relative">
            <Input
              placeholder="Ask about crypto, stocks, or forex..."
              className="bg-zinc-950 border-zinc-800 pr-10 focus-visible:ring-purple-500/50"
            />
            <Button size="icon" className="absolute right-1 top-1 h-8 w-8 bg-purple-600 hover:bg-purple-700 rounded-lg">
              <ArrowUpRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function AccountView() {
  return (
    <div className="space-y-6 pb-20 pt-2">
      <div className="flex items-center gap-4">
        <Avatar className="w-16 h-16 border-2 border-zinc-800">
          <AvatarImage src="/placeholder.svg" />
          <AvatarFallback className="bg-zinc-800 text-2xl">JD</AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-xl font-bold text-white">John Doe</h2>
          <p className="text-zinc-500 text-sm">Pro Trader Plan</p>
        </div>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Subscription</CardTitle>
          <CardDescription>Manage your premium features</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-emerald-500/20">
                <Zap className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold text-emerald-500 text-sm">Premium Active</p>
                <p className="text-xs text-zinc-500">Renews Nov 24, 2025</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
            >
              Manage
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-400 px-1 uppercase tracking-wider">Settings</h3>
        <Button
          variant="outline"
          className="w-full justify-start bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white h-12"
        >
          <Bell className="w-4 h-4 mr-3" /> Notifications
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white h-12"
        >
          <Wallet className="w-4 h-4 mr-3" /> Connected Wallets
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white h-12"
        >
          <Activity className="w-4 h-4 mr-3" /> Trading Preferences
        </Button>
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState("home")

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-purple-500/30">
      <div className="max-w-md mx-auto min-h-screen relative flex flex-col">
        {/* Main Content Area */}
        <main className="flex-1 p-4 overflow-y-auto scrollbar-hide">
          <AnimatePresence mode="wait">
            {activeTab === "home" && (
              <motion.div
                key="home"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <HomeView />
              </motion.div>
            )}
            {activeTab === "journal" && (
              <motion.div
                key="journal"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <JournalView />
              </motion.div>
            )}
            {activeTab === "ai" && (
              <motion.div
                key="ai"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <AIView />
              </motion.div>
            )}
            {activeTab === "account" && (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <AccountView />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-lg border-t border-zinc-900 pb-safe">
          <div className="max-w-md mx-auto flex justify-around items-center h-16 px-2">
            <button
              onClick={() => setActiveTab("home")}
              className={`flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors ${activeTab === "home" ? "text-white" : "text-zinc-600 hover:text-zinc-400"}`}
            >
              <LineChart className="w-5 h-5" />
              <span className="text-[10px] font-medium">Market</span>
            </button>
            <button
              onClick={() => setActiveTab("journal")}
              className={`flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors ${activeTab === "journal" ? "text-white" : "text-zinc-600 hover:text-zinc-400"}`}
            >
              <Wallet className="w-5 h-5" />
              <span className="text-[10px] font-medium">Journal</span>
            </button>

            <div className="relative -top-5">
              <button
                onClick={() => setActiveTab("ai")}
                className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.3)] hover:scale-105 transition-transform"
              >
                <Bot className="w-6 h-6" />
              </button>
            </div>

            <button
              onClick={() => setActiveTab("account")}
              className={`flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors ${activeTab === "account" ? "text-white" : "text-zinc-600 hover:text-zinc-400"}`}
            >
              <User className="w-5 h-5" />
              <span className="text-[10px] font-medium">Account</span>
            </button>

            <button className="flex flex-col items-center justify-center w-16 h-full space-y-1 text-zinc-600 hover:text-zinc-400">
              <Menu className="w-5 h-5" />
              <span className="text-[10px] font-medium">Menu</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}
