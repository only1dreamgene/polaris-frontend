/**
 * Client-side mirror of the market contract's constant-product swap math
 * (`cpmm_out` + `apply_fee` in `polaris-contracts`), used to give `buy` a
 * real slippage floor instead of accepting whatever price the pool happens
 * to be at by the time the transaction lands.
 *
 * Without this, `min_shares_out` had been hardcoded to `0` — literally no
 * slippage protection at all: a trade landing after the pool moved (a
 * concurrent trade, or a large trade against a shallow pool) would just
 * silently accept whatever price resulted, with no floor to reject it.
 * Verified with `scripts/verify-amm-math.mts` against the same formula.
 */

export function applyFee(amount: bigint, feeBps: number): bigint {
  const fee = (amount * BigInt(feeBps)) / 10_000n;
  return amount - fee;
}

/** Constant-product swap output for `effectiveIn` against (reserveIn, reserveOut), floor division throughout — exact contract semantics. */
export function cpmmOut(reserveIn: bigint, reserveOut: bigint, effectiveIn: bigint): bigint {
  const k = reserveIn * reserveOut;
  const newReserveIn = reserveIn + effectiveIn;
  const newReserveOut = k / newReserveIn;
  return reserveOut - newReserveOut;
}

/**
 * Estimated `amount_out` for `buy(prediction, collateralAmount)` — the
 * bonus shares from swapping the unwanted side, on top of the
 * `collateralAmount` shares the implicit split always mints.
 */
export function estimateBuyOut(
  prediction: 'Yes' | 'No',
  collateralAmount: bigint,
  poolYes: bigint,
  poolNo: bigint,
  feeBps: number,
): bigint {
  const [reserveIn, reserveOut] = prediction === 'Yes' ? [poolNo, poolYes] : [poolYes, poolNo];
  const effectiveIn = applyFee(collateralAmount, feeBps);
  return cpmmOut(reserveIn, reserveOut, effectiveIn);
}

/**
 * Applies a slippage tolerance (in bps, e.g. 200 = 2%) to an estimate to
 * get a `min_*_out` floor: if the actual on-chain result is worse than
 * this by the time the transaction lands, the call reverts instead of
 * silently accepting a worse price.
 */
export function withSlippageTolerance(estimate: bigint, toleranceBps: number): bigint {
  return (estimate * BigInt(10_000 - toleranceBps)) / 10_000n;
}
