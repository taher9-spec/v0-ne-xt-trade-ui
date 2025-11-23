// Trade types for type safety across the app

export type TradeStatus = "open" | "tp_hit" | "sl_hit" | "closed_manual" | "expired"

export interface Trade {
  id: string
  user_id: string
  signal_id: string | null
  symbol_id?: string | null
  symbol: string
  direction: "long" | "short"
  entry_price: number | null
  exit_price: number | null
  sl?: number | null
  tp1?: number | null
  tp2?: number | null
  tp3?: number | null
  timeframe: string | null
  result_r: number | null
  pnl: number | null
  pnl_percent?: number | null
  floating_r?: number | null
  floating_pnl_percent?: number | null
  current_price?: number | null
  status: TradeStatus
  opened_at: string
  closed_at: string | null
  size?: number | null
  rr?: number | null
  notes?: string | null
  symbols?: {
    fmp_symbol?: string
    display_symbol?: string
    name?: string
  } | null
}

export interface TradeStats {
  total: number
  wins: number
  losses: number
  open: number
  winRate: number
  avgR?: number
}

// Helper function to safely format numbers
export function formatNumber(value: number | null | undefined, decimals: number = 2, fallback: string = "-"): string {
  if (value === null || value === undefined || isNaN(value)) {
    return fallback
  }
  return Number(value).toFixed(decimals)
}

// Helper function to safely parse number from DB
export function parseNumber(value: any): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === "string" ? parseFloat(value) : Number(value)
  return isNaN(parsed) ? null : parsed
}

