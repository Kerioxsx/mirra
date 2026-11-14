"use client";
import { useCallback, useEffect, useState } from "react";
import type { SavedItem } from "@mirra/shared-types";
import { getClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** The signed-in shopper's saved listings, with an optimistic save/unsave toggle. */
export function useSaved() {
  const { status } = useAuth();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (status !== "authenticated") return;
    const c = getClient();
    try {
      setItems(await c.unwrap(c.api.GET("/api/v1/saved")));
    } finally {
      setLoaded(true);
    }
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") void refresh();
    else if (status === "guest") {
      setItems([]);
      setLoaded(true);
    }
  }, [status, refresh]);

  const ids = new Set(items.map((i) => i.listing_id));

  const toggle = useCallback(
    async (listingId: string): Promise<boolean> => {
      const c = getClient();
      const wasSaved = items.some((i) => i.listing_id === listingId);
      if (wasSaved) {
        setItems((prev) => prev.filter((i) => i.listing_id !== listingId));
        await c.unwrap(
          c.api.DELETE("/api/v1/saved/{listing_id}", {
            params: { path: { listing_id: listingId } },
          }),
        );
        return false;
      }
      const created = await c.unwrap(
        c.api.POST("/api/v1/saved", { body: { listing_id: listingId } }),
      );
      setItems((prev) => [created, ...prev.filter((i) => i.listing_id !== listingId)]);
      return true;
    },
    [items],
  );

  return { items, ids, loaded, toggle, refresh, canSave: status === "authenticated" };
}
