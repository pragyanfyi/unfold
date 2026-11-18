// Runs `convex dev` with any arguments, defaulting to a local backend that needs no account.
// A script instead of `CONVEX_AGENT_MODE=anonymous convex dev` so it also works in Windows shells.
// Anonymous mode only applies before a deployment is configured: one chosen with
// `convex dev --configure` is kept.
// It runs the CLI's JavaScript entry with this Node, with no shell, so arguments keep their
// boundaries on every platform (a path with spaces stays one argument).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// The CLI's entry is not in the package's exports, so find it from its `bin` field.
const require = createRequire(import.meta.url);
const manifest = require.resolve("convex/package.json");
const cli = join(dirname(manifest), require(manifest).bin.convex);
const env = { ...process.env, CONVEX_AGENT_MODE: process.env.CONVEX_AGENT_MODE ?? "anonymous" };
const child = spawn(process.execPath, [cli, "dev", ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
