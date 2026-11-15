"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Eye, MousePointerClick, Search, Trash2 } from "lucide-react";
import type { ListingSummary, ShoppingHistory } from "@mirra/shared-types";
import { AuthenticityBadge, Badge, Button, EmptyState, Spinner } from "@mirra/ui";
import { formatMoney, marketplaceName } from "@/features/discover/format";
import { useSaved } from "@/features/discover/useSaved";
import { SafeImage } from "@/components/SafeImage";
import { getClient } from "@/lib/api";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function ListingRow({
  listing,
  children,
}: {
  listing: ListingSummary;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
        <SafeImage src={listing.image_url} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
          {marketplaceName(listing.marketplace_id)}
          {listing.is_demo ? <Badge tone="accent">Demo</Badge> : null}
          {listing.store_badge ? (
            <span className="normal-case tracking-normal">· {listing.store_badge}</span>
          ) : null}
        </p>
        <Link
          href={`/discover/listing/?id=${listing.id}`}
          className="line-clamp-1 text-[14px] font-medium text-ink hover:underline"
        >
          {listing.title}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
          <span className="tabular">{formatMoney(listing.price)}</span>
          {listing.authenticity !== "unverified" ? (
            <AuthenticityBadge value={listing.authenticity} />
          ) : null}
        </p>
      </div>
      {children}
    </div>
  );
}

export function HistoryView() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; data: ShoppingHistory } | { status: "error" }
  >({
    status: "loading",
  });
  const [clearing, setClearing] = useState(false);
  const saved = useSaved();

  const load = useCallback(async () => {
    const c = getClient();
    try {
      setState({ status: "ready", data: await c.unwrap(c.api.GET("/api/v1/shopping/history")) });
    } catch {
      setState({ status: "error" });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function clear() {
    if (!window.confirm("Delete your search and browsing history? Saved items are kept.")) return;
    setClearing(true);
    const c = getClient();
    try {
      await c.unwrap(c.api.DELETE("/api/v1/shopping/history"));
      await load();
    } finally {
      setClearing(false);
    }
  }

  if (state.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-muted">
        <Spinner className="size-4" /> Loading your history…
      </p>
    );
  }
  if (state.status === "error")
    return (
      <p role="alert" className="text-danger">
        Couldn&apos;t load your history.
      </p>
    );

  const { searches, events } = state.data;
  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="saved-h" className="flex flex-col gap-2">
        <h2 id="saved-h" className="font-display text-[28px] text-ink">
          Saved · {saved.items.length}
        </h2>
        {saved.items.length === 0 ? (
          <p className="text-[14px] text-ink-soft">
            Tap the heart on any listing to keep it here.{" "}
            <Link href="/discover/" className="font-medium text-ink underline underline-offset-4">
              Discover
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {saved.items.map((s) => (
              <li key={s.listing_id}>
                <ListingRow listing={s.listing}>
                  <button
                    onClick={() => void saved.toggle(s.listing_id)}
                    className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label={`Remove ${s.listing.title} from saved`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </ListingRow>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="recent-h" className="font-display text-[28px] text-ink">
            Recent activity
          </h2>
          {searches.length || events.length ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void clear()}
              loading={clearing}
              className="text-danger"
            >
              Clear history
            </Button>
          ) : null}
        </div>
        {searches.length === 0 && events.length === 0 ? (
          <EmptyState title="Nothing here yet">
            <p>Searches and the listings you open will show up here. Only you can see them.</p>
          </EmptyState>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                Searches
              </h3>
              <ul className="flex flex-col gap-1">
                {searches.map((s) => (
                  <li key={s.created_at + s.query}>
                    <Link
                      href={`/discover/?q=${encodeURIComponent(s.query)}`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-ink hover:bg-surface-2"
                    >
                      <Search className="size-4 text-muted" aria-hidden="true" />
                      <span className="flex-1 truncate">{s.query}</span>
                      <span className="text-[12px] text-muted">{when(s.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                Listings
              </h3>
              <ul className="divide-y divide-line">
                {events.map((e) => (
                  <li key={e.created_at + e.listing.id + e.event}>
                    <ListingRow listing={e.listing}>
                      <span className="flex shrink-0 flex-col items-end gap-1 text-[11.5px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          {e.event === "clicked_out" ? (
                            <MousePointerClick className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Eye className="size-3.5" aria-hidden="true" />
                          )}
                          {e.event === "clicked_out" ? "Opened on marketplace" : "Viewed"}
                        </span>
                        {when(e.created_at)}
                      </span>
                    </ListingRow>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
