import { config } from './config';
import type { WebAuthnAssertion } from './webauthn';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.oracleUrl}${path}`, {
    ...init,
    // Needed for the email-login session cookie (httpOnly, set by the
    // backend) to be sent on same-site-but-cross-origin requests like
    // localhost:3000 -> localhost:3001. Harmless for every other endpoint,
    // which simply has no cookie to send.
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body}`) as ApiError;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export type ApiError = Error & { status?: number };

/** True only for a real "this key is wrong/missing" response — see `AdminGuard`, which throws `UnauthorizedException` (401) specifically so callers like `AdminKeyProvider`'s probe can rely on this rather than guessing from a generic network failure. */
export function isUnauthorized(err: unknown): boolean {
  return (err as ApiError)?.status === 401;
}

function adminGet<T>(path: string, adminKey: string): Promise<T> {
  return request<T>(path, { headers: { 'x-admin-key': adminKey } });
}

/** `request()` above throws a generic `METHOD /path failed: 400 {...}` error — pull the backend's own message out of the JSON body when possible instead of showing that raw text to a user. */
export function messageFromApiError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  const jsonStart = message.indexOf('{');
  if (jsonStart === -1) return message;
  try {
    const body = JSON.parse(message.slice(jsonStart)) as { message?: string };
    return body.message ?? message;
  } catch {
    return message;
  }
}

