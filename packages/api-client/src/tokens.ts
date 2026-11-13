export type ClientKind = "web" | "desktop";

/**
 * Where the refresh token lives between app launches.
 *
 * - Web: an httpOnly cookie the browser manages, so the store holds nothing (`cookieTokenStore`).
 * - Desktop: the OS keychain via a Tauri command (implemented in apps/web/src/lib/platform).
 *
 * The access token is never persisted; it lives in memory inside the client.
 */
export interface TokenStore {
  readonly kind: ClientKind;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string | null): Promise<void>;
}

export const cookieTokenStore: TokenStore = {
  kind: "web",
  getRefreshToken: async () => null,
  setRefreshToken: async () => undefined,
};

/** In-memory store for tests and previews. */
export function memoryTokenStore(
  kind: ClientKind = "desktop",
): TokenStore & { value: string | null } {
  const store = {
    kind,
    value: null as string | null,
    getRefreshToken: async () => store.value,
    setRefreshToken: async (t: string | null) => {
      store.value = t;
    },
  };
  return store;
}
