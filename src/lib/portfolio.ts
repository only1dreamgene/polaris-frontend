/**
 * Client-side mirror of the market contract's redemption math (see
 * `polaris-contracts/contracts/market/src/lib.rs`'s `redeem`), used to show
 * a position's value without waiting on a redeem transaction.
 *
 * Scope note: this computes *current position value* (mark-to-market for
 * an open market, exact redeemable amount for a resolved/cancelled one) —
 * not historical realized P&L, which would need cost-basis tracking across
 * every split/buy/sell/merge a user has ever done. The contract only
 * stores current balances, not a transaction history, so that would need
 * an event indexer this build doesn't have. What's shown here is honest
 * and exactly matches what `redeem()` would actually pay out; it's not
 * pretending to be a full accounting ledger.
 */

export type MarketStatus = 'Open' | 'ResolvedYes' | 'ResolvedNo' | 'Cancelled';

export interface Position {
  yes: bigint;
  no: bigint;
}

/** Mirrors `redeem()` exactly: what this position is worth in collateral right now. */
export function redeemableValue(status: MarketStatus, position: Position): bigint {
  switch (status) {
    case 'Open':
      return 0n; // nothing is redeemable pre-resolution; see markToMarket for open-market value
    case 'ResolvedYes':
      return position.yes;
    case 'ResolvedNo':
      return position.no;
    case 'Cancelled':
      // NOT position.yes + position.no: sum(all YES balances) == total_supply
      // and sum(all NO balances) == total_supply are both independently true
      // (same number) — the contract only ever holds one total_supply's
      // worth of real collateral, not two. redeem() on a cancelled market
      // pays 0.5 per share held on either side for exactly this reason (see
      // polaris-contracts/README.md's "Cancellation payout" section, and the
      // bug it documents from paying both sides in full). This mirror had
      // gone stale relative to that fix until this was caught while adding
      // real test coverage — worth remembering: a "mirrors X exactly" claim
      // needs a test tying it to X's *current* behavior, not just to
      // whatever X did when this was written.
      return (position.yes + position.no) / 2n;
  }
}

/**
 * Estimated value of an open position at the current AMM implied price —
 * `yes * yesPriceBps/10000 + no * noPriceBps/10000`. This is a mark, not a
 * guaranteed exit price: actually selling moves the price (see the
 * contract's `cpmm_sell_out`), so a large position marks higher here than
 * it would actually fetch in one sell.
 */
export function markToMarket(position: Position, yesBps: number, noBps: number): bigint {
  const yesValue = (position.yes * BigInt(yesBps)) / 10_000n;
  const noValue = (position.no * BigInt(noBps)) / 10_000n;
  return yesValue + noValue;
}

export function isFinalized(status: MarketStatus): boolean {
  return status !== 'Open';
}

export function didWin(status: MarketStatus, position: Position): boolean | null {
  if (status === 'ResolvedYes') return position.yes > 0n;
  if (status === 'ResolvedNo') return position.no > 0n;
  return null; // Open or Cancelled — "win/loss" isn't a meaningful question
}
