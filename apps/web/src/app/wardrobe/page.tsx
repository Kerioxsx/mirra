import type { Metadata } from "next";
import { Archive } from "lucide-react";
import { EmptyState } from "@mirra/ui";
import { Page, PageHeader, PhaseNote } from "@/components/Page";
import { RequireAuth } from "@/components/RequireAuth";

export const metadata: Metadata = { title: "My Wardrobe" };

export default function WardrobePage() {
  return (
    <Page>
      <PageHeader
        eyebrow="My Wardrobe"
        title="Everything you own, in one place."
        actions={<PhaseNote phase="Phase 6">Wardrobe</PhaseNote>}
      >
        Photograph or import your clothes, and Mirra sorts them by category, colour and brand — then
        builds outfits from what you already have before suggesting anything new.
      </PageHeader>
      <RequireAuth reason="Your wardrobe is private to your account and syncs between web and desktop.">
        <EmptyState
          icon={<Archive className="size-5" aria-hidden="true" />}
          eyebrow="Coming in Phase 6"
          title="Your wardrobe is empty"
        >
          <p>
            Uploads, link imports, automatic categorisation and “Complete my wardrobe”
            recommendations are on the roadmap. The database tables for them already exist.
          </p>
        </EmptyState>
      </RequireAuth>
    </Page>
  );
}
