import type { Metadata } from "next";
import { Camera, Search } from "lucide-react";
import { Page, PageHeader, PhaseNote } from "@/components/Page";
import { MarketplaceGrid } from "@/features/discover/MarketplaceGrid";

export const metadata: Metadata = { title: "Discover" };

const MODES = [
  ["Text", "“Black oversized zip-up hoodie”"],
  ["Photo", "Upload a picture, find visually similar pieces"],
  ["Whole outfit", "Split a look into its individual items"],
  ["Brand", "A label, a collection, a designer"],
  ["Style", "Streetwear, vintage, techwear, minimal, formal…"],
  ["Plain language", "“An oversized vintage jacket that goes with black baggy jeans”"],
];

export default function DiscoverPage() {
  return (
    <Page wide>
      <PageHeader
        eyebrow="Discover"
        title="Find it anywhere."
        actions={<PhaseNote phase="Phase 2">Search engine</PhaseNote>}
      >
        One search across marketplaces, with the original listing, seller, price and shipping kept
        intact.
      </PageHeader>

      <form
        role="search"
        aria-label="Search clothing"
        className="flex flex-col gap-3 sm:flex-row"
        action="#"
      >
        <label className="flex h-14 flex-1 items-center gap-3 rounded-full border border-line-strong bg-surface px-5 opacity-70">
          <Search className="size-5 text-muted" aria-hidden="true" />
          <span className="sr-only">Search</span>
          <input
            disabled
            placeholder="Search will be available when the first marketplace is connected"
            className="h-full flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
        </label>
        <button
          type="button"
          disabled
          className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-[14px] font-medium text-muted"
        >
          <Camera className="size-5" aria-hidden="true" /> Search by photo
        </button>
      </form>
      <p className="mt-3 text-[13px] text-muted">
        No sample results are shown here, so nothing can be mistaken for a real listing.
      </p>

      <section aria-labelledby="modes-h" className="mt-14">
        <h2 id="modes-h" className="mb-5 font-display text-[30px] text-ink">
          Ways to search
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map(([title, body]) => (
            <li key={title} className="rounded-2xl border border-line bg-surface p-5">
              <p className="font-medium text-ink">{title}</p>
              <p className="mt-1 text-[14px] text-ink-soft">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mk-h" className="mt-14">
        <h2 id="mk-h" className="mb-5 font-display text-[30px] text-ink">
          Marketplaces
        </h2>
        <MarketplaceGrid />
      </section>
    </Page>
  );
}
