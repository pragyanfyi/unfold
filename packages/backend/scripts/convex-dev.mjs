// Runs `convex dev` with any arguments, defaulting to a local backend that needs no account.
// A script instead of `CONVEX_AGENT_MODE=anonymous convex dev` so it also works in Windows shells.
// Anonymous mode only applies before a deployment is configured: one chosen with
// `convex dev --configure` is kept.
import { spawn } from "node:child_process";

const env = { ...process.env, CONVEX_AGENT_MODE: process.env.CONVEX_AGENT_MODE ?? "anonymous" };
const child = spawn("convex", ["dev", ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
