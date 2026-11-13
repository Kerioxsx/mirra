import type { TokenStore } from "@mirra/api-client";

/** True inside the Tauri desktop shell. */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const KEY = "refresh_token";

/**
 * Desktop refresh tokens live in the OS keychain (macOS Keychain, Windows Credential Manager,
 * Secret Service on Linux) through Rust commands in apps/desktop/src-tauri — never in web storage.
 */
export const keychainTokenStore: TokenStore = {
  kind: "desktop",
  async getRefreshToken() {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<string | null>("secure_store_get", { key: KEY })) ?? null;
  },
  async setRefreshToken(token) {
    const { invoke } = await import("@tauri-apps/api/core");
    if (token) await invoke("secure_store_set", { key: KEY, value: token });
    else await invoke("secure_store_delete", { key: KEY });
  },
};
