import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: the Cloudflare and TanStack Start
// plugins configure a Workers runtime that unit tests do not run in.
export default defineConfig({
  plugins: [react()],
  // Mirrors the build-time constant that vite.config.ts injects.
  define: { __APP_VERSION__: JSON.stringify("test-current") },
  test: {
    // Pure-logic tests run in node. A test that needs a DOM opts in with
    // `// @vitest-environment jsdom` at the top of the file.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Reported, never enforced: no threshold (ADR 0011). Run with `pnpm test:coverage`.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/routeTree.gen.ts", "src/components/ui/**"],
      reporter: ["text-summary", "html"],
    },
  },
});
