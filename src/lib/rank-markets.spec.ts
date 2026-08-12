import { describe, expect, it } from 'vitest';
import { rankMarkets } from './rank-markets';
import type { WatchedMarket } from './api';

function market(overrides: Partial<WatchedMarket>): WatchedMarket {
  return {
    contractId: 'C000',
    strikePriceCents: '15',
    expiry: 1000,
    gracePeriodSecs: 3600,
    feedId: 100,
    status: 'watching',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('rankMarkets', () => {
  it('sorts open markets soonest-to-expire first', () => {
    const late = market({ contractId: 'CLATE', expiry: 3000 });
    const soon = market({ contractId: 'CSOON', expiry: 1000 });
    const mid = market({ contractId: 'CMID', expiry: 2000 });

    const ranked = rankMarkets([late, soon, mid]);

    expect(ranked.map((m) => m.contractId)).toEqual(['CSOON', 'CMID', 'CLATE']);
  });

  it('excludes closed markets — the homepage only features something tradeable', () => {
    const open = market({ contractId: 'COPEN', status: 'watching', expiry: 5000 });
    const settled = market({ contractId: 'CSETTLED', status: 'settled', expiry: 1000 });
    const cancelled = market({ contractId: 'CCANCELLED', status: 'cancelled', expiry: 2000 });
    const pending = market({ contractId: 'CPENDING', status: 'pending', expiry: 1500 });

    const ranked = rankMarkets([open, settled, cancelled, pending]);

    expect(ranked.map((m) => m.contractId)).toEqual(['COPEN']);
  });

  it('returns an empty list when nothing is open', () => {
    expect(rankMarkets([market({ status: 'settled' })])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const list = [market({ contractId: 'A', expiry: 2000 }), market({ contractId: 'B', expiry: 1000 })];
    const originalOrder = list.map((m) => m.contractId);
    rankMarkets(list);
    expect(list.map((m) => m.contractId)).toEqual(originalOrder);
  });
});
