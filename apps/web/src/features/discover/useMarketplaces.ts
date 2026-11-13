"use client";
import { useEffect, useState } from "react";
import type { MarketplaceInfo } from "@mirra/shared-types";
import { getClient } from "@/lib/api";

type State =
  { status: "loading" } | { status: "error" } | { status: "ready"; data: MarketplaceInfo[] };

/** Live marketplace catalog from the API: which connectors exist and what they can do. */
export function useMarketplaces(): State {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    const c = getClient();
    c.unwrap(c.api.GET("/api/v1/marketplaces"))
      .then((data) => alive && setState({ status: "ready", data }))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
