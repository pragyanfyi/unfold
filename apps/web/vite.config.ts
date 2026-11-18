import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { convexOrigins } from "./src/features/security/csp";

// Identifies this build. CI sets GITHUB_SHA; a local build is just "dev".
// The browser compares its own value with /version.json to detect a newer deploy
// (see docs/adr/0007-new-version-notification.md).
const appVersion = process.env.GITHUB_SHA ?? "dev";

// Emits /version.json as a static asset of the client build, so checking for a
// new version never invokes the Worker.
function versionFile(): Plugin {
  return {
    name: "unfold-version-file",
    generateBundle() {
      if (this.environment.name !== "client") return;
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: appVersion }),
      });
    },
  };
}

const config = defineConfig(({ mode }) => {
  // Our Convex deployment, for the CSP (ADR 0015). Checked here, so a bad value fails the build.
  const env = { ...loadEnv(mode, process.cwd(), "VITE_CONVEX_"), ...process.env };
  const convex = convexOrigins({ url: env.VITE_CONVEX_URL, siteUrl: env.VITE_CONVEX_SITE_URL });
  return {
    resolve: { tsconfigPaths: true },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __CONVEX_ORIGINS__: JSON.stringify(convex),
    },
    plugins: [
      cloudflare({ viteEnvironment: { name: "ssr" } }),

      tanstackStart(),
      viteReact(),
      tailwindcss(),
      versionFile(),
    ],
  };
});

export default config;
