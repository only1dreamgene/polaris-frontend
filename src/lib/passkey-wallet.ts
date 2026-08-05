import { api } from './api';
import { hexToBytes, registerPasskey, signWithPasskey } from './webauthn';

const STORAGE_KEY = 'polaris.passkeyWallet';

export interface StoredWallet {
  credentialId: string;
  address: string;
}

export function loadStoredWallet(): StoredWallet | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredWallet) : null;
}

function saveStoredWallet(wallet: StoredWallet): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
}

/**
 * First-time onboarding: register a passkey, then have the backend deploy
 * (and pay for) a smart-wallet contract for its public key. No XLM, no
 * browser extension — just a Face ID/Touch ID prompt.
 */
export async function createPasskeyWallet(displayName: string): Promise<StoredWallet> {
  const identity = await registerPasskey(displayName);
  const { address } = await api.deployWallet(identity.publicKeyHex);
  const wallet: StoredWallet = { credentialId: identity.credentialId, address };
  saveStoredWallet(wallet);
  return wallet;
}

/**
 * Runs a market contract call authorized by the stored passkey wallet:
 * prepare (simulate + get the exact bytes to sign) → passkey signs (a real
 * Face ID/Touch ID prompt) → submit (backend attaches the signature, pays
 * the fee, and submits). See `polaris-oracle`'s `AuthRelayService` for the
 * server half of this protocol.
 */
export async function callAsWallet(
  wallet: StoredWallet,
  contractId: string,
  functionName: 'buy' | 'sell' | 'split' | 'merge' | 'transfer' | 'redeem',
  args: Record<string, string | number>,
): Promise<{ txHash: string }> {
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
