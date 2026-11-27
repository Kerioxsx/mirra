"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import type { OutfitOut } from "@mirra/shared-types";
import { categorySpec, isCategory } from "@mirra/shared-types";
import { Badge, Button, buttonClasses, EmptyState, Spinner } from "@mirra/ui";
import { outfitStore, persistNow, useView } from "@/features/dresser/state";
import { formatMoney, marketplaceName } from "@/features/discover/format";
import { getClient } from "@/lib/api";
import { fromOutfitOut } from "./convert";

function OutfitCard({
  outfit,
  onOpen,
  onDelete,
}: {
  outfit: OutfitOut;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const priced = outfit.totals.length > 0;
  return (
    <article
      aria-label={outfit.name}
      className="flex flex-col gap-4 rounded-[var(--mirra-radius)] border border-line bg-surface p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[24px] leading-tight text-ink">{outfit.name}</h2>
          <p className="text-[12px] text-muted">
            {new Date(outfit.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · {outfit.items.length} pieces
          </p>
        </div>
        <button
          onClick={onDelete}
          aria-label={`Delete ${outfit.name}`}
          className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-danger"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {outfit.items.map((it, i) => (
          <li key={i} className="flex items-center gap-2.5 text-[13px]">
            <span
              className="size-4 shrink-0 rounded-full ring-1 ring-line-strong"
              style={{ background: it.color_hex }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-ink">
              {it.listing
                ? it.listing.title
                : isCategory(it.category)
                  ? categorySpec(it.category).label.replace(/s$/, "")
                  : it.category}
            </span>
            {it.listing ? (
              <Badge tone="outline">{marketplaceName(it.listing.marketplace_id)}</Badge>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
        <p className="text-[13px] text-ink-soft">
          {priced ? (
            <span className="tabular font-display text-[22px] text-ink">
              {outfit.totals.map((m) => formatMoney(m)).join(" + ")}
            </span>
          ) : (
            "Basics only"
          )}
          {priced && !outfit.price_complete ? (
            <span className="block text-[11.5px] text-warning">Some prices unknown</span>
          ) : null}
        </p>
        <Button size="sm" onClick={onOpen}>
          Open in dresser
        </Button>
      </div>
    </article>
  );
}

export function OutfitsView() {
  const router = useRouter();
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; data: OutfitOut[] } | { status: "error" }
  >({
    status: "loading",
  });
  const load = useCallback(async () => {
    const c = getClient();
    try {
      setState({ status: "ready", data: await c.unwrap(c.api.GET("/api/v1/outfits")) });
    } catch {
      setState({ status: "error" });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function open(o: OutfitOut) {
    useView.getState().hydrate();
    outfitStore.getState().load(fromOutfitOut(o));
    persistNow();
    router.push("/dresser/");
  }
  async function remove(o: OutfitOut) {
    if (!window.confirm(`Delete “${o.name}”?`)) return;
    const c = getClient();
    await c.unwrap(
      c.api.DELETE("/api/v1/outfits/{outfit_id}", { params: { path: { outfit_id: o.id } } }),
    );
    await load();
  }

  if (state.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-muted">
        <Spinner className="size-4" /> Loading outfits…
      </p>
    );
  }
  if (state.status === "error")
    return (
      <p role="alert" className="text-danger">
        Couldn&apos;t load your outfits.
      </p>
    );
  if (state.data.length === 0) {
    return (
      <EmptyState
        icon={<Bookmark className="size-5" aria-hidden="true" />}
        title="No saved outfits yet"
      >
        <p>
          Build a look in the dresser — mix basics with pieces you found in Discover — and save it
          here.
        </p>
        <Link href="/dresser/" className={buttonClasses("primary", "md", "mt-5")}>
          Open the dresser
        </Link>
      </EmptyState>
    );
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {state.data.map((o) => (
        <li key={o.id} className="flex">
          <OutfitCard outfit={o} onOpen={() => open(o)} onDelete={() => void remove(o)} />
        </li>
      ))}
    </ul>
  );
}
