import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { buttonClasses, EmptyState } from "@mirra/ui";
import { Page, PageHeader, PhaseNote } from "@/components/Page";
import { RequireAuth } from "@/components/RequireAuth";

export const metadata: Metadata = { title: "Saved Outfits" };

export default function OutfitsPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Saved Outfits"
        title="Looks worth keeping."
        actions={<PhaseNote phase="Phase 5">Outfit sync</PhaseNote>}
      >
        Outfits you save from the dresser or the stylist, with their pieces, prices and original
        links.
      </PageHeader>
      <RequireAuth reason="Saved outfits belong to your account so they follow you between web and desktop.">
        <EmptyState
          icon={<Bookmark className="size-5" aria-hidden="true" />}
          eyebrow="Coming in Phase 5"
          title="No saved outfits yet"
        >
          <p>
            Saving outfits to your account arrives with the outfits API. For now the dresser keeps
            your current look on this device between visits.
          </p>
          <Link href="/dresser/" className={buttonClasses("primary", "md", "mt-5")}>
            Open the dresser
          </Link>
        </EmptyState>
      </RequireAuth>
    </Page>
  );
}
