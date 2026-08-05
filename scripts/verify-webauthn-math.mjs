// Standalone verification for the DER→raw-r‖s + low-S normalization logic
// in src/lib/webauthn.ts. The frontend has no test framework (see repo
// README); this is the "verify pure logic under node" pattern for the one
// piece of crypto math in this codebase that isn't already covered by a
// contract-side test (contracts/smart-wallet/src/test.rs verifies the
// *contract* accepts a low-S signature; this verifies the *browser-side*
// conversion that produces one from what WebAuthn actually returns).
//
// Run: node scripts/verify-webauthn-math.mjs
import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify } from 'node:crypto';

const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

function bytesToBigInt(bytes) {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) | BigInt(b);
  return result;
}

function bigIntTo32Bytes(value) {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

// Exact copy of the logic under test in src/lib/webauthn.ts's derToRawLowS.
function derToRawLowS(der) {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error('expected DER SEQUENCE');
  offset++;
  if (der[offset++] !== 0x02) throw new Error('expected INTEGER (r)');
  const rLen = der[offset++];
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  if (der[offset++] !== 0x02) throw new Error('expected INTEGER (s)');
  const sLen = der[offset++];
  const s = der.slice(offset, offset + sLen);
  offset += sLen;

  const rBig = bytesToBigInt(r);
  let sBig = bytesToBigInt(s);
  if (sBig > P256_N / 2n) sBig = P256_N - sBig;

  const out = new Uint8Array(64);
  out.set(bigIntTo32Bytes(rBig), 0);
  out.set(bigIntTo32Bytes(sBig), 32);
  return out;
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${msg}`);
  }
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const message = Buffer.from('polaris webauthn math check');

const N = 200;
let lowSCount = 0;
let negationBranchExercised = false;

for (let i = 0; i < N; i++) {
  const der = nodeSign('sha256', message, { key: privateKey }); // DER by default, S not normalized
  const rawFromDer = extractRawS(new Uint8Array(der));
  if (rawFromDer > P256_N / 2n) negationBranchExercised = true;

  const raw = derToRawLowS(new Uint8Array(der));
  assert(raw.length === 64, `raw signature #${i} is 64 bytes`);

  const s = bytesToBigInt(raw.slice(32));
  if (s <= P256_N / 2n) lowSCount++;

  // Cross-check: verify the RAW (ieee-p1363) signature against the same
  // message using Node's own verifier in ieee-p1363 mode — proves the
  // conversion preserved a valid signature, not just produced 64 bytes.
  const ok = nodeVerify(
    'sha256',
    message,
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(raw),
  );
  assert(ok, `converted raw signature #${i} verifies against the public key`);
}

console.log(`\n${lowSCount}/${N} signatures ended up low-S (should be ${N}/${N} after normalization)`);
assert(lowSCount === N, 'every converted signature is low-S');
assert(negationBranchExercised, 'the negation branch (s > n/2) was actually exercised at least once');

function extractRawS(der) {
  let offset = 3 + der[3] + 2; // past '30 len 02 rlen r..' to s's length byte
  const sLen = der[offset++];
  return bytesToBigInt(der.slice(offset, offset + sLen));
}

if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
}
