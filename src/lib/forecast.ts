// src/lib/forecast.ts
// Demand forecasting from historical monthly outbound quantities.
// Implements the Weighted Moving Average (WMA-5m) algorithm per the Excel spec.

export interface ForecastResult {
  forecast30d: number;
  forecastPerDay: number;
  forecastStatus: 'OK' | 'LOW_DATA';
  forecastMethod: string;
}

/**
 * Weighted Moving Average forecast over the most recent months.
 *
 * @param monthlyHistory array of monthly outbound quantities, oldest to newest
 * @param monthsToUse    number of most recent months to include (default 5)
 */
export function calculateForecast(
  monthlyHistory: number[],
  monthsToUse: number = 5
): ForecastResult {
  const history = Array.isArray(monthlyHistory) ? monthlyHistory : [];
  const windowSize = Math.max(1, Math.min(monthsToUse, 5));

  // Most recent months first, ignoring negative/NaN entries.
  const recent = history
    .filter((qty) => typeof qty === 'number' && Number.isFinite(qty) && qty > 0)
    .slice(-windowSize)
    .reverse();

  const monthsWithData = recent.length;

  // Fallback: fewer than 3 months of data -> simple average.
  if (monthsWithData < 3) {
    const totalOutbound = recent.reduce((sum, qty) => sum + qty, 0);
    const avgPerMonth = monthsWithData > 0 ? totalOutbound / monthsWithData : 0;
    const forecastPerDay = avgPerMonth / 30;
    return {
      forecast30d: forecastPerDay * 30,
      forecastPerDay,
      forecastStatus: 'LOW_DATA',
      forecastMethod: 'SIMPLE-AVG',
    };
  }

  // WMA-5m: most recent month x 5, second x 4, third x 3, fourth x 2, fifth x 1.
  // recent[0] is the most recent month.
  const weights = [5, 4, 3, 2, 1];
  let weightedSum = 0;
  let sumOfWeights = 0;

  for (let i = 0; i < monthsWithData; i++) {
    weightedSum += recent[i] * weights[i];
    sumOfWeights += weights[i];
  }

  const weightedMonthlyAvg = sumOfWeights > 0 ? weightedSum / sumOfWeights : 0;
  const forecastPerDay = weightedMonthlyAvg / 30;

  return {
    forecast30d: forecastPerDay * 30,
    forecastPerDay,
    forecastStatus: 'OK',
    forecastMethod: 'WMA-5m',
  };
}
