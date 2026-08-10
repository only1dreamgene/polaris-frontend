'use client';

import { use, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useWallet } from '@/lib/wallet-provider';
import { callAsWallet } from '@/lib/passkey-wallet';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OddsBar } from '@/components/odds-bar';
import { EmbedCodeButton } from '@/components/embed-code-button';
import { centsToUsd, formatCountdown, statusLabel, stroopsToXlm, xlmToStroops } from '@/lib/format';
import { redeemableValue, type MarketStatus } from '@/lib/portfolio';
import { estimateBuyOut, withSlippageTolerance } from '@/lib/amm';

/** 2% — how much worse a fill is allowed to be than the quote at click-time before the trade reverts instead of silently eating the difference. */
const SLIPPAGE_TOLERANCE_BPS = 200;

const STEP_LABEL: Record<string, string> = {
  passkey: 'Confirm with Face ID / Touch ID…',
  deploying: 'Setting up your account on-chain…',
  done: 'Ready',
};

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { wallet, connecting, creationStep, error: walletError, createWallet, cancelCreation } = useWallet();
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
  const { data: fee } = useQuery({
    queryKey: ['fee', id],
    queryFn: () => api.getFee(id),
    enabled: market?.status === 'watching',
    refetchInterval: 15_000,
  });
  const { data: position } = useQuery({
    queryKey: ['position', id, wallet?.address],
    queryFn: () => api.getPosition(id, wallet!.address),
    enabled: !!wallet,
  });

  const payoutPreview = useMemo(() => {
    if (!state || !fee) return null;
    try {
      const stroops = xlmToStroops(amount);
      if (stroops <= 0n) return null;
      const bonus = estimateBuyOut(side, stroops, BigInt(state.poolYes), BigInt(state.poolNo), fee.feeBps);
      return stroopsToXlm((stroops + bonus).toString());
    } catch {
      return null;
    }
  }, [amount, side, state, fee]);

  if (!market) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  const isOpen = market.status === 'watching';

  async function handleTrade() {
    if (!state || !fee) return;
    setTxError(null);
    setTxResult(null);

    // No wallet yet — the passkey ceremony only fires now, at the moment of
    // commit, so a visitor can pick a side, an amount, and see the payout
    // before ever touching auth. `createWallet` returns the fresh wallet
    // directly rather than relying on `wallet` from context, which won't
    // reflect the new value until the next render.
    let activeWallet = wallet;
    if (!activeWallet) {
      activeWallet = await createWallet('polaris-bettor');
      if (!activeWallet) return; // failed/cancelled — `walletError` from context already explains why
    }

    setBusy(true);
    try {
      const stroops = xlmToStroops(amount);
      const estimate = estimateBuyOut(
        side,
        stroops,
        BigInt(state.poolYes),
        BigInt(state.poolNo),
        fee.feeBps,
      );
      const minSharesOut = withSlippageTolerance(estimate, SLIPPAGE_TOLERANCE_BPS);
      const { txHash } = await callAsWallet(activeWallet, id, 'buy', {
        prediction: side,
        collateral_amount: stroops.toString(),
        min_shares_out: minSharesOut.toString(),
      });
      setTxResult(txHash);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['position', id, activeWallet.address] }),
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
      await queryClient.invalidateQueries({ queryKey: ['position', id, wallet.address] });
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
    <div className="grid grid-cols-1 gap-6 pb-56 lg:grid-cols-3 lg:pb-0">
      <div className="lg:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">XLM/USD</span>
          <Badge>{statusLabel(market.status)}</Badge>
        </div>
        <h1 className="mb-3 text-2xl font-bold">
          Will XLM be ≥ {centsToUsd(market.strikePriceCents)} by expiry?
        </h1>

        <div className="mb-4">
          <EmbedCodeButton contractId={id} />
        </div>

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
              <div className="font-semibold">{isOpen ? formatCountdown(market.expiry) : statusLabel(market.status)}</div>
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
                  <div className="text-[var(--faint)]">Fee now</div>
                  <div className="font-semibold">
                    {fee ? `${(fee.feeBps / 100).toFixed(2)}%` : '…'}
                  </div>
                  <div className="text-xs text-[var(--faint)]">
                    {(state.baseFeeBps / 100).toFixed(2)}% → {(state.minFeeBps / 100).toFixed(2)}% as volume grows
                  </div>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--bg)] px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <Card className="max-h-[70vh] overflow-y-auto rounded-none border-0 bg-transparent shadow-none lg:max-h-none lg:overflow-visible lg:rounded-2xl lg:border lg:border-[var(--line)] lg:bg-[var(--surface)] lg:shadow-sm">
          <CardBody className="p-0 lg:p-5">
            {!isOpen ? (
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

                <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-sm">
                  {payoutPreview ? (
                    <>
                      You get <span className="font-semibold">{payoutPreview} XLM</span> if {side.toUpperCase()}{' '}
                      wins <span className="text-[var(--faint)]">(you stake {amount || '0'} XLM)</span>
                    </>
                  ) : (
                    <span className="text-[var(--faint)]">Enter an amount to see your payout</span>
                  )}
                </div>

                <Button
                  className="w-full"
                  variant={side === 'Yes' ? 'yes' : 'no'}
                  onClick={handleTrade}
                  disabled={busy || connecting || !state || !fee || !payoutPreview}
                >
                  {connecting
                    ? creationStep
                      ? STEP_LABEL[creationStep]
                      : 'Setting up…'
                    : busy
                      ? wallet?.kind === 'email'
                        ? 'Placing bet…'
                        : 'Confirm with passkey…'
                      : `Buy ${side}`}
                </Button>
                {connecting && (
                  <button
                    type="button"
                    onClick={cancelCreation}
                    className="block w-full text-center text-xs text-[var(--muted)] underline hover:text-[var(--ink)]"
                  >
                    Cancel
                  </button>
                )}
                {!wallet && !connecting && (
                  <p className="text-center text-[11px] text-[var(--faint)]">
                    No XLM needed &mdash; just Face ID / Touch ID, the first time you buy
                  </p>
                )}
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
            {(txError || walletError) && (
              <p className="mt-3 text-xs text-[var(--no)] break-all">{txError ?? walletError}</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
