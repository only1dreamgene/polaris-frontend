import { api } from './api';
import { hexToBytes, registerPasskey, signWithPasskey } from './webauthn';

const STORAGE_KEY = 'polaris.passkeyWallet';

/**
 * Two ways a user ends up with a usable Soroban address, sharing the same
 * on-chain wallet contract and the same `callAsWallet` trade path — see
 * `wallet-provider.tsx`'s doc comment for why the email path exists.
 * `'passkey'` persists in localStorage (the credential lives in the
 * browser/OS, this is just a pointer to it); `'email'` persists as an
 * httpOnly session cookie instead, so there's nothing to store client-side
 * beyond the address itself for display.
 */
export type StoredWallet =
  | { kind: 'passkey'; credentialId: string; address: string }
  | { kind: 'email'; address: string };

export function loadStoredWallet(): StoredWallet | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as StoredWallet | { credentialId: string; address: string };
  // Wallets saved before the `kind` field existed are always passkey wallets.
  return 'kind' in parsed ? parsed : { kind: 'passkey', ...parsed };
}

function saveStoredWallet(wallet: StoredWallet): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
}

export function clearStoredWallet(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export type WalletCreationStep = 'passkey' | 'deploying' | 'done';

/**
 * First-time onboarding: register a passkey, then have the backend deploy
 * (and pay for) a smart-wallet contract for its public key. No XLM, no
 * browser extension — just a Face ID/Touch ID prompt.
 *
 * `onStep` reports which of the two real waits is in flight, so the UI can
 * narrate what's happening instead of showing one opaque spinner across
 * both a biometric prompt and an on-chain deployment (the latter alone
 * takes several seconds on testnet).
 */
export async function createPasskeyWallet(
  displayName: string,
  onStep?: (step: WalletCreationStep) => void,
  signal?: AbortSignal,
): Promise<StoredWallet> {
  onStep?.('passkey');
  const identity = await registerPasskey(displayName, signal);
  onStep?.('deploying');
  const { address } = await api.deployWallet(identity.publicKeyHex);
  // Best-effort: a fresh wallet holds 0 XLM and `buy` pulls its collateral
  // straight from it, so without this a brand-new passkey wallet deploys
  // fine and then fails its very first trade. Never block onboarding on
  // Friendbot being slow/down — an unfunded wallet is still usable once
  // funded another way.
  await api.faucet(address).catch(() => {});
  const wallet: StoredWallet = { kind: 'passkey', credentialId: identity.credentialId, address };
  saveStoredWallet(wallet);
  onStep?.('done');
  return wallet;
}

/**
 * Runs a market contract call authorized by the stored wallet.
 *
 * - `'passkey'`: prepare (simulate + get the exact bytes to sign) → passkey
 *   signs in the browser (a real Face ID/Touch ID prompt) → submit (backend
 *   attaches the signature, pays the fee, and submits). See
 *   `polaris-oracle`'s `AuthRelayService` for the server half.
 * - `'email'`: a single call to `/auth/email/trade` — the backend does the
 *   same prepare/sign/submit sequence itself, signing with the session's
 *   custodial key (see `EmailAuthService`) instead of prompting a browser
 *   ceremony that has nowhere to happen.
 */
export async function callAsWallet(
  wallet: StoredWallet,
  contractId: string,
  functionName: 'buy' | 'sell' | 'split' | 'merge' | 'transfer' | 'redeem',
  args: Record<string, string | number>,
): Promise<{ txHash: string }> {
  if (wallet.kind === 'email') {
    return api.emailTrade({ contractId, function: functionName, args });
  }

  const prepared = await api.prepareAuth({
    walletAddress: wallet.address,
    contractId,
    function: functionName,
    args,
  });

  const assertion = await signWithPasskey(hexToBytes(prepared.signaturePayloadHex), wallet.credentialId);

  return api.submitAuth({
    entryXdr: prepared.entryXdr,
    validUntilLedgerSeq: prepared.validUntilLedgerSeq,
    contractId,
    function: functionName,
    args,
    assertion,
  });
}
