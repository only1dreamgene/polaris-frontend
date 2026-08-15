const STROOPS_PER_XLM = 10_000_000n;

/** Native XLM (and this market's collateral/shares) use 7 decimal places. */
export function stroopsToXlm(stroops: string | bigint, fractionDigits = 2): string {
  const value = typeof stroops === 'string' ? BigInt(stroops) : stroops;
  const whole = value / STROOPS_PER_XLM;
  const frac = value % STROOPS_PER_XLM;
  const fracStr = frac.toString().padStart(7, '0').slice(0, fractionDigits);
  return `${whole.toString()}.${fracStr}`;
}

export function xlmToStroops(xlm: string): bigint {
  const [whole, frac = ''] = xlm.trim().split('.');
  const fracPadded = (frac + '0000000').slice(0, 7);
  return BigInt(whole || '0') * STROOPS_PER_XLM + BigInt(fracPadded || '0');
}

export function centsToUsd(cents: string | bigint): string {
  const value = typeof cents === 'string' ? BigInt(cents) : cents;
  const whole = value / 100n;
  const frac = (value % 100n).toString().padStart(2, '0');
  return `$${whole.toString()}.${frac}`;
}

export function formatCountdown(expiryUnixSecs: number): string {
  const diff = expiryUnixSecs * 1000 - Date.now();
  if (diff <= 0) return 'expired';
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const STATUS_LABELS: Record<string, string> = {
  watching: 'Open',
  pending: 'Settling',
  settling: 'Settling',
  cancelling: 'Cancelling',
  settled: 'Settled',
  cancelled: 'Cancelled',
};

/** Backend/on-chain status strings are internal names (e.g. "watching") — this is what a customer should read instead. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** While a tracked market is still open or mid-settlement, worth polling frequently so a resolution is caught within seconds instead of on next page load — see `components/result-reveal.tsx`. Once genuinely terminal (settled/cancelled), nothing about it changes again, so polling stops. */
export function isPollableStatus(status: string | undefined): boolean {
  return status === 'watching' || status === 'pending';
}

/** Short-interval polling isn't real push (no websocket/SSE exists) — frequent enough to feel near-instant around an expiry without hammering the backend indefinitely. */
export const RESOLUTION_POLL_MS = 8_000;
