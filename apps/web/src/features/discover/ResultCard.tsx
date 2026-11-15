"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Heart, ImageOff, Shirt, Star } from "lucide-react";
import type { LandedCost, SearchResult } from "@mirra/shared-types";
import { AuthenticityBadge, Badge, buttonClasses, cn } from "@mirra/ui";
import { recordEvent } from "./events";
import { formatMoney } from "./format";

export function Price({ result }: { result: SearchResult }) {
  const l = result.listing;
  const converted =
    result.converted_price && l.price && result.converted_price.currency !== l.price.currency;
  const hasDiscount =
    l.list_price &&
    l.price &&
    Number(l.list_price.amount) > Number(l.price.amount) &&
    l.list_price.currency === l.price.currency;
  const estimate =
    l.estimated_final_price &&
    l.price &&
    Number(l.estimated_final_price.amount) < Number(l.price.amount)
      ? l.estimated_final_price
      : null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="tabular font-display text-[22px] leading-none text-ink">
          {formatMoney(l.price)}
        </span>
        {hasDiscount ? (
          <s className="tabular text-[12px] text-muted">{formatMoney(l.list_price)}</s>
        ) : null}
        {converted ? (
          <span
            className="tabular text-[13px] text-ink-soft"
            title="Converted at the daily reference rate"
          >
            {formatMoney(result.converted_price, { approx: true })}
          </span>
        ) : null}
      </p>
      {estimate ? (
        <p className="text-[12px] text-muted">
          {formatMoney(estimate, { approx: true })} with coupons{" "}
          <span className="text-[11px]">(marketplace estimate)</span>
        </p>
      ) : null}
    </div>
  );
}

export function LandedCostTable({ lc }: { lc: LandedCost }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
      {lc.components.map((c) => (
        <div key={c.label} className="contents">
          <dt className="text-ink-soft">
            {c.label}
            {c.note ? <span className="block text-[11px] text-muted">{c.note}</span> : null}
          </dt>
          <dd className="tabular text-right text-ink">
            {c.amount ? (
              formatMoney(c.amount, { approx: c.estimate })
            ) : (
              <span className="text-muted">Unknown</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CostBreakdown({ result, open }: { result: SearchResult; open?: boolean }) {
  const lc = result.landed_cost;
  const l = result.listing;
  if (!lc && !l.authenticity_reasons?.length && !l.promotion_tags?.length) return null;
  return (
    <details open={open} className="group/details rounded-xl bg-surface-2 px-3 py-2 text-[12.5px]">
      <summary className="cursor-pointer select-none list-none font-medium text-ink marker:hidden">
        {lc ? (
          <span className="tabular">
            Delivered {lc.complete ? "≈" : "from ≈"} {formatMoney(lc.total_known)}
            {!lc.complete ? <span className="font-normal text-muted"> + unknown costs</span> : null}
          </span>
        ) : (
          "Details"
        )}
        <span className="float-right text-muted group-open/details:rotate-180">⌄</span>
      </summary>
      <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
        {lc ? <LandedCostTable lc={lc} /> : null}
        {lc?.fx_as_of ? (
          <p className="text-[11px] text-muted">
            Converted with ECB reference rates of {lc.fx_as_of}.
          </p>
        ) : null}
        {l.authenticity_reasons?.length ? (
          <ul className="list-disc pl-4 text-[11.5px] text-ink-soft">
            {l.authenticity_reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
        {l.promotion_tags?.length ? (
          <p className="flex flex-wrap gap-1">
            {l.promotion_tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-soft"
              >
                {t}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function ResultCard({
  result,
  marketplaceName,
  onTryOn,
  saved = false,
  onToggleSave,
}: {
  result: SearchResult;
  marketplaceName: string;
  onTryOn: (result: SearchResult) => void;
  saved?: boolean;
  /** Undefined for guests: the heart then links to sign-in. */
  onToggleSave?: (result: SearchResult) => void;
}) {
  const l = result.listing;
  const [imgFailed, setImgFailed] = useState(false);
  const img = imgFailed ? undefined : l.image_urls?.[0];
  const replica = l.authenticity === "replica_advertised";
  return (
    <article
      aria-label={l.title}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border bg-surface",
        replica ? "border-danger/40" : "border-line",
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-surface-2">
        {img ? (
          // Marketplace images are shown as-is from their CDN, not proxied or stored.
          <img
            src={img}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[13px] text-muted">
            <ImageOff className="size-5" aria-hidden="true" />
            No photo from the marketplace
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {l.is_demo ? <Badge tone="accent">Demo data</Badge> : null}
          {l.store_badge && l.store_badge.toLowerCase() !== marketplaceName.toLowerCase() ? (
            <Badge tone="stage">{l.store_badge}</Badge>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <p className="flex items-center gap-1.5 truncate font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
          {marketplaceName}
          {l.seller?.name ? (
            <span className="truncate normal-case tracking-normal">· {l.seller.name}</span>
          ) : null}
          {l.seller?.rating ? (
            <span className="inline-flex items-center gap-0.5 normal-case tracking-normal">
              <Star className="size-3" aria-hidden="true" />
              {Number(l.seller.rating).toFixed(1)}
            </span>
          ) : null}
        </p>
        <h3
          className="line-clamp-2 text-[14px] font-medium leading-snug text-ink"
          title={l.original_title ?? l.title}
        >
          {result.listing_id ? (
            <Link
              href={`/discover/listing/?id=${result.listing_id}`}
              className="hover:underline hover:underline-offset-4"
            >
              {l.title}
            </Link>
          ) : (
            l.title
          )}
        </h3>
        {l.title_machine_translated ? (
          <p className="-mt-1.5 text-[11px] text-muted">Machine-translated title</p>
        ) : null}
        <Price result={result} />
        <div className="flex flex-wrap items-center gap-1.5">
          <AuthenticityBadge
            value={l.authenticity ?? "unverified"}
            reasons={l.authenticity_reasons}
          />
          {l.sales_label ? <span className="text-[11.5px] text-muted">{l.sales_label}</span> : null}
        </div>
        <CostBreakdown result={result} />
        <div className="mt-auto flex gap-2 pt-1">
          <button
            onClick={() => onTryOn(result)}
            disabled={!l.category}
            title={
              l.category
                ? "Preview an approximate version on your avatar"
                : "Category unknown — can't preview"
            }
            className={buttonClasses("primary", "sm", "flex-1")}
          >
            <Shirt className="size-4" aria-hidden="true" /> Try on
          </button>
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => recordEvent("clicked_out", result.listing_id)}
            className={buttonClasses("secondary", "sm")}
            aria-label={`View on ${marketplaceName} (opens in a new tab)`}
          >
            View <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
          {result.listing_id ? (
            onToggleSave ? (
              <button
                onClick={() => onToggleSave(result)}
                aria-pressed={saved}
                aria-label={saved ? `Remove ${l.title} from saved` : `Save ${l.title}`}
                title={saved ? "Saved" : "Save"}
                className={buttonClasses("secondary", "sm", "w-9 px-0")}
              >
                <Heart
                  className={cn("size-4", saved && "fill-ember text-ember")}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <Link
                href="/login/"
                aria-label="Sign in to save"
                title="Sign in to save"
                className={buttonClasses("secondary", "sm", "w-9 px-0")}
              >
                <Heart className="size-4" aria-hidden="true" />
              </Link>
            )
          ) : null}
        </div>
      </div>
    </article>
  );
}
