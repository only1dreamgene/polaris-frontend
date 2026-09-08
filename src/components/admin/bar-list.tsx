/**
 * A small, generic value-per-label bar list — genuinely new, not a reskin
 * of `odds-bar.tsx` (a fixed two-value split, a different shape from an
 * arbitrary-length ranked list). Used for Fee Revenue's per-market
 * breakdown and Overview's markets-by-status counts. No chart-library
 * dependency: this data is low-cardinality at this stage (a handful of
 * markets, modest trade volume on a testnet-stage app) — proportionate to
 * bars, not to bringing in zoom/tooltip/axis machinery a real chart lib
 * would add for no benefit yet.
 */
export function BarList({ items }: { items: { label: string; value: number; formattedValue: string }[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--faint)]">No data yet.</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <div className="min-w-0">
            <div className="mb-1 truncate font-mono text-xs text-[var(--muted)]">{item.label}</div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>
          <div className="whitespace-nowrap font-semibold tabular-nums">{item.formattedValue}</div>
        </div>
      ))}
    </div>
  );
}
