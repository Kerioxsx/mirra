import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/Page";
import { RequireAuth } from "@/components/RequireAuth";
import { SettingsView } from "@/features/settings/SettingsView";

export const metadata: Metadata = { title: "Profile & Settings" };

export default function SettingsPage() {
  return (
    <Page>
      <PageHeader eyebrow="Profile & Settings" title="Your settings." />
      <RequireAuth reason="Your profile and style preferences sync across web and desktop.">
        <SettingsView />
      </RequireAuth>
    </Page>
  );
}
