/**
 * Shared TypeScript types for the NeXT TRADE app
 */

export type Signal = {
  id: string
  symbol: string
  symbol_id?: string | null
  direction: "long" | "short" | "LONG" | "SHORT"
  type: "intraday" | "swing" | "scalp" | string
  market: "forex" | "crypto" | "stock" | string
  entry?: number | null
  entry_price?: number | null // Some code uses entry_price, some uses entry
  sl?: number | null
  stop_loss?: number | null // Alternative name
  tp1?: number | null
  target_price?: number | null // Alternative name
  tp2?: number | null
  tp3?: number | null
  timeframe?: string | null
  status?: "active" | "expired" | "hit_tp" | "stopped_out" | "pending" | string
  reason_summary?: string | null
  confidence?: number | null
  engine_version?: string | null
  rr_ratio?: number | null
  signal_score?: number | null // Signal quality score 0-100
  score?: number | null        // Alias for signal_score
  quality_tier?: string | null // A, B, C
  regime?: string | null       // trend, range, breakout
  explanation?: string | null  // Human readable explanation
  factors?: any | null         // JSON object with factor values
  activated_at?: string | null
  closed_at?: string | null
  created_at: string
  symbols?: {
    fmp_symbol?: string
    display_symbol?: string
    name?: string
    asset_class?: string
  } | null
}

export type Trade = {
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
  status: "open" | "closed" | "tp_hit" | "sl_hit" | "closed_manual" | "expired"
  result_r: number | null
  pnl: number | null
  pnl_percent?: number | null
  floating_r?: number | null
  floating_pnl_percent?: number | null
  current_price?: number | null
  opened_at: string
  closed_at: string | null
  size?: number | null
  rr?: number | null
  notes?: string | null
  symbols?: {
    fmp_symbol?: string
    display_symbol?: string
    name?: string
    asset_class?: string
  } | null
  signals?: Signal | null
}
