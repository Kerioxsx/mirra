"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, Link2 } from "lucide-react";
import { isApiError } from "@mirra/api-client";
import { taxonomy, type Category, type LinkResolution } from "@mirra/shared-types";
import { Button, buttonClasses } from "@mirra/ui";
import { tryOn } from "@/features/dresser/state";
import { getClient } from "@/lib/api";
import { RouteCard } from "./WaysToBuy";

/** Paste a Taobao / Tmall / Weidian / 1688 / KakoBuy link: recognise it and offer ways to buy it. */
export function LinkPaste() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LinkResolution | null>(null);
  const [category, setCategory] = useState<Category | "">("");
  const [tried, setTried] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setTried(false);
    const c = getClient();
    try {
      setResult(
        await c.unwrap(c.api.POST("/api/v1/links/resolve", { body: { url: text.trim() } })),
      );
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't check that link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="paste-h"
      className="flex flex-col gap-3 rounded-[var(--mirra-radius)] border border-line bg-surface p-5"
    >
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-muted" aria-hidden="true" />
        <h2 id="paste-h" className="text-[14px] font-medium text-ink">
          Have a link?
        </h2>
        <span className="text-[13px] text-muted">Taobao, Tmall, Weidian, 1688 or KakoBuy</span>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="paste-link" className="sr-only">
          Product link
        </label>
        <input
          id="paste-link"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://weidian.com/item.html?itemID=…"
          className="h-11 flex-1 rounded-full border border-line-strong bg-paper px-4 text-[14px] text-ink outline-none focus:border-ink focus:ring-4 focus:ring-volt/40"
        />
        <Button type="submit" variant="secondary" loading={busy}>
          Check link
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="flex flex-col gap-3 border-t border-line pt-3" aria-label="Link result">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink">
            <span className="font-medium">
              {result.source_name} item {result.item_id}
            </span>
            <a
              href={result.canonical_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-ink-soft underline underline-offset-4"
            >
              Open on {result.source_name} <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
            {result.listing_id ? (
              <Link
                href={`/discover/listing/?id=${result.listing_id}`}
                className="font-medium underline underline-offset-4"
              >
                See it in Mirra
              </Link>
            ) : null}
          </p>
          {!result.listing_id ? (
            <p className="text-[12.5px] text-muted">
              Mirra can recognise this link but can&apos;t read its title, photos or price — that
              needs an authorized connection to {result.source_name}.
            </p>
          ) : null}
          {result.routes.map((r) => (
            <RouteCard key={r.id} route={r} listingId={result.listing_id} />
          ))}
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <label htmlFor="try-as" className="text-ink-soft">
              Try it on as
            </label>
            <select
              id="try-as"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category | "")}
              className="h-9 rounded-full border border-line-strong bg-paper px-3 text-ink"
            >
              <option value="">Choose a category…</option>
              {taxonomy.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              disabled={!category}
              onClick={() => {
                if (!category) return;
                tryOn({
                  productId: `${result.source}:${result.item_id}`,
                  title: `${result.source_name} item ${result.item_id}`,
                  category,
                  colors: [],
                  marketplace: result.source_name,
                  listingId: result.listing_id ?? `${result.source}:${result.item_id}`,
                  url: result.canonical_url,
                  price: null,
                });
                setTried(true);
              }}
              className={buttonClasses("secondary", "sm")}
            >
              Try on
            </button>
            {tried ? (
              <span role="status" className="text-success">
                Added as an approximate preview.{" "}
                <Link href="/dresser/" className="font-medium underline underline-offset-4">
                  Open the dresser
                </Link>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
