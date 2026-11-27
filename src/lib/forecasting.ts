// src/lib/forecasting.ts
// Advanced Forecasting Engine: Exponential Smoothing (SES) and Days of Supply (DOS)

import type { LedgerEntry } from './db';

export interface SESForecastResult {
  forecastDaily: number;
  forecast30d: number;
  alpha: number;
  model: 'SES';
}

/**
 * Calculates Exponential Smoothing (SES) forecast from ledger entries.
 *
 * SES formula: S_t = alpha * Y_t + (1 - alpha) * S_{t-1}
 *
 * @param ledgerEntries - Array of ledger entries with qtyIn and timestamp
 * @param alpha - Smoothing parameter (0 < alpha <= 1), default 0.3 (good for intermittent demand)
 * @param periods - Number of periods to forecast ahead, default 1
 * @returns Forecast result with daily and 30-day forecasts
 */
export function calculateExponentialSmoothingForecast(
  ledgerEntries: LedgerEntry[],
  alpha: number = 0.3,
  periods: number = 1
): SESForecastResult {
  // Validate alpha
  if (alpha <= 0 || alpha > 1) {
    throw new Error('Alpha must be between 0 and 1 (exclusive of 0)');
  }

  // Filter outbound entries (qtyIn < 0) and extract demand as positive values
  // Sort by timestamp ascending (oldest first)
  const outboundEntries = ledgerEntries
    .filter((entry) => entry.qtyIn < 0)
    .map((entry) => ({
      date: entry.timestamp,
      demand: Math.abs(entry.qtyIn),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // If no outbound data, return zero forecast
  if (outboundEntries.length === 0) {
    return {
      forecastDaily: 0,
      forecast30d: 0,
      alpha,
      model: 'SES',
    };
  }

  // Initialize SES with first observation
  let S = outboundEntries[0].demand;

  // Apply SES formula: S_t = alpha * Y_t + (1 - alpha) * S_{t-1}
  for (let i = 1; i < outboundEntries.length; i++) {
    const Y_t = outboundEntries[i].demand;
    S = alpha * Y_t + (1 - alpha) * S;
  }

  // Forecast for next period(s) - SES forecast is constant (flat)
  const forecastPerPeriod = S;

  // Convert to daily forecast (assuming each period is one day)
  // If the data is daily, forecastPerPeriod is already daily
  const forecastDaily = forecastPerPeriod;
  const forecast30d = forecastDaily * 30 * periods;

  return {
    forecastDaily: Number(forecastDaily.toFixed(4)),
    forecast30d: Number(forecast30d.toFixed(4)),
    alpha,
    model: 'SES',
  };
}

/**
 * Calculates Days of Supply (DOS) from current stock and daily forecast.
 *
 * @param currentStock - Current available stock quantity
 * @param forecastDaily - Daily demand forecast
 * @returns Days of supply rounded to 1 decimal place, or 999 if forecastDaily <= 0
 */
export function calculateDaysOfSupply(currentStock: number, forecastDaily: number): number {
  if (forecastDaily <= 0) {
    return 999; // Effectively infinite supply
  }

  const dos = currentStock / forecastDaily;
  return Math.round(dos * 10) / 10; // Round to 1 decimal place
}