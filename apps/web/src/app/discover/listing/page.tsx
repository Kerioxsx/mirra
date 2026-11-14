import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/Page";
import { ListingView } from "@/features/discover/ListingView";

export const metadata: Metadata = { title: "Listing" };

export default function ListingPage() {
  return (
    <Page wide>
      <Suspense>
        <ListingView />
      </Suspense>
    </Page>
  );
}
