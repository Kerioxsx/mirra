"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Camera, Search } from "lucide-react";
import type { MarketplaceSearchStatus, SearchResult } from "@mirra/shared-types";
import { Button, cn, Spinner } from "@mirra/ui";
import { tryOn } from "@/features/dresser/state";
import { useAuth } from "@/lib/auth";
import { toProductRef } from "./ListingView";
import { PhotoSearch, type PhotoSearchResponse } from "./PhotoSearch";
import { ResultCard } from "./ResultCard";
import { useSaved } from "./useSaved";
import { useSearch, type SearchInput } from "./useSearch";

const SUGGESTIONS = [
  "black oversized zip-up hoodie",
  "baggy jeans",
  "Japanese workwear cargo pants",
  "vintage crewneck sweatshirt",
];
const CURRENCIES = ["auto", "USD", "EUR", "GBP", "CNY", "HKD", "SGD", "JPY", "CAD", "AUD"];

const STATUS_STYLE: Record<
  MarketplaceSearchStatus["status"],
  { dot: string; label: (m: MarketplaceSearchStatus) => string }
> = {
  ok: { dot: "bg-success", label: (m) => `${m.count} result${m.count === 1 ? "" : "s"}` },
  error: { dot: "bg-danger", label: () => "unavailable" },
  timeout: { dot: "bg-warning", label: () => "timed out" },
  not_configured: { dot: "bg-line-strong", label: () => "not connected" },
  blocked: { dot: "bg-line-strong", label: () => "needs partnership" },
};

function StatusStrip({ statuses }: { statuses: MarketplaceSearchStatus[] }) {
  const shown = statuses.filter(
    (m) => (m.status !== "not_configured" && m.status !== "blocked") || m.id === "taobao",
  );
  const idle = statuses.filter((m) => m.status === "not_configured" && m.id !== "taobao");
  return (
    <div className="flex flex-col gap-2" aria-label="Marketplaces searched">
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((m) => (
          <li
            key={m.id}
            title={m.message ?? undefined}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-ink-soft"
          >
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", STATUS_STYLE[m.status].dot)}
            />
            <span className="font-medium text-ink">{m.name}</span> {STATUS_STYLE[m.status].label(m)}
          </li>
        ))}
        {idle.length ? (
          <li
            title={idle.map((m) => m.name).join(", ")}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 py-1 text-[12px] text-muted"
          >
            +{idle.length} not connected yet
          </li>
        ) : null}
      </ul>
      {statuses
        .filter((m) => m.status === "ok" && m.query_sent && m.id === "taobao")
        .map((m) => (
          <p key={m.id} className="text-[12px] text-muted">
            Searched {m.name} for{" "}
            <span lang="zh" className="font-medium text-ink-soft">
              {m.query_sent}
            </span>
          </p>
        ))}
    </div>
  );
}

