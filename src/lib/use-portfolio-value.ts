import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useWallet } from './wallet-provider';
import { markToMarket, redeemableValue, type MarketStatus } from './portfolio';

/**
 * Total value (in stroops) of every open or redeemable position the current
 * wallet holds, across every market — same math as the portfolio page's
 * per-row value, summed. Powers the header's position pill so a signed-in
 * user can see "am I in anything, and is it worth anything" without a trip
 * to /bets. Returns `null` while still loading or with no wallet connected.
 */
export function usePortfolioValue(): { total: bigint; hasPosition: boolean } | null {
  const { wallet } = useWallet();
  const { data: markets } = useQuery({ queryKey: ['markets'], queryFn: api.listMarkets, enabled: !!wallet });

  const results = useQueries({
    queries: (markets ?? []).map((m) => ({
      queryKey: ['portfolio-row', m.contractId, wallet?.address],
      queryFn: async () => {
        const [state, position] = await Promise.all([
          api.getMarketState(m.contractId),
          api.getPosition(m.contractId, wallet!.address),
        ]);
        const pos = { yes: BigInt(position.yes), no: BigInt(position.no) };
        if (pos.yes === 0n && pos.no === 0n) return 0n;
        const status = state.status as MarketStatus;
        if (status !== 'Open') return redeemableValue(status, pos);
        const price = await api.getPrice(m.contractId);
        return markToMarket(pos, price.yesBps, price.noBps);
      },
      enabled: !!wallet,
      refetchInterval: 20_000,
    })),
  });

  if (!wallet || !markets) return null;
  if (results.some((r) => r.isLoading)) return null;

  const values = results.map((r) => (r.data as bigint | undefined) ?? 0n);
  const total = values.reduce((sum, v) => sum + v, 0n);
  return { total, hasPosition: values.some((v) => v > 0n) };
}
