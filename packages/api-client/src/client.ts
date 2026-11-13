import createClient, { type Middleware } from "openapi-fetch";
import type { paths, TokenResponse, UserOut } from "@mirra/shared-types";
import { ApiError } from "./errors";
import type { TokenStore } from "./tokens";

export interface MirraClientOptions {
  baseUrl: string;
  tokenStore: TokenStore;
  fetch?: typeof globalThis.fetch;
  /** Called whenever the signed-in user changes (null = signed out). */
  onUserChange?: (user: UserOut | null) => void;
}

const AUTH_PATH = /\/api\/v1\/auth\//;

export type MirraClient = ReturnType<typeof createMirraClient>;

/**
 * Typed API client.
 *
 * - Attaches the in-memory access token to every request.
 * - On a 401 it refreshes once (single-flight, shared by concurrent requests) and retries.
 * - Desktop refresh tokens go through the injected TokenStore; web relies on the cookie.
 */
export function createMirraClient(opts: MirraClientOptions) {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const store = opts.tokenStore;
  let accessToken: string | null = null;
  let user: UserOut | null = null;
  let refreshing: Promise<boolean> | null = null;
  const pending = new Map<string, Request>();

  const setSession = async (res: TokenResponse | null) => {
    accessToken = res?.access_token ?? null;
    if (store.kind === "desktop") await store.setRefreshToken(res?.refresh_token ?? null);
    const next = res?.user ?? null;
    if (next?.id !== user?.id || next?.display_name !== user?.display_name) {
      user = next;
      opts.onUserChange?.(user);
    }
  };

  const api = createClient<paths>({
    baseUrl: opts.baseUrl,
    credentials: "include",
    fetch: (req: Request) => doFetch(req),
  });

  const auth: Middleware = {
    onRequest({ request, id }) {
      request.headers.set("X-Mirra-Client", store.kind);
      if (accessToken && !AUTH_PATH.test(request.url)) {
        request.headers.set("Authorization", `Bearer ${accessToken}`);
      }
      if (!AUTH_PATH.test(request.url)) pending.set(id, request.clone());
      return request;
    },
    async onResponse({ response, id }) {
      const original = pending.get(id);
      pending.delete(id);
      if (response.status !== 401 || !original || !(await refresh())) return response;
      const retry = new Request(original, { headers: new Headers(original.headers) });
      retry.headers.set("Authorization", `Bearer ${accessToken}`);
      return doFetch(retry);
    },
    onError({ id }) {
      pending.delete(id);
    },
  };
  api.use(auth);

  /** Exchange the refresh token for a new session. Concurrent callers share one request. */
  async function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const token = store.kind === "desktop" ? await store.getRefreshToken() : null;
          if (store.kind === "desktop" && !token) break;
          const { data, error, response } = await api.POST("/api/v1/auth/refresh", {
            body: store.kind === "desktop" ? { refresh_token: token } : undefined,
          });
          if (data) {
            await setSession(data);
            return true;
          }
          // Another tab rotated the cookie a moment ago: the browser now holds the new one.
          const code = (error as { error?: { code?: string } } | undefined)?.error?.code;
          if (!(code === "refresh_superseded" && response.status === 401)) break;
        }
        await setSession(null);
        return false;
      } catch {
        return false; // network failure: keep the current state, let the caller see the error
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function unwrap<T>(
    p: Promise<{ data?: T; error?: unknown; response: Response }>,
  ): Promise<T> {
    let r: { data?: T; error?: unknown; response: Response };
    try {
      r = await p;
    } catch {
      throw new ApiError(0, "network_error", "Can't reach Mirra. Check your connection.");
    }
    if (r.data !== undefined && r.response.ok) return r.data;
    if (r.response.ok) return undefined as T;
    throw ApiError.from(r.response.status, r.error);
  }

  return {
    /** The raw typed client for feature modules: `client.api.GET("/api/v1/...")`. */
    api,
    unwrap,
    get user() {
      return user;
    },
    get isAuthenticated() {
      return accessToken !== null;
    },
    /** Try to resume a previous session (cookie or keychain). Resolves to the user or null. */
    async restore(): Promise<UserOut | null> {
      await refresh();
      return user;
    },
    async register(body: { email: string; password: string; display_name: string }) {
      const data = await unwrap(api.POST("/api/v1/auth/register", { body }));
      await setSession(data);
      return data.user;
    },
    async login(body: { email: string; password: string }) {
      const data = await unwrap(api.POST("/api/v1/auth/login", { body }));
      await setSession(data);
      return data.user;
    },
    async logout() {
      const token = store.kind === "desktop" ? await store.getRefreshToken() : null;
      try {
        await api.POST("/api/v1/auth/logout", {
          body: store.kind === "desktop" ? { refresh_token: token } : undefined,
        });
      } finally {
        await setSession(null);
      }
    },
  };
}
