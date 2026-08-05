'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useWallet } from '@/lib/wallet-provider';
import { callAsWallet } from '@/lib/passkey-wallet';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OddsBar } from '@/components/odds-bar';
import { centsToUsd, formatCountdown, stroopsToXlm, xlmToStroops } from '@/lib/format';
import { redeemableValue, type MarketStatus } from '@/lib/portfolio';

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { wallet } = useWallet();
  const queryClient = useQueryClient();

  const [side, setSide] = useState<'Yes' | 'No'>('Yes');
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const { data: market } = useQuery({ queryKey: ['market', id], queryFn: () => api.getMarket(id) });
  const { data: price } = useQuery({
    queryKey: ['price', id],
    queryFn: () => api.getPrice(id),
    refetchInterval: 15_000,
    enabled: market?.status === 'watching',
  });
  const { data: state } = useQuery({
    queryKey: ['state', id],
    queryFn: () => api.getMarketState(id),
  });
  const { data: position, refetch: refetchPosition } = useQuery({
    queryKey: ['position', id, wallet?.address],
    queryFn: () => api.getPosition(id, wallet!.address),
    enabled: !!wallet,
  });

  if (!market) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  const isOpen = market.status === 'watching';

  async function handleTrade() {
    if (!wallet) return;
    setBusy(true);
    setTxError(null);
    setTxResult(null);
    try {
      const stroops = xlmToStroops(amount);
      const { txHash } = await callAsWallet(wallet, id, 'buy', {
        prediction: side,
        collateral_amount: stroops.toString(),
        min_shares_out: '0',
      });
      setTxResult(txHash);
      await Promise.all([
        refetchPosition(),
        queryClient.invalidateQueries({ queryKey: ['price', id] }),
      ]);
    } catch (err) {
      setTxError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRedeem() {
    if (!wallet) return;
    setBusy(true);
    setTxError(null);
    setTxResult(null);
    try {
      const { txHash } = await callAsWallet(wallet, id, 'redeem', {});
      setTxResult(txHash);
      await refetchPosition();
    } catch (err) {
      setTxError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pos = position ? { yes: BigInt(position.yes), no: BigInt(position.no) } : null;
  const onChainStatus = (state?.status ?? null) as MarketStatus | null;
  const canRedeem = pos && onChainStatus && onChainStatus !== 'Open' && redeemableValue(onChainStatus, pos) > 0n;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">XLM/USD</span>
          <Badge>{market.status}</Badge>
        </div>
        <h1 className="mb-4 text-2xl font-bold">
          Will XLM be ≥ {centsToUsd(market.strikePriceCents)} by expiry?
        </h1>

        {price && (
          <Card className="mb-4">
            <CardBody>
              <OddsBar yesBps={price.yesBps} noBps={price.noBps} />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardBody className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <div className="text-[var(--faint)]">Strike</div>
              <div className="font-semibold">{centsToUsd(market.strikePriceCents)}</div>
            </div>
            <div>
              <div className="text-[var(--faint)]">Status</div>
              <div className="font-semibold">{isOpen ? formatCountdown(market.expiry) : market.status}</div>
            </div>
            {state && (
              <>
                <div>
                  <div className="text-[var(--faint)]">Pool (YES/NO)</div>
                  <div className="font-semibold">
                    {stroopsToXlm(state.poolYes)} / {stroopsToXlm(state.poolNo)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--faint)]">Fee</div>
                  <div className="font-semibold">{(state.feeBps / 100).toFixed(2)}%</div>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div>
        <Card>
          <CardBody>
            {!wallet ? (
              <p className="text-sm text-[var(--muted)]">
                Sign in with a passkey (top right) to trade.
              </p>
            ) : !isOpen ? (
              <div>
                <p className="mb-3 text-sm text-[var(--muted)]">
                  Trading is closed. {pos && (pos.yes > 0n || pos.no > 0n) ? 'You can redeem your position.' : ''}
                </p>
                {canRedeem && (
                  <Button className="w-full" onClick={handleRedeem} disabled={busy}>
                    {busy ? 'Redeeming…' : 'Redeem'}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={side === 'Yes' ? 'yes' : 'outline'}
                    onClick={() => setSide('Yes')}
                  >
                    YES
                  </Button>
                  <Button variant={side === 'No' ? 'no' : 'outline'} onClick={() => setSide('No')}>
                    NO
                  </Button>
                </div>
                <label className="block text-xs font-medium text-[var(--muted)]">
                  Amount (XLM)
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <Button
                  className="w-full"
                  variant={side === 'Yes' ? 'yes' : 'no'}
                  onClick={handleTrade}
                  disabled={busy}
                >
                  {busy ? 'Confirm with passkey…' : `Buy ${side}`}
                </Button>
              </div>
            )}

            {pos && (
              <div className="mt-4 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
                Your position: {stroopsToXlm(pos.yes)} YES / {stroopsToXlm(pos.no)} NO
              </div>
            )}
            {txResult && (
              <p className="mt-3 text-xs text-[var(--yes)] break-all">Submitted: {txResult}</p>
            )}
            {txError && <p className="mt-3 text-xs text-[var(--no)] break-all">{txError}</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
