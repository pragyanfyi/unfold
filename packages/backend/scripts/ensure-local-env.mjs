// Gives a local Convex backend placeholder values for the environment variables the app
// declares as required (convex/convex.config.ts). Convex refuses to push functions to a
// deployment that lacks them, and a fresh local backend (a new checkout, CI) has none.
//
// It only fills in names that are missing, so real values you set yourself with
// `convex env set` are kept. A placeholder lets the backend deploy; it does not make Google
// sign-in work. To try the real thing, set your own Google OAuth client (docs/operations/development.md).
//
// Never put a real secret here: this file is committed.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const PLACEHOLDERS = {
  AUTH_GOOGLE_CLIENT_ID: "placeholder-google-client-id",
  AUTH_GOOGLE_CLIENT_SECRET: "placeholder-google-client-secret",
};

const require = createRequire(import.meta.url);
const manifest = require.resolve("convex/package.json");
const cli = join(dirname(manifest), require(manifest).bin.convex);
const env = { ...process.env, CONVEX_AGENT_MODE: process.env.CONVEX_AGENT_MODE ?? "anonymous" };

// Runs the CLI with no shell, so values keep their boundaries on every platform. Output is
// captured and only names are ever printed, never values.
function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { env, encoding: "utf8" });
}

function convex(args) {
  const result = run(args);
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

// On a fresh checkout no deployment is configured yet (no `.env.local`, no CONVEX_DEPLOYMENT),
// and `env` needs one. A first push creates the local deployment. It is refused for the missing
// variables, which is expected and fixed below, so its result is ignored. Only in that case:
// a configured deployment is never pushed to from here.
if (!existsSync(".env.local") && !process.env.CONVEX_DEPLOYMENT) {
  run(["dev", "--once", "--typecheck", "disable"]);
}

const existing = new Set(
  convex(["env", "list", "--names-only"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
);

for (const [name, value] of Object.entries(PLACEHOLDERS)) {
  if (existing.has(name)) continue;
  convex(["env", "set", name, value]);
  console.log(`Set placeholder ${name} on the local backend.`);
}
