// Run: node --experimental-strip-types scripts/verify-amm-math.mts
import { estimateBuyOut, withSlippageTolerance } from '../src/lib/amm.ts';

let failures = 0;
function assertEq(actual: unknown, expected: unknown, msg: string) {
  const ok = actual === expected;
  console.log(`${ok ? 'ok' : 'FAIL'}: ${msg} (got ${actual}, want ${expected})`);
  if (!ok) failures++;
}

// Cross-checked by hand against the contract's own cpmm_out formula:
// pool_yes=pool_no=10_000, fee=100bps (1%), buy 1000 YES.
// effective_in = 1000 - 1000*100/10000 = 990
// k = 10_000*10_000 = 100_000_000
// new_reserve_in = 10_000+990 = 10_990
// new_reserve_out = 100_000_000 / 10_990 = 9_099 (floor)
// amount_out = 10_000 - 9_099 = 901
const out = estimateBuyOut('Yes', 1_000n, 10_000n, 10_000n, 100);
assertEq(out, 901n, 'buy 1000 YES against a symmetric 10_000/10_000 pool at 1% fee');

// Buying NO should swap the YES reserve away instead — symmetric pool means
// the same numeric result, just mirrored.
const outNo = estimateBuyOut('No', 1_000n, 10_000n, 10_000n, 100);
assertEq(outNo, 901n, 'buy 1000 NO against the same symmetric pool gives the mirrored result');

// A larger buy against the same pool should get a *worse* per-unit price
// (a real AMM property — sanity check the curve isn't flat). Compare
// output-per-collateral ratios: smallOut/100 vs bigOut/10_000, cross-
// multiplied to stay in integer math: smallOut*10_000 vs bigOut*100.
const smallOut = estimateBuyOut('Yes', 100n, 10_000n, 10_000n, 100);
const bigOut = estimateBuyOut('Yes', 10_000n, 10_000n, 10_000n, 100);
assertEq(
  smallOut * 10_000n > bigOut * 100n,
  true,
  'larger trades get worse per-unit price (real slippage, not a flat rate)',
);

// Slippage tolerance floor: 2% tolerance on an estimate of 901 -> 98% of 901.
assertEq(withSlippageTolerance(901n, 200), (901n * 9_800n) / 10_000n, '2% tolerance floor matches manual calc');
assertEq(withSlippageTolerance(901n, 0), 901n, '0% tolerance is a no-op');

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed.');
