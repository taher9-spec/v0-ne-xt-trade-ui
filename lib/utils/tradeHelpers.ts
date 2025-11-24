/**
 * Trade helper functions for TP progress, notes, and notifications
 */

import type { Trade } from "@/lib/types"

/**
 * Calculate progress to TP1, TP2, TP3
 */
export function calculateTPProgress(trade: any, currentPrice: number): {
  tp1Progress: number // 0-100
  tp2Progress: number
  tp3Progress: number
  tp1Pips: number
  tp2Pips: number
  tp3Pips: number
  tp1Percent: number
  tp2Percent: number
  tp3Percent: number
  nextTP: 'tp1' | 'tp2' | 'tp3' | null
} {
  const entry = trade.entry_price || 0
  const direction = trade.direction === 'long' ? 1 : -1
  const tp1 = trade.tp1 || 0
  const tp2 = trade.tp2 || 0
  const tp3 = trade.tp3 || 0
  
  // Calculate progress for each TP
  const calculateProgress = (target: number) => {
    if (!target || target === 0) return { progress: 0, pips: 0, percent: 0 }
    
    // For LONG: price should go UP to reach TP
    // For SHORT: price should go DOWN to reach TP
    const entryToTarget = Math.abs(target - entry)
    let entryToCurrent = 0
    
    if (direction === 1) { // LONG
      if (currentPrice >= target) {
        entryToCurrent = entryToTarget // 100% reached
      } else if (currentPrice > entry) {
        entryToCurrent = currentPrice - entry // Moving towards TP
      } else {
        entryToCurrent = 0 // Below entry
      }
    } else { // SHORT
      if (currentPrice <= target) {
        entryToCurrent = entryToTarget // 100% reached
      } else if (currentPrice < entry) {
        entryToCurrent = entry - currentPrice // Moving towards TP
      } else {
        entryToCurrent = 0 // Above entry
      }
    }
    
    const progress = entryToTarget > 0 ? Math.min(100, Math.max(0, (entryToCurrent / entryToTarget) * 100)) : 0
    
    // For forex, calculate pips (assuming 4-5 decimal places)
    const isForex = entry.toString().includes('.') && entry.toString().split('.')[1]?.length >= 4
    const priceDiff = direction === 1 ? (currentPrice - entry) : (entry - currentPrice)
    const pips = isForex 
      ? Math.abs(priceDiff * 10000)
      : Math.abs(priceDiff)
    
    const percent = ((currentPrice - entry) / entry) * 100 * direction
    
    return { progress, pips, percent }
  }
  
  const tp1Data = calculateProgress(tp1)
  const tp2Data = calculateProgress(tp2)
  const tp3Data = calculateProgress(tp3)
  
  // Determine next TP
  let nextTP: 'tp1' | 'tp2' | 'tp3' | null = null
  if (tp1 > 0 && tp1Data.progress < 100) {
    nextTP = 'tp1'
  } else if (tp2 > 0 && tp2Data.progress < 100) {
    nextTP = 'tp2'
  } else if (tp3 > 0 && tp3Data.progress < 100) {
    nextTP = 'tp3'
  }
  
  return {
    tp1Progress: tp1Data.progress,
    tp2Progress: tp2Data.progress,
    tp3Progress: tp3Data.progress,
    tp1Pips: tp1Data.pips,
    tp2Pips: tp2Data.pips,
    tp3Pips: tp3Data.pips,
    tp1Percent: tp1Data.percent,
    tp2Percent: tp2Data.percent,
    tp3Percent: tp3Data.percent,
    nextTP,
  }
}

/**
 * Get friendly advice message based on trade situation
 */
export function getTradeAdvice(trade: any, tpProgress: ReturnType<typeof calculateTPProgress>): {
  message: string
  type: 'success' | 'warning' | 'info'
  showPopup?: boolean
} | null {
  if (trade.status !== 'open') return null
  
  const currentR = trade.floating_r || 0
  const currentPercent = trade.floating_pnl_percent || 0
  
  // TP hit messages - these should show as popups
  if (tpProgress.tp1Progress >= 100 && tpProgress.tp2Progress < 100) {
    return {
      message: "🎯 TP1 Hit! Take partial profit - don't be greedy!",
      type: 'success',
      showPopup: true
    }
  }
  if (tpProgress.tp2Progress >= 100 && tpProgress.tp3Progress < 100) {
    return {
      message: "🎯 TP2 Hit! Secure some more profit!",
      type: 'success',
      showPopup: true
    }
  }
  if (tpProgress.tp3Progress >= 100) {
    return {
      message: "🎯 Clean shot! All targets hit. Take profit, don't give them back!",
      type: 'success',
      showPopup: true
    }
  }
  
  // Risk management messages
  if (currentR < -0.5) {
    return {
      message: "⚠️ Manage your risk! Markets don't go straight up to make you money.",
      type: 'warning'
    }
  }
  
  if (currentR > 2 && currentPercent > 5) {
    return {
      message: "💡 Great move! But remember - this is not financial advice. Take profits when you can!",
      type: 'info'
    }
  }
  
  // General encouragement
  if (currentR > 0 && currentR < 1) {
    return {
      message: "📈 You're in profit! We help with professional analysis, but we can't snipe every low and high.",
      type: 'info'
    }
  }
  
  return null
}

/**
 * Get liquidation warning message
 */
export function getLiquidationMessage(trade: any): string | null {
  if (trade.status === 'sl_hit') {
    return "💔 Got liquidated? Don't cry - it happens to us too! We learned to manage risk, so do it."
  }
  return null
}

