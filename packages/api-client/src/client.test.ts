import { describe, expect, it, vi } from "vitest";
import { createMirraClient } from "./client";
import { ApiError } from "./errors";
import { cookieTokenStore, memoryTokenStore } from "./tokens";

const user = {
  id: "u1",
  email: "a@example.com",
  display_name: "Ada",
  is_verified: false,
  created_at: "",
};
const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const tokens = (n: number, refresh: string | null = null) => ({
  access_token: `access-${n}`,
  token_type: "bearer",
  expires_in: 900,
  refresh_token: refresh,
  user,
});

/** A fake backend that records requests. */
function fakeServer(handler: (req: Request, path: string) => Response | Promise<Response>) {
  const calls: { path: string; auth: string | null; client: string | null; body: string }[] = [];
  const fetch = vi.fn(async (req: Request) => {
    const path = new URL(req.url).pathname;
    calls.push({
      path,
      auth: req.headers.get("Authorization"),
      client: req.headers.get("X-Mirra-Client"),
      body: req.method === "GET" ? "" : await req.clone().text(),
    });
    return handler(req, path);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

describe("api client", () => {
  it("logs in, attaches the bearer token, and tags every request with the client kind", async () => {
    const srv = fakeServer((_req, path) =>
      path.endsWith("/auth/login") ? json(200, tokens(1)) : json(200, user),
    );
    const onUserChange = vi.fn();
    const c = createMirraClient({
      baseUrl: "http://api",
      tokenStore: cookieTokenStore,
      fetch: srv.fetch,
      onUserChange,
    });
    await c.login({ email: "a@example.com", password: "pw" });
    await c.unwrap(c.api.GET("/api/v1/users/me"));
    expect(srv.calls[0]).toMatchObject({ client: "web", auth: null });
    expect(srv.calls[1]).toMatchObject({ client: "web", auth: "Bearer access-1" });
    expect(onUserChange).toHaveBeenCalledWith(user);
    expect(c.isAuthenticated).toBe(true);
  });

  it("refreshes once on 401 for concurrent requests and retries them", async () => {
    let refreshes = 0;
    const srv = fakeServer((req, path) => {
      if (path.endsWith("/auth/refresh")) return json(200, tokens(++refreshes + 1));
      return req.headers.get("Authorization") === "Bearer access-2"
        ? json(200, user)
        : json(401, { error: { code: "unauthorized", message: "expired" } });
    });
    const c = createMirraClient({
      baseUrl: "http://api",
      tokenStore: cookieTokenStore,
      fetch: srv.fetch,
    });
    const results = await Promise.all([
      c.unwrap(c.api.GET("/api/v1/users/me")),
      c.unwrap(c.api.GET("/api/v1/users/me")),
    ]);
    expect(results).toEqual([user, user]);
    expect(refreshes).toBe(1);
  });

  it("desktop sends the keychain refresh token in the body and stores the rotated one", async () => {
    const store = memoryTokenStore("desktop");
    store.value = "refresh-old";
    const srv = fakeServer(() => json(200, tokens(5, "refresh-new")));
    const c = createMirraClient({ baseUrl: "http://api", tokenStore: store, fetch: srv.fetch });
    expect(await c.restore()).toEqual(user);
    expect(srv.calls[0]).toMatchObject({
      client: "desktop",
      body: JSON.stringify({ refresh_token: "refresh-old" }),
    });
    expect(store.value).toBe("refresh-new");
  });

  it("desktop with no stored token doesn't call the server", async () => {
    const srv = fakeServer(() => json(500, null));
    const c = createMirraClient({
      baseUrl: "http://api",
      tokenStore: memoryTokenStore("desktop"),
      fetch: srv.fetch,
    });
    expect(await c.restore()).toBeNull();
    expect(srv.calls).toHaveLength(0);
  });

  it("retries once when another tab superseded the refresh cookie", async () => {
    let n = 0;
    const srv = fakeServer(() =>
      ++n === 1
        ? json(401, { error: { code: "refresh_superseded", message: "retry" } })
        : json(200, tokens(3)),
    );
    const c = createMirraClient({
      baseUrl: "http://api",
      tokenStore: cookieTokenStore,
      fetch: srv.fetch,
    });
    expect(await c.restore()).toEqual(user);
    expect(n).toBe(2);
  });

  it("signs out when refresh fails and surfaces API errors with their code", async () => {
    const srv = fakeServer((_r, path) =>
      path.endsWith("/auth/refresh")
        ? json(401, { error: { code: "refresh_reused", message: "nope" } })
        : json(401, { error: { code: "unauthorized", message: "Not signed in" } }),
    );
    const onUserChange = vi.fn();
    const c = createMirraClient({
      baseUrl: "http://api",
      tokenStore: cookieTokenStore,
      fetch: srv.fetch,
      onUserChange,
    });
    const err = await c.unwrap(c.api.GET("/api/v1/users/me")).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: "unauthorized" });
    expect(c.isAuthenticated).toBe(false);
  });

  it("logout clears the desktop token even if the network fails", async () => {
    const store = memoryTokenStore("desktop");
    store.value = "r";
    const fetch = vi.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof globalThis.fetch;
    const c = createMirraClient({ baseUrl: "http://api", tokenStore: store, fetch });
    await c.logout().catch(() => undefined);
    expect(store.value).toBeNull();
  });

  it("maps network failures to a friendly ApiError", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("offline");
    }) as unknown as typeof globalThis.fetch;
    const c = createMirraClient({ baseUrl: "http://api", tokenStore: cookieTokenStore, fetch });
    await expect(c.login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({
      code: "network_error",
    });
  });
});
