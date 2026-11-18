// Runs a local Convex backend just for the E2E tests, separate from the one `pnpm dev` uses:
// its own data, its own ports (3230 for the client, 3231 for HTTP actions), and the test-only
// password sign-up switched on (ADR 0016). Playwright starts it (apps/web/playwright.config.ts)
// and stops it after the run.
//
// Every run starts from an empty database in `.e2e/`, a git-ignored Convex project whose
// functions are this package's `convex/` folder. Code generation is off, so the committed
// `convex/_generated` is never touched.
//
// E2E_PASSWORD_SIGN_UP=1 lets anyone create a password account. It is set here, on this
// throwaway local backend, and must never be set anywhere else (the deploy workflow checks
// production).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const E2E_CLOUD_PORT = 3230;
const E2E_SITE_PORT = 3231;

const ENV = {
  // Placeholders: the Google client is required to push, but E2E never signs in with Google.
  AUTH_GOOGLE_CLIENT_ID: "placeholder-google-client-id",
  AUTH_GOOGLE_CLIENT_SECRET: "placeholder-google-client-secret",
  E2E_PASSWORD_SIGN_UP: "1",
};

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const project = join(pkg, ".e2e");
const require = createRequire(import.meta.url);
const manifest = require.resolve("convex/package.json");
const cli = join(dirname(manifest), require(manifest).bin.convex);
const env = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
// Ignore a deployment chosen in the shell: this project picks its own.
delete env.CONVEX_DEPLOYMENT;
const ports = [
  "--local-cloud-port",
  String(E2E_CLOUD_PORT),
  "--local-site-port",
  String(E2E_SITE_PORT),
];
const quiet = ["--codegen", "disable", "--typecheck", "disable"];

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: project, env, encoding: "utf8" });
}

rmSync(project, { recursive: true, force: true });
mkdirSync(project);
writeFileSync(join(project, "convex.json"), JSON.stringify({ functions: "../convex" }));
writeFileSync(
  join(project, "package.json"),
  // The CLI insists on `convex` being a dependency; it resolves from this package's node_modules.
  JSON.stringify({
    name: "unfold-e2e-backend",
    private: true,
    type: "module",
    dependencies: { convex: "*" },
  }),
);

// The first push creates the deployment and is refused for the missing variables.
const first = run(["dev", "--once", ...quiet, ...ports]);
if (!existsSync(join(project, ".env.local"))) {
  process.stderr.write(first.stderr);
  process.exit(first.status || 1);
}
for (const [name, value] of Object.entries(ENV)) {
  const result = run(["env", "set", name, value]);
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

// Stays running and pushes the functions. Playwright waits for the CLI's "Convex functions
// ready!" line before it starts the tests.
const child = spawn(process.execPath, [cli, "dev", ...quiet, "--tail-logs", "disable", ...ports], {
  cwd: project,
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
