"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Heart, Shirt, Star } from "lucide-react";
import type { AlternativesResponse, ListingDetail, SearchResult } from "@mirra/shared-types";
import { isCategory } from "@mirra/shared-types";
import { isApiError } from "@mirra/api-client";
import { AuthenticityBadge, Badge, buttonClasses, cn, EmptyState, Spinner } from "@mirra/ui";
import { tryOn } from "@/features/dresser/state";
import { SafeImage } from "@/components/SafeImage";
import { getClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { recordEvent } from "./events";
import { formatMoney, marketplaceName } from "./format";
import { CostBreakdown, Price, ResultCard } from "./ResultCard";
import { useSaved } from "./useSaved";

type Load<T> =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function toProductRef(r: SearchResult, name: string) {
  const l = r.listing;
  if (!l.category || !isCategory(l.category)) return null;
  return {
    productId: `${l.marketplace_id}:${l.external_id}`,
    title: l.title,
    category: l.category,
    colors: l.colors ?? [],
    marketplace: name,
    listingId: r.listing_id ?? l.external_id,
    url: l.url,
    price: l.price
      ? { amount: Number(l.price.amount).toFixed(2), currency: l.price.currency }
      : null,
  };
}

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const ok = images.map((src, i) => ({ src, i })).filter((x) => !failed.has(x.i));
  const main = ok.find((x) => x.i === active) ?? ok[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[4/5] overflow-hidden rounded-[24px] bg-surface-2">
        {main ? (
          <img
            src={main.src}
            alt={title}
            referrerPolicy="no-referrer"
            onError={() => setFailed((f) => new Set(f).add(main.i))}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">No image</div>
        )}
      </div>
      {ok.length > 1 ? (
        <div className="flex gap-2">
          {ok.slice(0, 6).map(({ src, i }) => (
            <button
              key={src}
              onClick={() => setActive(i)}
              aria-label={`Image ${i + 1}`}
              aria-pressed={main?.i === i}
              className={cn(
                "size-16 overflow-hidden rounded-xl bg-surface-2 ring-offset-2 ring-offset-paper",
                main?.i === i && "ring-2 ring-ink",
              )}
            >
              <SafeImage src={src} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ListingView() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const saved = useSaved();
  const [detail, setDetail] = useState<Load<ListingDetail>>({ status: "loading" });
  const [alts, setAlts] = useState<Load<AlternativesResponse>>({ status: "loading" });

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const c = getClient();
    setDetail({ status: "loading" });
    setAlts({ status: "loading" });
    const path = { params: { path: { listing_id: id } } };
    c.unwrap(c.api.GET("/api/v1/listings/{listing_id}", path))
      .then((data) => alive && setDetail({ status: "ready", data }))
      .catch(
        (e) =>
          alive &&
          setDetail({
            status: "error",
            message: isApiError(e, "not_found")
              ? "This listing isn't in Mirra any more."
              : "Couldn't load this listing.",
          }),
      );
    c.unwrap(c.api.GET("/api/v1/listings/{listing_id}/alternatives", path))
      .then((data) => alive && setAlts({ status: "ready", data }))
      .catch(
        () =>
          alive &&
          setAlts({ status: "error", message: "Couldn't look for alternatives right now." }),
      );
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (detail.status === "ready" && authStatus === "authenticated")
      recordEvent("viewed", detail.data.id);
  }, [detail, authStatus]);

  if (!id || detail.status === "error") {
    return (
      <EmptyState title="Listing not found" eyebrow="Discover">
        <p>{detail.status === "error" ? detail.message : "No listing was specified."}</p>
        <Link href="/discover/" className={buttonClasses("primary", "md", "mt-5")}>
          Back to Discover
        </Link>
      </EmptyState>
    );
  }
  if (detail.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 py-16 text-muted">
        <Spinner className="size-5" /> Loading listing…
      </p>
    );
  }

  const d = detail.data;
  const r = d.result;
  const l = r.listing;
  const ref = toProductRef(r, d.marketplace_name);
  const isSaved = saved.ids.has(d.id);
  const history = d.price_history;

  return (
    <div className="flex flex-col gap-16">
      <button
        onClick={() => router.back()}
        className="-mb-10 inline-flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back
      </button>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Gallery images={l.image_urls ?? []} title={l.title} />
        <section className="flex flex-col gap-5" aria-label="Listing details">
          <div className="flex flex-wrap items-center gap-2">
            {l.is_demo ? <Badge tone="accent">Demo data</Badge> : null}
            {l.store_badge ? <Badge tone="neutral">{l.store_badge}</Badge> : null}
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              {d.marketplace_name}
            </span>
            {l.seller?.name ? (
              <span className="text-[13px] text-ink-soft">
                · {l.seller.name}
                {l.seller.rating ? (
                  <span className="ml-1 inline-flex items-center gap-0.5">
                    <Star className="size-3.5" aria-hidden="true" />
                    {Number(l.seller.rating).toFixed(1)}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
          <h1 className="font-display text-[34px] leading-[1.08] text-ink sm:text-[42px]">
            {l.title}
          </h1>
          {l.title_machine_translated ? (
            <p className="-mt-3 text-[12.5px] text-muted">
              Machine-translated title
              {l.original_title ? (
                <>
                  {" "}
                  · original: <span lang="zh">{l.original_title}</span>
                </>
              ) : null}
            </p>
          ) : null}
          <Price result={r} />
          <div className="flex flex-wrap items-center gap-2">
            <AuthenticityBadge
              value={l.authenticity ?? "unverified"}
              reasons={l.authenticity_reasons}
            />
            {l.sales_label ? <span className="text-[13px] text-muted">{l.sales_label}</span> : null}
            {l.condition && l.condition !== "unknown" ? (
              <Badge tone="outline">{l.condition.replace(/_/g, " ")}</Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (!ref) return;
                tryOn(ref);
                router.push("/dresser/");
              }}
              disabled={!ref}
              className={buttonClasses("primary", "lg")}
            >
              <Shirt className="size-5" aria-hidden="true" /> Try on
            </button>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => recordEvent("clicked_out", d.id)}
              className={buttonClasses("secondary", "lg")}
            >
              View on {d.marketplace_name} <ArrowUpRight className="size-5" aria-hidden="true" />
            </a>
            {saved.canSave ? (
              <button
                onClick={() => void saved.toggle(d.id)}
                aria-pressed={isSaved}
                className={buttonClasses("secondary", "lg")}
              >
                <Heart
                  className={cn("size-5", isSaved && "fill-ember text-ember")}
                  aria-hidden="true"
                />
                {isSaved ? "Saved" : "Save"}
              </button>
            ) : (
              <Link href="/login/" className={buttonClasses("ghost", "lg")}>
                Sign in to save
              </Link>
            )}
          </div>
          <CostBreakdown result={r} open />
          <p className="text-[12px] text-muted">
            Price as of {dateLabel(d.fetched_at)} from {d.marketplace_name}.
            {d.stale
              ? " This is older than a day — check the marketplace for the current price."
              : ""}
          </p>
          <section aria-labelledby="ph-h" className="flex flex-col gap-2 border-t border-line pt-5">
            <h2 id="ph-h" className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              Prices Mirra has seen
            </h2>
            {history.length <= 1 ? (
              <p className="text-[13.5px] text-ink-soft">
                {history[0]
                  ? `First seen at ${formatMoney(history[0].price)} on ${dateLabel(history[0].observed_at)}.`
                  : "No price observations yet."}
              </p>
            ) : (
              <ol className="flex flex-col gap-1 text-[13.5px]">
                {history.map((p) => (
                  <li
                    key={p.observed_at}
                    className="tabular flex justify-between border-b border-line py-1 text-ink-soft"
                  >
                    <span>{dateLabel(p.observed_at)}</span>
                    <span className="text-ink">{formatMoney(p.price)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>
      </div>

      <section aria-labelledby="alt-h" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h2 id="alt-h" className="font-display text-[32px] leading-tight text-ink">
            Similar &amp; cheaper
          </h2>
          <p className="text-[14px] text-ink-soft">
            The same look across every connected marketplace, cheapest first. Match scores are
            estimates.
          </p>
        </div>
        {alts.status === "loading" ? (
          <p role="status" className="flex items-center gap-2 text-muted">
            <Spinner className="size-4" /> Looking across marketplaces…
          </p>
        ) : alts.status === "error" ? (
          <p role="alert" className="text-[14px] text-danger">
            {alts.message}
          </p>
        ) : alts.data.alternatives.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-6 text-[14px] text-ink-soft">
            No close matches found right now.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {alts.data.alternatives.map((a) => {
              const name = marketplaceName(a.result.listing.marketplace_id);
              return (
                <li
                  key={`${a.result.listing.marketplace_id}:${a.result.listing.external_id}`}
                  className="flex flex-col gap-2"
                >
                  <p className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    {a.savings ? (
                      <Badge tone="success">Save {formatMoney(a.savings, { approx: true })}</Badge>
                    ) : null}
                    <span className="text-muted" title={a.match_reasons.join(" · ")}>
                      {Math.round(a.match_score * 100)}% match (estimate)
                    </span>
                  </p>
                  <div className="flex flex-1">
                    <ResultCard
                      result={a.result}
                      marketplaceName={name}
                      onTryOn={(res) => {
                        const p = toProductRef(res, name);
                        if (p) {
                          tryOn(p);
                          router.push("/dresser/");
                        }
                      }}
                      saved={!!a.result.listing_id && saved.ids.has(a.result.listing_id)}
                      onToggleSave={
                        saved.canSave
                          ? (res) => res.listing_id && void saved.toggle(res.listing_id)
                          : undefined
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {alts.status === "ready" && alts.data.excluded_replicas > 0 ? (
          <p className="text-[12.5px] text-muted">
            {alts.data.excluded_replicas} listing{alts.data.excluded_replicas === 1 ? "" : "s"} that
            advertise as replicas {alts.data.excluded_replicas === 1 ? "was" : "were"} left out.
          </p>
        ) : null}
      </section>
    </div>
  );
}
