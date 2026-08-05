// Run: node scripts/verify-portfolio-math.mts
import { redeemableValue, markToMarket, didWin, type Position } from '../src/lib/portfolio.ts';

let failures = 0;
function assertEq(actual: unknown, expected: unknown, msg: string) {
  const ok = actual === expected;
  console.log(`${ok ? 'ok' : 'FAIL'}: ${msg} (got ${actual}, want ${expected})`);
  if (!ok) failures++;
}

const pos: Position = { yes: 1_000n, no: 400n };

assertEq(redeemableValue('Open', pos), 0n, 'open market redeems nothing');
assertEq(redeemableValue('ResolvedYes', pos), 1_000n, 'resolved-yes pays the yes balance');
assertEq(redeemableValue('ResolvedNo', pos), 400n, 'resolved-no pays the no balance');
assertEq(redeemableValue('Cancelled', pos), 1_400n, 'cancelled pays both sides at par');

// 70% yes / 30% no implied odds
assertEq(markToMarket(pos, 7_000, 3_000), 700n + 120n, 'mark-to-market weights each side by its price');
assertEq(markToMarket({ yes: 0n, no: 0n }, 5_000, 5_000), 0n, 'empty position marks to zero');

assertEq(didWin('ResolvedYes', pos), true, 'holding a nonzero yes balance when yes resolves is a win');
assertEq(didWin('ResolvedNo', pos), true, 'holding a nonzero no balance when no resolves is a win');
assertEq(didWin('ResolvedYes', { yes: 0n, no: 400n }), false, 'zero yes balance when yes resolves is a loss');
assertEq(didWin('Open', pos), null, 'win/loss is undefined pre-resolution');
assertEq(didWin('Cancelled', pos), null, 'win/loss is undefined on cancellation');

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed.');
