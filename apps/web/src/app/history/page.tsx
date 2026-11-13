import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { EmptyState } from "@mirra/ui";
import { Page, PageHeader, PhaseNote } from "@/components/Page";
import { RequireAuth } from "@/components/RequireAuth";

export const metadata: Metadata = { title: "Shopping History" };

export default function HistoryPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Shopping History"
        title="Everything you looked at."
        actions={<PhaseNote phase="Phase 2">Search history</PhaseNote>}
      >
        Your searches, the listings you opened and the stores you clicked through to — private, and
        deletable.
      </PageHeader>
      <RequireAuth reason="History is tied to your account and only visible to you.">
        <EmptyState
          icon={<Receipt className="size-5" aria-hidden="true" />}
          eyebrow="Starts with Phase 2"
          title="Nothing here yet"
        >
          <p>History begins recording once marketplace search goes live.</p>
        </EmptyState>
      </RequireAuth>
    </Page>
  );
}
