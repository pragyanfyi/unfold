import { registerGoogleOauth } from "@convex-dev/auth/components/google/test";
import { registerPassword } from "@convex-dev/auth/components/password/test";
import { registerUsername } from "@convex-dev/auth/components/username/test";
import { registerCore, sessionIdentity } from "@convex-dev/auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

function backend() {
  const t = convexTest(schema, modules);
  registerCore(t);
  registerGoogleOauth(t);
  registerPassword(t);
  registerUsername(t);
  return t;
}

const credentials = { username: "e2e-user", password: "correct horse battery staple" };

describe("password sign-up (E2E only)", () => {
  beforeEach(() => {
    // Convex sets these on every deployment; Convex Auth reads them to issue and check tokens.
    vi.stubEnv("CONVEX_CLOUD_URL", "https://example.convex.cloud");
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
    // Off by default, whatever the shell running the tests has set. Tests turn it on themselves.
    vi.stubEnv("E2E_PASSWORD_SIGN_UP", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is refused unless E2E_PASSWORD_SIGN_UP=1", async () => {
    const t = backend();
    await expect(t.mutation(api.auth.signUpWithUsernamePassword, credentials)).rejects.toThrow(
      "Password sign-up is disabled",
    );
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(0);
  });

  it("is refused for any other value of the switch", async () => {
    vi.stubEnv("E2E_PASSWORD_SIGN_UP", "true");
    const t = backend();
    await expect(t.mutation(api.auth.signUpWithUsernamePassword, credentials)).rejects.toThrow(
      "Password sign-up is disabled",
    );
  });

  it("creates a user, signs in and answers `me` when the switch is on", async () => {
    vi.stubEnv("E2E_PASSWORD_SIGN_UP", "1");
    const t = backend();
    expect(await t.query(api.users.me, {})).toBeNull();
    const result = await t.mutation(api.auth.signUpWithUsernamePassword, credentials);
    if (result.status !== "complete") throw new Error("sign-up did not complete");
    const me = await t.withIdentity(sessionIdentity(result.tokens)).query(api.users.me, {});
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
    expect(me).toEqual({ userId: users[0]._id });
  });
});
