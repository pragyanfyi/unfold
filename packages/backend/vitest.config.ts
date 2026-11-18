import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Backend tests run Convex functions in memory with convex-test. They live in `tests/`, outside
// `convex/`, so the Convex CLI never bundles them as functions.
export default defineConfig({
  resolve: {
    alias: {
      // Argon2's wasm cannot load under Vitest, so the tests use a stub that is not a hash.
      "password-hash-wasm/argon2id": fileURLToPath(
        new URL("./tests/argon2id-stub.ts", import.meta.url),
      ),
    },
  },
  test: { environment: "edge-runtime", include: ["tests/**/*.test.ts"] },
});