export function SearchView() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [draft, setDraft] = useState(initialQ);
  const [sort, setSort] = useState<SearchInput["sort"]>("relevance");
  const [currency, setCurrency] = useState("auto");
  const [priceMax, setPriceMax] = useState("");
  const [tried, setTried] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoResult, setPhotoResult] = useState<PhotoSearchResponse | null>(null);

  useEffect(() => setDraft(initialQ), [initialQ]);

  const { status: authStatus } = useAuth();
  const input: SearchInput | null = useMemo(
    () =>
      initialQ && authStatus !== "loading"
        ? {
            q: initialQ,
            sort,
            currency: currency === "auto" ? "" : currency,
            priceMax,
            marketplaces: [],
          }
        : null,
    [initialQ, sort, currency, priceMax, authStatus],
  );
  const state = useSearch(input);
  const saved = useSaved();
  const textData =
    state.status === "ready" ? state.data : state.status === "loading" ? state.previous : null;
  // photo results show until the next text search
  const data = photoResult ?? textData;
  const names = Object.fromEntries((data?.marketplaces ?? []).map((m) => [m.id, m.name]));

  function submit(q: string) {
    const next = q.trim();
    if (!next) return;
    setPhotoResult(null);
    router.replace(`/discover/?q=${encodeURIComponent(next)}`);
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(draft);
  }
  function onTryOn(r: SearchResult) {
    const ref = toProductRef(r, names[r.listing.marketplace_id] ?? r.listing.marketplace_id);
    if (!ref) return;
    tryOn(ref);
    setTried(r.listing.title);
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        role="search"
        aria-label="Search clothing"
        onSubmit={onSubmit}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex h-14 flex-1 items-center gap-3 rounded-full border border-line-strong bg-surface px-5 focus-within:border-ink focus-within:ring-4 focus-within:ring-volt/40">
            <Search className="size-5 text-muted" aria-hidden="true" />
            <span className="sr-only">Search</span>
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Try “black oversized zip-up hoodie”"
              maxLength={200}
              className="h-full flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
            />
          </label>
          <Button type="submit" size="lg" className="h-14">
            Search
          </Button>
          <button
            type="button"
            aria-expanded={photoOpen}
            onClick={() => setPhotoOpen((o) => !o)}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-[14px] font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            <Camera className="size-5" aria-hidden="true" /> Photo
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="flex items-center gap-2 text-ink-soft">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SearchInput["sort"])}
              className="h-9 rounded-full border border-line-strong bg-surface px-3 text-ink"
            >
              <option value="relevance">Best match</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-ink-soft">
            Currency
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-9 rounded-full border border-line-strong bg-surface px-3 text-ink"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c === "auto" ? "From my profile" : c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-ink-soft">
            Max price
            <input
              inputMode="decimal"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="Any"
              className="h-9 w-24 rounded-full border border-line-strong bg-surface px-3 text-ink"
            />
          </label>
        </div>
      </form>

      {photoOpen ? (
        <PhotoSearch
          result={photoResult}
          onResults={setPhotoResult}
          onClose={() => setPhotoOpen(false)}
        />
      ) : null}

      {state.status === "idle" && !photoResult ? (
        <div className="flex flex-wrap gap-2" aria-label="Suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => submit(s)}
              className="rounded-full bg-surface-2 px-4 py-2 text-[13px] text-ink-soft hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-[14px] text-danger">
          {state.message}
        </p>
      ) : null}

      {data ? (
        <section
          aria-label="Results"
          aria-busy={state.status === "loading"}
          className="flex flex-col gap-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <StatusStrip statuses={data.marketplaces} />
            {state.status === "loading" ? (
              <span role="status" className="flex items-center gap-2 text-[13px] text-muted">
                <Spinner className="size-4" /> Updating…
              </span>
            ) : null}
          </div>
          {photoResult ? (
            <p role="status" className="text-[14px] text-ink-soft">
              {photoResult.photo.query ? (
                <>
                  From your photo: <span className="text-ink">“{photoResult.photo.query}”</span>
                </>
              ) : (
                "Matches for your photo"
              )}
              <span className="text-muted">
                {photoResult.photo.source === "vision"
                  ? " · read from the photo by Claude"
                  : photoResult.photo.source === "hint"
                    ? " · by its colours and the type you picked"
                    : " · by marketplaces' own image search"}
              </span>
            </p>
          ) : null}
          {tried ? (
            <p
              role="status"
              className="flex flex-wrap items-center gap-3 rounded-xl bg-volt/30 px-4 py-2.5 text-[13.5px] text-ink"
            >
              Added “{tried}” to your look as an approximate preview.
              <Link href="/dresser/" className="font-medium underline underline-offset-4">
                Open the dresser
              </Link>
            </p>
          ) : null}
          {data.results.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-8 text-[15px] text-ink-soft">
              No results from the connected marketplaces for “{data.query || "your photo"}”.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.results.map((r) => (
                <li key={`${r.listing.marketplace_id}:${r.listing.external_id}`} className="flex">
                  <ResultCard
                    result={r}
                    marketplaceName={names[r.listing.marketplace_id] ?? r.listing.marketplace_id}
                    onTryOn={onTryOn}
                    saved={!!r.listing_id && saved.ids.has(r.listing_id)}
                    onToggleSave={
                      saved.canSave
                        ? (res) => res.listing_id && void saved.toggle(res.listing_id)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] leading-relaxed text-muted">
            Prices, sellers and availability come from each marketplace at search time; converted
            prices are approximate. Links to Taobao may be affiliate links, so Mirra may earn a
            commission at no cost to you.
          </p>
        </section>
      ) : state.status === "loading" ? (
        <p role="status" className="flex items-center gap-2 text-muted">
          <Spinner className="size-4" /> Searching marketplaces…
        </p>
      ) : null}
    </div>
  );
}
