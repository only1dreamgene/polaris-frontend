'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/lib/wallet-provider';
import { api } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { centsToUsd, stroopsToXlm } from '@/lib/format';
import { didWin, markToMarket, redeemableValue, type MarketStatus } from '@/lib/portfolio';

function PositionRow({ contractId }: { contractId: string }) {
  const { wallet } = useWallet();
  const { data: market } = useQuery({ queryKey: ['market', contractId], queryFn: () => api.getMarket(contractId) });
  const { data: state } = useQuery({ queryKey: ['state', contractId], queryFn: () => api.getMarketState(contractId) });
  const { data: position } = useQuery({
    queryKey: ['position', contractId, wallet?.address],
    queryFn: () => api.getPosition(contractId, wallet!.address),
    enabled: !!wallet,
  });
  const { data: price } = useQuery({
    queryKey: ['price', contractId],
    queryFn: () => api.getPrice(contractId),
    enabled: state?.status === 'Open',
  });

  if (!market || !state || !position) return null;
  const pos = { yes: BigInt(position.yes), no: BigInt(position.no) };
  if (pos.yes === 0n && pos.no === 0n) return null;

  const status = state.status as MarketStatus;
  const value =
    status === 'Open' && price ? markToMarket(pos, price.yesBps, price.noBps) : redeemableValue(status, pos);
  const win = didWin(status, pos);

  return (
    <Link href={`/market/${contractId}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardBody className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">
              Will XLM be ≥ {centsToUsd(market.strikePriceCents)}?
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {stroopsToXlm(pos.yes)} YES / {stroopsToXlm(pos.no)} NO
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">{stroopsToXlm(value)} XLM</div>
            <div className="mt-1">
              {win === true && <Badge tone="yes">won</Badge>}
              {win === false && <Badge tone="no">lost</Badge>}
              {win === null && <Badge tone={status === 'Open' ? 'accent' : 'neutral'}>{status === 'Open' ? 'mark-to-market' : status.toLowerCase()}</Badge>}
            </div>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

export default function PortfolioPage() {
  const { wallet } = useWallet();
  const { data: markets } = useQuery({ queryKey: ['markets'], queryFn: api.listMarkets });

  if (!wallet) {
    return <p className="text-sm text-[var(--muted)]">Sign in with a passkey to see your positions.</p>;
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Portfolio</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Values are marked at current implied price for open markets, or exact redeemable value once a
        market resolves or is cancelled — see{' '}
        <Link href="/docs" className="underline">
          docs
        </Link>{' '}
        for what this build does and doesn&rsquo;t track.
      </p>
      <div className="space-y-3">
        {markets?.map((m) => <PositionRow key={m.contractId} contractId={m.contractId} />)}
      </div>
    </div>
  );
}
