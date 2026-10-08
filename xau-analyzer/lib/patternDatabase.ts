// Server compatibility wrapper. Browser code imports patternDatabaseCore instead.
import { PatternDatabaseStore as CorePatternDatabaseStore, type EnrichedTradeRecord } from './patternDatabaseCore';
import { loadJson, saveJson } from './storage';
export type { TradeFeatures, EnrichedTradeRecord, MLProbability, AdaptiveWeights } from './patternDatabaseCore';

export class PatternDatabaseStore extends CorePatternDatabaseStore {
  constructor(storageKey?: string) {
    super(storageKey ? loadJson<EnrichedTradeRecord[]>(storageKey, []) : undefined,
      storageKey ? records => saveJson(storageKey, records) : undefined);
  }
}

// ── Singleton across Next.js requests ─────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var _patternDatabase: PatternDatabaseStore | undefined;
}
if (!global._patternDatabase) global._patternDatabase = new PatternDatabaseStore('patternDatabase');
export const patternDatabase = global._patternDatabase;
