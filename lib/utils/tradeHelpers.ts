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
    
    // Calculate pips/points from entry to TARGET (not current price)
    // This shows how many pips/points TO the target, not from entry to current
    const targetDiff = direction === 1 ? (target - entry) : (entry - target)
    
    // Determine asset class from entry price format
    const entryStr = entry.toString()
    const hasDecimal = entryStr.includes('.')
    const decimalPlaces = hasDecimal ? entryStr.split('.')[1]?.length || 0 : 0
    
    let pips = 0
    
    // Forex: 4-5 decimal places = pips (1 pip = 0.0001 for most pairs)
    if (decimalPlaces >= 4) {
      pips = Math.abs(targetDiff * 10000)
    } 
    // Crypto/Stocks/Indices: Use price difference directly as points
    else if (decimalPlaces <= 2) {
      pips = Math.abs(targetDiff)
    }
    // Commodities with 2-3 decimal places (like XAUUSD with 2 decimals)
    else if (decimalPlaces === 2 || decimalPlaces === 3) {
      pips = Math.abs(targetDiff) // For gold, 1 point = $1
    }
    // Commodities with more decimals (like XAUUSD sometimes has 6 decimals)
    else {
      // For high-precision commodities, treat as points (1 point = 1 unit)
      pips = Math.abs(targetDiff)
    }
    
    // Calculate current progress pips (from entry to current, not to target)
    const currentDiff = direction === 1 ? (currentPrice - entry) : (entry - currentPrice)
    let currentPips = 0
    if (decimalPlaces >= 4) {
      currentPips = Math.abs(currentDiff * 10000)
    } else {
      currentPips = Math.abs(currentDiff)
    }
    
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
  type: 'success' | 'warning' | 'info' | 'error'
  showPopup?: boolean
} | null {
  if (trade.status !== 'open') return null
  
  const currentR = trade.floating_r || 0
  const currentPercent = trade.floating_pnl_percent || 0
  const direction = trade.direction?.toLowerCase() || 'long'
  const isLong = direction === 'long'
  
  // TP hit messages - these should show as popups
  if (tpProgress.tp1Progress >= 100 && tpProgress.tp2Progress < 100) {
    return {
      message: isLong 
        ? "TP1 Hit! Take partial profit - don't be greedy! Secure some gains."
        : "TP1 Hit! Take partial profit - don't be greedy! Secure some gains.",
      type: 'success',
      showPopup: true
    }
  }
  if (tpProgress.tp2Progress >= 100 && tpProgress.tp3Progress < 100) {
    return {
      message: "TP2 Hit! Secure some more profit! You're doing great!",
      type: 'success',
      showPopup: true
    }
  }
  if (tpProgress.tp3Progress >= 100) {
    return {
      message: "Clean shot! All targets hit. Take profit, don't give them back!",
      type: 'success',
      showPopup: true
    }
  }
  
  // Stop Loss approaching warnings
  const entry = trade.entry_price || 0
  const sl = trade.sl || 0
  const currentPrice = trade.current_price || entry
  if (sl > 0 && entry > 0) {
    const distanceToSL = isLong 
      ? ((currentPrice - sl) / (entry - sl)) * 100
      : ((sl - currentPrice) / (sl - entry)) * 100
    
    if (distanceToSL < 20 && distanceToSL > 0) {
      return {
        message: isLong
          ? "Stop Loss approaching! Manage your risk - markets don't go straight up to make you money."
          : "Stop Loss approaching! Manage your risk - markets don't go straight down to make you money.",
        type: 'warning',
        showPopup: true
      }
    }
  }
  
  // Risk management messages
  if (currentR < -0.5) {
    return {
      message: isLong
        ? "Manage your risk! Markets don't go straight up to make you money. Consider your position size."
        : "Manage your risk! Markets don't go straight down to make you money. Consider your position size.",
      type: 'warning'
    }
  }
  
  if (currentR > 2 && currentPercent > 5) {
    return {
      message: "Great move! But remember - this is not financial advice. Take profits when you can!",
      type: 'info'
    }
  }
  
  // General encouragement
  if (currentR > 0 && currentR < 1) {
    return {
      message: isLong
        ? "You're in profit! We help with professional analysis, but we can't snipe every low and high."
        : "You're in profit! We help with professional analysis, but we can't snipe every high and low.",
      type: 'info'
    }
  }
  
  return null
}

/**
 * Get liquidation warning message
 */
export function getLiquidationMessage(trade: any): {
  message: string
  type: 'warning' | 'error'
  showPopup?: boolean
} | null {
  if (trade.status === 'sl_hit') {
    const direction = trade.direction?.toLowerCase() || 'long'
    const isLong = direction === 'long'
    return {
      message: isLong
        ? "Stop Loss Hit! Don't cry - it happens to us too! We learned to manage risk, so do it. Markets don't always go up."
        : "Stop Loss Hit! Don't cry - it happens to us too! We learned to manage risk, so do it. Markets don't always go down.",
      type: 'error',
      showPopup: true
    }
  }
  return null
}

