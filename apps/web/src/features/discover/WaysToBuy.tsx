"use client";
import { ArrowUpRight, PackageCheck } from "lucide-react";
import type { PurchaseRoute } from "@mirra/shared-types";
import { buttonClasses } from "@mirra/ui";
import { recordEvent } from "./events";
import { formatMoney } from "./format";
import { LandedCostTable } from "./ResultCard";

/** Purchasing-agent routes (e.g. KakoBuy) with their delivered-cost breakdown or why they're unavailable. */
export function RouteCard({
  route,
  listingId,
}: {
  route: PurchaseRoute;
  listingId?: string | null;
}) {
  const lc = route.landed_cost;
  return (
    <article
      aria-label={`Buy via ${route.name}`}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-ink">
          <PackageCheck className="size-4" aria-hidden="true" /> {route.name}
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
            Buying agent
          </span>
        </p>
        {route.available && route.url ? (
          <a
            href={route.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => recordEvent("clicked_out", listingId)}
            className={buttonClasses("primary", "sm")}
          >
            Buy via {route.name} <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {!route.available ? (
        <p className="text-[13px] leading-relaxed text-ink-soft">{route.unavailable_reason}</p>
      ) : (
        <>
          {lc ? (
            <div className="flex flex-col gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px]">
              <p className="tabular font-medium text-ink">
                Delivered via {route.name} {lc.complete ? "≈" : "from ≈"}{" "}
                {formatMoney(lc.total_known)}
                {!lc.complete ? (
                  <span className="font-normal text-muted"> + unknown costs</span>
                ) : null}
              </p>
              <LandedCostTable lc={lc} />
            </div>
          ) : null}
          <ul className="list-disc pl-4 text-[12px] leading-relaxed text-muted">
            {(route.notes ?? []).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {route.terms_checked ? (
            <p className="text-[11px] text-muted">
              Fees as published by {route.name}, checked {route.terms_checked}.
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}
