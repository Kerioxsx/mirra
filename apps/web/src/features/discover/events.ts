import { getClient } from "@/lib/api";

/** Fire-and-forget shopping events for signed-in shoppers (powers Shopping History). */
export function recordEvent(
  event: "viewed" | "clicked_out",
  listingId: string | null | undefined,
): void {
  const c = getClient();
  if (!listingId || !c.isAuthenticated) return;
  void c.api
    .POST("/api/v1/shopping/events", { body: { event, listing_id: listingId } })
    .catch(() => undefined);
}
