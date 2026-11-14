import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/Page";
import { RequireAuth } from "@/components/RequireAuth";
import { OutfitsView } from "@/features/outfits/OutfitsView";

export const metadata: Metadata = { title: "Saved Outfits" };

export default function OutfitsPage() {
  return (
    <Page wide>
      <PageHeader eyebrow="Saved Outfits" title="Looks worth keeping.">
        Outfits you save from the dresser, with their pieces, prices and original links — synced to
        your account.
      </PageHeader>
      <RequireAuth reason="Saved outfits belong to your account so they follow you between web and desktop.">
        <OutfitsView />
      </RequireAuth>
    </Page>
  );
}
