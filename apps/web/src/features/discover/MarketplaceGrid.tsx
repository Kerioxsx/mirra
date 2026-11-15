"use client";
import type { MarketplaceInfo } from "@mirra/shared-types";
import { Badge, Spinner } from "@mirra/ui";
import { useMarketplaces } from "./useMarketplaces";

const STATUS: Record<
  MarketplaceInfo["status"],
  { label: string; tone: "success" | "outline" | "danger" | "neutral" }
> = {
  active: { label: "Live", tone: "success" },
  planned: { label: "Planned", tone: "outline" },
  blocked: { label: "Needs partnership", tone: "danger" },
  disabled: { label: "Off", tone: "neutral" },
};

const INTEGRATION: Record<MarketplaceInfo["integration_type"], string> = {
  official_api: "Official API",
  affiliate_feed: "Affiliate feed",
  partner_api: "Partner API",
  demo: "Demo data",
};

export function MarketplaceGrid() {
  const state = useMarketplaces();
  if (state.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-[14px] text-muted">
        <Spinner className="size-4" /> Checking marketplaces…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p
        role="alert"
        className="rounded-xl border border-line-strong p-4 text-[14px] text-ink-soft"
      >
        Can&apos;t reach the Mirra API right now, so marketplace status is unavailable.
      </p>
    );
  }
  return (
    <ul className="grid gap-px overflow-hidden rounded-[var(--mirra-radius)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
      {state.data.map((m) => (
        <li key={m.id} className="flex flex-col gap-2 bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-xl text-ink">{m.name}</p>
            <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            {INTEGRATION[m.integration_type]}
          </p>
          {m.notes ? <p className="text-[13px] leading-relaxed text-ink-soft">{m.notes}</p> : null}
        </li>
      ))}
      {/* fill the last row so no empty grid gap shows through */}
      {Array.from({ length: (3 - (state.data.length % 3)) % 3 }, (_, i) => (
        <li key={`lg${i}`} aria-hidden="true" className="hidden bg-surface lg:block" />
      ))}
      {Array.from({ length: state.data.length % 2 }, (_, i) => (
        <li key={`sm${i}`} aria-hidden="true" className="hidden bg-surface sm:block lg:hidden" />
      ))}
    </ul>
  );
}
