import type { Metadata } from "next";
import { Suspense } from "react";
import { Page, PageHeader } from "@/components/Page";
import { LinkPaste } from "@/features/discover/LinkPaste";
import { MarketplaceGrid } from "@/features/discover/MarketplaceGrid";
import { SearchView } from "@/features/discover/SearchView";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <Page wide>
      <PageHeader title="Find it anywhere.">
        One search across connected marketplaces — Taobao first — with the original listing, seller,
        price and estimated delivered cost side by side.
      </PageHeader>
      <Suspense>
        <SearchView />
      </Suspense>
      <div className="mt-10">
        <LinkPaste />
      </div>
      <section aria-labelledby="mk-h" className="mt-16">
        <h2 id="mk-h" className="mb-5 font-display text-[30px] text-ink">
          Marketplaces
        </h2>
        <MarketplaceGrid />
      </section>
    </Page>
  );
}