export interface WatchedMarket {
  contractId: string;
  strikePriceCents: string;
  expiry: number;
  gracePeriodSecs: number;
  feedId: number;
  status: 'watching' | 'settling' | 'settled' | 'cancelling' | 'cancelled' | 'pending';
  lastError?: string;
  settleTxHash?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OnChainMarket {
  admin: string;
  collateral: string;
  strikePrice: string;
  expiry: string;
  gracePeriod: string;
  lazerContract: string;
  feedId: number;
  baseFeeBps: number;
  minFeeBps: number;
  treasury: string;
  status: 'Open' | 'ResolvedYes' | 'ResolvedNo' | 'Cancelled';
  finalPrice: string;
  poolYes: string;
  poolNo: string;
  totalSupply: string;
  initialLiquidity: string;
}

export interface AdminOverview {
  totalMarkets: number;
  marketsByStatus: Record<string, number>;
  vaultBalanceStroops: string | null;
  totalWalletActions: number;
  settlementChecksByOutcome: { ok: number; skipped: number; failed: number };
}

export interface AdminFeeRevenue {
  totalStroops: string;
  byMarket: { contractId: string; stroops: string }[];
  sampleSize: number;
}

export interface VaultFlow {
  id: number;
  vault_contract_id: string;
  amount_stroops: string;
  market_contract_id: string;
  tx_hash: string;
  created_at: number;
}

export type AdminTreasury =
  | { configured: false }
  | {
      configured: true;
      vaultContract: string;
      balanceStroops: string;
      totalDepositedStroops: string;
      recentWithdrawals: VaultFlow[];
    };

export interface AdminWallets {
  passkeyAddressesSeen: string[];
  emailWallets: { email: string; address: string; createdAt: number }[];
}

export interface AdminNetwork {
  status: string;
  latestLedger: number;
  oldestLedger: number;
  ledgerRetentionWindow: number;
  oraclePublicKey: string;
  deployerPublicKey: string;
  contracts: Record<string, string | undefined>;
  wasmHashes: Record<string, string | undefined>;
}

export interface SettlementCheck {
  id: number;
  market_contract_id: string;
  lazer_price_cents: string | null;
  hermes_price_cents: string | null;
  divergence_bps: number | null;
  outcome: 'ok' | 'skipped' | 'failed';
  reason: string | null;
  created_at: number;
}

export const api = {
  listMarkets: () => request<WatchedMarket[]>('/markets'),
  /** Every tracked market for one feed, newest first — used to find a resolved market's auto-rolled successor (see MarketFactoryService in polaris-oracle). */
  listMarketsForFeed: (feedId: number) => request<WatchedMarket[]>(`/markets?feedId=${feedId}`),
  getMarket: (id: string) => request<WatchedMarket>(`/markets/${id}`),
  getMarketState: (id: string) => request<OnChainMarket>(`/markets/${id}/state`),
  getPosition: (id: string, address: string) =>
    request<{ yes: string; no: string }>(`/markets/${id}/position?address=${encodeURIComponent(address)}`),
  getPrice: (id: string) => request<{ yesBps: number; noBps: number }>(`/markets/${id}/price`),
  getFee: (id: string) => request<{ feeBps: number }>(`/markets/${id}/fee`),
  getTickerPrice: (feedId: string) => request<unknown>(`/prices/${feedId}`),

  faucet: (address: string) =>
    request<{ funded: boolean; alreadyExists: boolean }>('/markets/faucet', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),

  deployWallet: (publicKeyHex: string) =>
    request<{ address: string }>('/wallets/deploy', {
      method: 'POST',
      body: JSON.stringify({ publicKeyHex }),
    }),

  prepareAuth: (params: {
    walletAddress: string;
    contractId: string;
    function: string;
    args: Record<string, string | number>;
  }) =>
    request<{ entryXdr: string; signaturePayloadHex: string; validUntilLedgerSeq: number }>(
      '/wallets/tx/prepare',
      { method: 'POST', body: JSON.stringify(params) },
    ),

  submitAuth: (params: {
    entryXdr: string;
    validUntilLedgerSeq: number;
    contractId: string;
    function: string;
    args: Record<string, string | number>;
    assertion: WebAuthnAssertion;
  }) => request<{ txHash: string }>('/wallets/tx/submit', { method: 'POST', body: JSON.stringify(params) }),

  // email login (fallback for browsers/webviews without usable WebAuthn — see `wallet-provider.tsx`)
  requestEmailCode: (email: string) =>
    request<{ sent: boolean }>('/auth/email/request', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyEmailCode: (email: string, code: string) =>
    request<{ address: string }>('/auth/email/verify', { method: 'POST', body: JSON.stringify({ email, code }) }),
  getEmailSession: () => request<{ email: string; address: string }>('/auth/email/me'),
  emailLogout: () => request<{ ok: boolean }>('/auth/email/logout', { method: 'POST' }),
  emailTrade: (params: { contractId: string; function: string; args: Record<string, string | number> }) =>
    request<{ txHash: string }>('/auth/email/trade', { method: 'POST', body: JSON.stringify(params) }),

  // admin
  createMarket: (adminKey: string, body: Record<string, unknown>) =>
    request<WatchedMarket & { initTxHash: string }>('/markets/create', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey },
      body: JSON.stringify(body),
    }),
  triggerSettle: (adminKey: string, id: string) =>
    request<WatchedMarket>(`/markets/${id}/settle`, { method: 'POST', headers: { 'x-admin-key': adminKey } }),
  triggerCancel: (adminKey: string, id: string) =>
    request<WatchedMarket>(`/markets/${id}/cancel`, { method: 'POST', headers: { 'x-admin-key': adminKey } }),

  // admin dashboard — every call here is what AdminKeyProvider's gate probes with
  getAdminOverview: (adminKey: string) => adminGet<AdminOverview>('/admin/overview', adminKey),
  getAdminFeeRevenue: (adminKey: string) => adminGet<AdminFeeRevenue>('/admin/fee-revenue', adminKey),
  getAdminTreasury: (adminKey: string) => adminGet<AdminTreasury>('/admin/treasury', adminKey),
  getAdminWallets: (adminKey: string) => adminGet<AdminWallets>('/admin/wallets', adminKey),
  getAdminNetwork: (adminKey: string) => adminGet<AdminNetwork>('/admin/network', adminKey),
  getAdminSettlementChecks: (adminKey: string) =>
    adminGet<{ checks: SettlementCheck[] }>('/admin/settlement-checks', adminKey),
};
