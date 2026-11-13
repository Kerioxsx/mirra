"use client";
import { useEffect, useRef, useState } from "react";
import type { SearchResponse } from "@mirra/shared-types";
import { isApiError } from "@mirra/api-client";
import { getClient } from "@/lib/api";

export interface SearchInput {
  q: string;
  sort: "relevance" | "price_asc" | "price_desc";
  currency: string;
  priceMax: string;
  marketplaces: string[];
}

export type SearchState =
  | { status: "idle" }
  | { status: "loading"; previous: SearchResponse | null }
  | { status: "ready"; data: SearchResponse }
  | { status: "error"; message: string };

/** Runs a search whenever the input changes; stale responses are discarded. */
export function useSearch(input: SearchInput | null): SearchState {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const seq = useRef(0);
  const key = input ? JSON.stringify(input) : null;
  useEffect(() => {
    if (!key) return;
    const params: SearchInput = JSON.parse(key);
    const id = ++seq.current;
    setState((s) => ({ status: "loading", previous: s.status === "ready" ? s.data : null }));
    const c = getClient();
    c.unwrap(
      c.api.GET("/api/v1/search", {
        params: {
          query: {
            q: params.q,
            sort: params.sort,
            currency: params.currency || undefined,
            price_max: params.priceMax ? params.priceMax : undefined,
            marketplace: params.marketplaces.length ? params.marketplaces : undefined,
            page_size: 36,
          },
        },
      }),
    )
      .then((data) => id === seq.current && setState({ status: "ready", data }))
      .catch((err) => {
        if (id !== seq.current) return;
        setState({
          status: "error",
          message: isApiError(err, "rate_limited")
            ? "You're searching very fast — give it a few seconds."
            : isApiError(err)
              ? err.message
              : "Search failed. Try again.",
        });
      });
  }, [key]);
  return state;
}
