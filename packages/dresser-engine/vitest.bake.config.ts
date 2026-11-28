import { defineConfig } from "vitest/config";

/** Not tests: one-off asset bakes (pnpm bake:looks). Kept out of `vitest run`. */
export default defineConfig({
  test: { include: ["scripts/*.bake.ts"] },
});
