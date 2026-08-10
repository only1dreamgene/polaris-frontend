import { config } from './config';

/**
 * Passkey (WebAuthn) registration and signing, producing the exact byte
 * shapes `polaris-smart-wallet`'s `__check_auth` expects. See that
 * contract's doc comment (in `polaris-contracts`) for the verification
 * side of this; the two load-bearing, non-obvious pieces mirrored here are:
 *
 * 1. The browser's `AuthenticatorAssertionResponse.signature` is
 *    DER-encoded ECDSA — the contract wants raw, fixed-width 32-byte r ‖
 *    32-byte s (64 bytes total).
 * 2. Soroban's `secp256r1_verify` rejects high-S signatures. DER decoding
 *    alone doesn't fix this — `s` must be explicitly replaced with `n - s`
 *    whenever `s > n/2`. This was confirmed empirically (not assumed) by
 *    the contract's own test suite; skipping it makes every real signature
 *    fail host verification roughly half the time for no visible reason.
 */

// NIST P-256 (secp256r1) curve order.
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export interface PasskeyIdentity {
  /** base64url, as returned by the authenticator — save this to target the same passkey on later sign-ins. */
  credentialId: string;
  /** 65-byte uncompressed secp256r1 SEC1 point (0x04 ‖ X ‖ Y), hex-encoded. */
  publicKeyHex: string;
}

export interface WebAuthnAssertion {
  authenticatorDataHex: string;
  clientDataJsonBase64: string;
  /** Raw 64-byte r ‖ s, low-S normalized. */
  signatureHex: string;
}

const WEBAUTHN_ERROR_MESSAGES: Record<string, string> = {
  NotAllowedError:
    "This browser couldn't complete the passkey prompt. Make sure Touch ID/Windows Hello is set up, or that you're signed into a Chrome/Safari profile with a passkey manager enabled, then try again.",
  SecurityError: "This page isn't allowed to use passkeys right now — that's a configuration issue on our end, not yours.",
  NotSupportedError: "Your browser doesn't support the passkey method this app needs — try updating it or switching browsers.",
  InvalidStateError: 'A passkey for this site already exists on this device. Try signing in instead of creating a new one.',
  ConstraintError: "This device's passkey method doesn't meet this app's security requirements.",
  UnknownError: 'Something went wrong talking to your passkey manager. Please try again.',
};

/**
 * `navigator.credentials.create/get` reject with a raw `DOMException` whose
 * `.message` is written for a spec, not a person (e.g. a literal link to
 * the WebAuthn spec's privacy-considerations section) — never show that
 * text directly. This maps the handful of names browsers actually throw to
 * something a user can act on; anything unrecognized falls back to a
 * generic retry message rather than leaking the raw exception.
 */
export function humanizeWebAuthnError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  return WEBAUTHN_ERROR_MESSAGES[name] ?? 'Could not set up your passkey. Please try again.';
}

/**
 * `signal` lets the caller abort a ceremony that never resolves — e.g. an
 * embedded webview (VS Code's Simple Browser, some in-app browsers) that
 * has no real platform-authenticator bridge, where `navigator.credentials
 * .create()` just hangs forever with no prompt and no rejection. The
 * `timeout` field below is only a hint to the *authenticator*; plenty of
 * environments ignore it, so the caller-side abort is what actually
 * guarantees this resolves.
 */
export async function registerPasskey(displayName: string, signal?: AbortSignal): Promise<PasskeyIdentity> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = (await navigator.credentials.create({
    signal,
    publicKey: {
      rp: { id: config.webauthnRpId, name: config.webauthnRpName },
      user: { id: userId, name: displayName, displayName },
      challenge,
      // ES256 only — the contract only implements secp256r1 verification.
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('passkey registration was cancelled');
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const spki = response.getPublicKey?.();
  if (!spki) {
    throw new Error('this browser/authenticator did not return a public key (getPublicKey unsupported)');
  }

  return {
    credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
    publicKeyHex: bytesToHex(spkiToRawEcPoint(new Uint8Array(spki))),
  };
}

/**
 * Prompts the passkey to sign `challenge` (32 bytes — for a transaction
 * authorization, this is the `signaturePayloadHex` bytes returned by
 * `POST /wallets/tx/prepare`). Pass `credentialId` to target a specific
 * previously-registered passkey; omit it to let the platform's picker
 * choose among any resident credential for this origin.
 */
export async function signWithPasskey(
  challenge: Uint8Array,
  credentialId?: string,
): Promise<WebAuthnAssertion> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as BufferSource,
      rpId: config.webauthnRpId,
      allowCredentials: credentialId
        ? [{ id: base64UrlToBytes(credentialId) as BufferSource, type: 'public-key' }]
        : undefined,
      userVerification: 'preferred',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('passkey signing was cancelled');
  }

  const response = credential.response as AuthenticatorAssertionResponse;
  const authenticatorData = new Uint8Array(response.authenticatorData);
  const clientDataJson = new Uint8Array(response.clientDataJSON);
  const rawSignature = derToRawLowS(new Uint8Array(response.signature));

  return {
    authenticatorDataHex: bytesToHex(authenticatorData),
    clientDataJsonBase64: bytesToBase64(clientDataJson),
    signatureHex: bytesToHex(rawSignature),
  };
}

/**
 * A P-256 SubjectPublicKeyInfo DER blob has a fixed structure — 26 bytes of
 * fixed algorithm-identifier prefix, then a BIT STRING whose content is the
 * raw uncompressed point — so the trailing 65 bytes are always the point,
 * with no need for a general ASN.1 parser. `getPublicKey()` is only called
 * with `alg: -7` (ES256/P-256) requested, so this shape is guaranteed.
 */
function spkiToRawEcPoint(spki: Uint8Array): Uint8Array {
  const point = spki.slice(spki.length - 65);
  if (point[0] !== 0x04) {
    throw new Error('unexpected public key encoding (expected an uncompressed EC point)');
  }
  return point;
}

/** DER `30 len 02 rlen r 02 slen s` → raw 32-byte r ‖ 32-byte s, s normalized to low-S. */
function derToRawLowS(der: Uint8Array): Uint8Array {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error('malformed signature: expected DER SEQUENCE');
  offset++; // total length (always short-form for a P-256 ECDSA signature)
  if (der[offset++] !== 0x02) throw new Error('malformed signature: expected INTEGER (r)');
  const rLen = der[offset++];
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  if (der[offset++] !== 0x02) throw new Error('malformed signature: expected INTEGER (s)');
  const sLen = der[offset++];
  const s = der.slice(offset, offset + sLen);
  offset += sLen;

  const rBig = bytesToBigInt(r);
  let sBig = bytesToBigInt(s);
  if (sBig > P256_N / 2n) {
    sBig = P256_N - sBig;
  }

  const out = new Uint8Array(64);
  out.set(bigIntTo32Bytes(rBig), 0);
  out.set(bigIntTo32Bytes(sBig), 32);
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b);
  }
  return result;
}

function bigIntTo32Bytes(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
