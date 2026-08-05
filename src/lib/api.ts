import { config } from './config';
import type { WebAuthnAssertion } from './webauthn';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.oracleUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
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

export const api = {
  listMarkets: () => request<WatchedMarket[]>('/markets'),
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
};
