import { cookieTokenStore, createMirraClient, type MirraClient } from "@mirra/api-client";
import { API_URL } from "./config";
import { isDesktop, keychainTokenStore } from "./platform";

let client: MirraClient | null = null;
const listeners = new Set<() => void>();

/** The app-wide API client (browser only). */
export function getClient(): MirraClient {
  if (!client) {
    client = createMirraClient({
      baseUrl: API_URL,
      tokenStore: isDesktop() ? keychainTokenStore : cookieTokenStore,
      onUserChange: () => listeners.forEach((l) => l()),
    });
  }
  return client;
}

export function onUserChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
