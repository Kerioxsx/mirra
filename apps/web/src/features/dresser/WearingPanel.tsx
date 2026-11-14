"use client";
import Link from "next/link";
import { useStore } from "zustand";
import { Sparkles, Trash2 } from "lucide-react";
import { FIDELITY_LABELS, type SlotKey } from "@mirra/garment-system";
import { layered, priceSummary } from "@mirra/outfit-engine";
import { categorySpec, taxonomy } from "@mirra/shared-types";
import { buttonClasses, cn, FidelityBadge } from "@mirra/ui";
import { SaveLook } from "@/features/outfits/SaveLook";
import { outfitStore } from "./state";

const LAYER_NAMES = Object.fromEntries(
  Object.entries(taxonomy.layers).map(([k, v]) => [v, k]),
) as Record<number, string>;

function SelectedDetails({ slot }: { slot: SlotKey }) {
  const item = useStore(outfitStore, (s) => s.history.present.items[slot]);
  if (!item) return null;
  const g = item.garment;
  const spec = categorySpec(g.category);
  return (
    <section
      aria-label="Selected item"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
            {spec.label.replace(/s$/, "")} · {g.bodyRegion.replace("_", " ")} ·{" "}
            {LAYER_NAMES[g.layer] ?? `layer ${g.layer}`}
          </p>
          <h3 className="mt-1 truncate font-display text-2xl leading-tight text-ink">{g.name}</h3>
        </div>
        <button
          onClick={() => outfitStore.getState().unequip(slot)}
          aria-label={`Take off ${g.name}`}
          title="Take off"
          className="rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-danger"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <FidelityBadge fidelity={g.fidelity} />
        <p className="text-[12px] leading-relaxed text-muted">
          {FIDELITY_LABELS[g.fidelity].description}
        </p>
      </div>
      <fieldset>
        <legend className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
          Colour
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          {g.colorVariants.map((c) => (
            <button
              key={c.id + c.hex}
              onClick={() => outfitStore.getState().recolor(slot, c.hex)}
              aria-label={c.label}
              aria-pressed={item.colorHex === c.hex}
              title={c.label}
              className={cn(
                "size-7 rounded-full ring-offset-2 ring-offset-surface focus-visible:outline-2 focus-visible:outline-volt",
                item.colorHex === c.hex ? "ring-2 ring-ink" : "ring-1 ring-line-strong",
              )}
              style={{ background: c.hex }}
            />
          ))}
          <label
            className="relative size-7 cursor-pointer overflow-hidden rounded-full ring-1 ring-line-strong"
            title="Custom colour"
          >
            <span className="sr-only">Custom colour</span>
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]"
            />
            <input
              type="color"
              value={item.colorHex}
              onChange={(e) => outfitStore.getState().recolor(slot, e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </fieldset>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[13px]">
        <dt className="text-muted">Product</dt>
        <dd className="text-ink-soft">
          {item.source.kind === "product"
            ? (item.source.marketplace ?? "Linked product")
            : "Not linked to a product"}
        </dd>
        <dt className="text-muted">Price</dt>
        <dd className="tabular text-ink-soft">
          {item.price
            ? `${item.price.amount} ${item.price.currency}`
            : item.source.kind === "product"
              ? "Not provided"
              : "—"}
        </dd>
      </dl>
      {item.source.kind === "product" && item.source.url ? (
        <a
          href={item.source.url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="text-[13px] font-medium text-ink underline underline-offset-4"
        >
          View the original listing ↗
        </a>
      ) : (
        <Link
          href="/discover/"
          className="text-[13px] font-medium text-ink underline underline-offset-4"
        >
          Find the real thing in Discover
        </Link>
      )}
    </section>
  );
}

export function WearingPanel() {
  const outfit = useStore(outfitStore, (s) => s.history.present);
  const selected = useStore(outfitStore, (s) => s.selected);
  const items = layered(outfit).reverse(); // outermost first reads naturally
  const price = priceSummary(outfit);
  return (
    <div className="flex flex-col gap-5">
      {selected && outfit.items[selected] ? <SelectedDetails slot={selected} /> : null}
      <section aria-labelledby="wearing-h" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3
            id="wearing-h"
            className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted"
          >
            Now wearing · {items.length}
          </h3>
          {items.length ? (
            <button
              onClick={() => outfitStore.getState().clear()}
              className="text-[12px] text-muted hover:text-ink"
            >
              Clear all
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong p-4 text-[13px] text-muted">
            Nothing on yet. Pick a piece from the left.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map(([slot, item]) => (
              <li key={slot}>
                <button
                  onClick={() => outfitStore.getState().select(selected === slot ? null : slot)}
                  aria-pressed={selected === slot}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                    selected === slot ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  <span
                    className="size-6 shrink-0 rounded-full ring-1 ring-line-strong"
                    style={{ background: item.colorHex }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                      {item.garment.name}
                    </span>
                    <span className="block text-[11.5px] capitalize text-muted">
                      {item.garment.fidelity} · {item.garment.bodyRegion.replace("_", " ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <SaveLook />
      <section
        aria-label="Outfit price"
        className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-4"
      >
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
          Outfit total
        </p>
        {price.pricedCount === 0 && price.unknownCount === 0 ? (
          <p className="text-[13px] text-ink-soft">
            Basics aren&apos;t for sale. Totals appear when you try on real products.
          </p>
        ) : (
          <>
            <p className="tabular font-display text-3xl text-ink">
              {Object.entries(price.totals)
                .map(([cur, amt]) => `${amt} ${cur}`)
                .join(" + ") || "—"}
            </p>
            {!price.complete ? (
              <p className="text-[12px] text-warning">
                {price.unknownCount} item price(s) not provided by the marketplace.
              </p>
            ) : null}
          </>
        )}
      </section>
      <section
        aria-label="Stylist suggestions"
        className="flex flex-col gap-2 rounded-2xl border border-line p-4"
      >
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <Sparkles className="size-4" aria-hidden="true" /> Stylist suggestions
        </p>
        <p className="text-[12px] leading-relaxed text-muted">
          Compatibility notes and swaps from the AI stylist will appear here. It only recommends
          listings it can verify against real marketplace data.
        </p>
        <Link href="/stylist/" className={buttonClasses("secondary", "sm", "mt-1 self-start")}>
          Open the stylist
        </Link>
      </section>
    </div>
  );
}
