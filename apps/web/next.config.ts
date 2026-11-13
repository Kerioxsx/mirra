import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

/**
 * One frontend for web and desktop (ADR-001): a static export that any CDN can serve and that
 * Tauri bundles from `out/`. No Next server features — all data comes from the FastAPI backend.
 */
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@mirra/api-client",
    "@mirra/dresser-engine",
    "@mirra/garment-system",
    "@mirra/outfit-engine",
    "@mirra/shared-types",
    "@mirra/ui",
  ],
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
};

export default config;
