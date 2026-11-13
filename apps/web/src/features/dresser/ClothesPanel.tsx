"use client";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "zustand";
import { Archive, Bookmark, Search } from "lucide-react";
import { slotKey } from "@mirra/garment-system";
import { taxonomy, type Category, type CategoryGroup } from "@mirra/shared-types";
import { cn, Segmented } from "@mirra/ui";
import { resolveColor } from "@mirra/garment-system";
import { CATEGORY_COLORS, genericItem, outfitStore } from "./state";

const GROUP_LABELS: Record<CategoryGroup, string> = {
  tops: "Tops",
  outerwear: "Outerwear",
  bottoms: "Bottoms",
  full_body: "One-piece",
  footwear: "Footwear",
  headwear: "Headwear",
  accessories: "Accessories",
};
const GROUP_ORDER: CategoryGroup[] = [
  "tops",
  "outerwear",
  "bottoms",
  "footwear",
  "headwear",
  "accessories",
  "full_body",
];

type Source = "catalog" | "wardrobe" | "results" | "saved";

function CategoryTile({ id, label }: { id: Category; label: string }) {
  const items = useStore(outfitStore, (s) => s.history.present.items);
  const wearing = Object.values(items).some((i) => i.garment.category === id);
  const hex = resolveColor(CATEGORY_COLORS[id]) ?? "#8a8d91";
  return (
    <button
      onClick={() => {
        const item = genericItem(id);
        const s = outfitStore.getState();
        const existing = s.history.present.items[slotKey(item.garment)];
        if (existing?.garment.category === id) s.unequip(slotKey(item.garment));
        else s.equip(item);
      }}
      aria-pressed={wearing}
      className={cn(
        "group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors",
        "focus-visible:outline-2 focus-visible:outline-volt",
        wearing
          ? "border-ink bg-ink text-paper"
          : "border-line bg-surface text-ink hover:border-line-strong",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 rounded-full ring-1",
          wearing ? "ring-paper/40" : "ring-line-strong",
        )}
        style={{ background: hex }}
      />
      <span className="truncate font-medium">{label}</span>
    </button>
  );
}

function SourceEmpty({
  icon,
  title,
  body,
  href,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line-strong p-5">
      <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink">
        {icon}
      </span>
      <p className="font-display text-xl leading-tight text-ink">{title}</p>
      <p className="text-[13px] leading-relaxed text-ink-soft">{body}</p>
      <Link href={href} className="text-[13px] font-medium text-ink underline underline-offset-4">
        {cta}
      </Link>
    </div>
  );
}

export function ClothesPanel() {
  const [source, setSource] = useState<Source>("catalog");
  const [group, setGroup] = useState<CategoryGroup | "all">("all");
  const groups = GROUP_ORDER.filter((g) => group === "all" || g === group);
  return (
    <div className="flex flex-col gap-5">
      <Segmented
        label="Clothing source"
        value={source}
        onChange={setSource}
        options={[
          { value: "catalog", label: "Basics" },
          { value: "results", label: "Results" },
          { value: "wardrobe", label: "Wardrobe" },
          { value: "saved", label: "Saved" },
        ]}
      />
      {source === "catalog" ? (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by group">
            {(["all", ...GROUP_ORDER] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                aria-pressed={group === g}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                  group === g
                    ? "bg-volt text-volt-ink"
                    : "bg-surface-2 text-ink-soft hover:text-ink",
                )}
              >
                {g === "all" ? "All" : GROUP_LABELS[g]}
              </button>
            ))}
          </div>
          <p className="text-[12px] leading-relaxed text-muted">
            Generic basics for building a look. Real products from marketplaces appear under Results
            once search goes live.
          </p>
          {groups.map((g) => (
            <section key={g} aria-labelledby={`grp-${g}`} className="flex flex-col gap-2">
              <h3
                id={`grp-${g}`}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted"
              >
                {GROUP_LABELS[g]}
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {taxonomy.categories
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <CategoryTile key={c.id} id={c.id} label={c.label} />
                  ))}
              </div>
            </section>
          ))}
        </>
      ) : source === "results" ? (
        <SourceEmpty
          icon={<Search className="size-4" aria-hidden="true" />}
          title="No search results yet"
          body="Marketplace search is the next milestone. Products you find in Discover will show up here, ready to try on."
          href="/discover/"
          cta="Go to Discover"
        />
      ) : source === "wardrobe" ? (
        <SourceEmpty
          icon={<Archive className="size-4" aria-hidden="true" />}
          title="Your wardrobe"
          body="Upload clothes you own and dress the avatar in them. Arrives with the digital wardrobe."
          href="/wardrobe/"
          cta="Open My Wardrobe"
        />
      ) : (
        <SourceEmpty
          icon={<Bookmark className="size-4" aria-hidden="true" />}
          title="Saved pieces"
          body="Products you save while browsing collect here."
          href="/outfits/"
          cta="See saved outfits"
        />
      )}
    </div>
  );
}
