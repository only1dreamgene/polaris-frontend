'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { OddsBar } from '@/components/odds-bar';
import { centsToUsd, formatCountdown } from '@/lib/format';

function statusTone(status: string): 'yes' | 'no' | 'warn' | 'neutral' {
  if (status === 'settled') return 'yes';
  if (status === 'cancelled') return 'no';
  if (status === 'pending') return 'warn';
  return 'neutral';
}

function MarketCard({ contractId }: { contractId: string }) {
  const { data: market } = useQuery({
    queryKey: ['market', contractId],
    queryFn: () => api.getMarket(contractId),
  });
  const { data: price } = useQuery({
    queryKey: ['price', contractId],
    queryFn: () => api.getPrice(contractId),
    enabled: market?.status === 'watching',
    refetchInterval: 15_000,
  });

  if (!market) return null;

  return (
    <Link href={`/market/${contractId}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardBody>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
              XLM/USD
            </span>
            <Badge tone={statusTone(market.status)}>{market.status}</Badge>
          </div>
          <h3 className="mb-3 text-lg font-semibold">
            Will XLM be ≥ {centsToUsd(market.strikePriceCents)} by expiry?
          </h3>
          {price ? (
            <OddsBar yesBps={price.yesBps} noBps={price.noBps} />
          ) : (
            <div className="h-2 w-full rounded-full bg-[var(--surface-2)]" />
          )}
          <div className="mt-3 text-xs text-[var(--muted)]">
            {market.status === 'watching' ? `closes in ${formatCountdown(market.expiry)}` : 'closed'}
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { data: markets, isLoading, error } = useQuery({
    queryKey: ['markets'],
    queryFn: api.listMarkets,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Markets</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Predict XLM&rsquo;s price. Fully collateralized, settled on-chain by Pyth.
      </p>

      {isLoading && <p className="text-sm text-[var(--muted)]">Loading markets…</p>}
      {error && <p className="text-sm text-[var(--no)]">Couldn&rsquo;t reach the backend: {(error as Error).message}</p>}
      {markets && markets.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No markets yet — an admin can create one from /create.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {markets?.map((m) => (
          <MarketCard key={m.contractId} contractId={m.contractId} />
        ))}
      </div>
    </div>
  );
}
