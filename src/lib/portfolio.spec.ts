import { describe, expect, it } from 'vitest';
import { didWin, markToMarket, redeemableValue, type Position } from './portfolio';

const pos: Position = { yes: 1_000n, no: 400n };

describe('redeemableValue', () => {
  it('redeems nothing while the market is open', () => {
    expect(redeemableValue('Open', pos)).toBe(0n);
  });

  it('pays the yes balance when yes resolves', () => {
    expect(redeemableValue('ResolvedYes', pos)).toBe(1_000n);
  });

  it('pays the no balance when no resolves', () => {
    expect(redeemableValue('ResolvedNo', pos)).toBe(400n);
  });

  it('pays 0.5 per share on either side when cancelled, matching redeem()', () => {
    // Regression for: this used to return yes + no (1_400n) here, mirroring
    // a contract bug that paid both sides in full on cancellation — fixed
    // in polaris-contracts to pay (yes + no) / 2, the only formula that's
    // solvent for every holder regardless of trading history. This mirror
    // had drifted out of sync with that fix until this test caught it.
    expect(redeemableValue('Cancelled', pos)).toBe(700n);
  });
});

describe('markToMarket', () => {
  it('weights each side by its implied price', () => {
    // 70% yes / 30% no implied odds
    expect(markToMarket(pos, 7_000, 3_000)).toBe(700n + 120n);
  });

  it('marks an empty position to zero', () => {
    expect(markToMarket({ yes: 0n, no: 0n }, 5_000, 5_000)).toBe(0n);
  });
});

describe('didWin', () => {
  it('is a win when holding a nonzero yes balance and yes resolves', () => {
    expect(didWin('ResolvedYes', pos)).toBe(true);
  });

  it('is a win when holding a nonzero no balance and no resolves', () => {
    expect(didWin('ResolvedNo', pos)).toBe(true);
  });

  it('is a loss when holding zero of the resolved side', () => {
    expect(didWin('ResolvedYes', { yes: 0n, no: 400n })).toBe(false);
  });

  it('is undefined pre-resolution', () => {
    expect(didWin('Open', pos)).toBeNull();
  });

  it('is undefined on cancellation', () => {
    expect(didWin('Cancelled', pos)).toBeNull();
  });
});
