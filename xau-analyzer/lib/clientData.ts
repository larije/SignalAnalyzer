function hasFiniteNumbers(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return fields.every(field => typeof data[field] === 'number' && Number.isFinite(data[field]));
}

// Validate the existing client contracts before data reaches chart/metric rendering.
// Extra server fields are allowed; zero is a valid metric, never a missing value.
export function isChartData(value: unknown): boolean {
  return Array.isArray(value) && value.every(candle =>
    hasFiniteNumbers(candle, ['time', 'open', 'high', 'low', 'close', 'volume']),
  );
}

export function isPerformanceStats(value: unknown): boolean {
  return hasFiniteNumbers(value, [
    'totalSignals', 'completedSignals', 'pendingSignals', 'timeouts', 'winRate',
    'lossRate', 'profitFactor', 'avgRR', 'expectancy', 'maxDrawdown', 'netPnlPct',
    'sharpeRatio', 'bestTrade', 'worstTrade',
  ]);
}

export function isBacktestResult(value: unknown): boolean {
  return hasFiniteNumbers(value, [
    'totalTrades', 'wins', 'losses', 'winRate', 'profitFactor', 'sharpeRatio',
    'maxDrawdown', 'netPnlPct', 'avgTradePct', 'avgHoldMinutes',
  ]) && typeof value.asset === 'string' && typeof value.period === 'string';
}
