import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { derToRawLowS } from './webauthn';

/**
 * `derToRawLowS` is the one piece of crypto math in this codebase not
 * already covered by a contract-side test (`contracts/smart-wallet/src/
 * test.rs` verifies the *contract* accepts a low-S signature; this verifies
 * the *browser-side* conversion that produces one from what WebAuthn
 * actually returns). Generates and self-verifies genuine secp256r1
 * signatures rather than asserting against a stub — same bar the contract
 * test suite holds itself to.
 */

const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) | BigInt(b);
  return result;
}

function extractRawS(der: Uint8Array): bigint {
  let offset = 3 + der[3] + 2; // past '30 len 02 rlen r..' to s's length byte
  const sLen = der[offset++];
  return bytesToBigInt(der.slice(offset, offset + sLen));
}

describe('derToRawLowS', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const message = Buffer.from('polaris webauthn math check');

  it('converts 200 real DER signatures to valid, low-S-normalized raw signatures', () => {
    const N = 200;
    let lowSCount = 0;
    let negationBranchExercised = false;

    for (let i = 0; i < N; i++) {
      const der = nodeSign('sha256', message, { key: privateKey }); // DER by default, S not normalized
      if (extractRawS(new Uint8Array(der)) > P256_N / 2n) negationBranchExercised = true;

      const raw = derToRawLowS(new Uint8Array(der));
      expect(raw.length).toBe(64);

      const s = bytesToBigInt(raw.slice(32));
      if (s <= P256_N / 2n) lowSCount++;

      // Cross-check: verify the RAW (ieee-p1363) signature against the same
      // message using Node's own verifier — proves the conversion preserved
      // a valid signature, not just produced 64 bytes of the right shape.
      const ok = nodeVerify('sha256', message, { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(raw));
      expect(ok, `converted raw signature #${i} verifies against the public key`).toBe(true);
    }

    expect(lowSCount, 'every converted signature ends up low-S').toBe(N);
    expect(negationBranchExercised, 'the negation branch (s > n/2) was actually exercised at least once').toBe(
      true,
    );
  });
});
