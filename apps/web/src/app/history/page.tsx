import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/Page";
import { RequireAuth } from "@/components/RequireAuth";
import { HistoryView } from "@/features/history/HistoryView";

export const metadata: Metadata = { title: "Shopping History" };

export default function HistoryPage() {
  return (
    <Page>
      <PageHeader eyebrow="Shopping History" title="Everything you looked at.">
        Your saved pieces, searches and the listings you opened — private to you, and deletable.
      </PageHeader>
      <RequireAuth reason="History is tied to your account and only visible to you.">
        <HistoryView />
      </RequireAuth>
    </Page>
  );
}
