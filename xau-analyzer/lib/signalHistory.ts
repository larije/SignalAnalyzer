// Server compatibility wrapper. Browser code imports signalHistoryCore instead.
import { SignalHistoryStore as CoreSignalHistoryStore, type SignalHistorySnapshot } from './signalHistoryCore';
import { loadJson, saveJson } from './storage';
export { computeAvgRR, perTradeSharpe } from './signalHistoryCore';
export type { SignalHistorySnapshot } from './signalHistoryCore';

export class SignalHistoryStore extends CoreSignalHistoryStore {
  constructor(storageKey?: string) {
    super(storageKey ? loadJson<SignalHistorySnapshot>(storageKey, { entries: [], calibration: [] }) : undefined,
      storageKey ? snapshot => saveJson(storageKey, snapshot) : undefined);
  }
}

// Singleton across requests
declare global {
  // eslint-disable-next-line no-var
  var _signalHistory: SignalHistoryStore | undefined;
}

if (!global._signalHistory) global._signalHistory = new SignalHistoryStore('signalHistory');
export const signalHistory = global._signalHistory;
