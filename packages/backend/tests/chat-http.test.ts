import { registerPassword } from "@convex-dev/auth/components/password/test";
import { registerUsername } from "@convex-dev/auth/components/username/test";
import { registerCore } from "@convex-dev/auth/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../convex/schema";

// The HTTP action's front door (`convex/http.ts`): CORS and sign-in. What it does once a request
// is accepted is tested in chat-handler.test.ts and chat-turns.test.ts.

const modules = import.meta.glob("../convex/**/*.ts");

function backend() {
  const t = convexTest(schema, modules);
  registerCore(t);
  registerPassword(t);
  registerUsername(t);
  return t;
}

const APP = "http://localhost:3000";
const body = JSON.stringify({ messages: [] });

describe("POST /chat: CORS", () => {
  it("answers the preflight for the app's origin, with every header the chat client sends", async () => {
    const res = await backend().fetch("/chat", {
      method: "OPTIONS",
      headers: { origin: APP, "access-control-request-method": "POST" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP);
    const allowed = (res.headers.get("access-control-allow-headers") ?? "").split(/,\s*/);
    // `x-run-id` is sent by the chat client itself; without it the browser blocks every request.
    for (const header of ["content-type", "authorization", "x-byok-anthropic", "x-run-id"]) {
      expect(allowed).toContain(header);
    }
    expect(Number(res.headers.get("access-control-max-age"))).toBeGreaterThan(60);
  });

  it("names no origin but the app's, never a wildcard", async () => {
    const t = backend();
    for (const origin of ["https://evil.example", "null", "http://localhost:3000.evil.example"]) {
      const res = await t.fetch("/chat", { method: "OPTIONS", headers: { origin } });
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
    const none = await t.fetch("/chat", { method: "OPTIONS" });
    expect(none.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("POST /chat: sign-in", () => {
  it("answers 401, with CORS headers, when there is no token", async () => {
    const res = await backend().fetch("/chat", {
      method: "POST",
      headers: { origin: APP, "x-byok-anthropic": "sk-ant-FAKE-HTTP-0123456789" },
      body,
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP);
    expect(await res.json()).toMatchObject({ error: { type: "signed_out" } });
  });

  it("answers 401, not an error with a stack, for a malformed token", async () => {
    const res = await backend().fetch("/chat", {
      method: "POST",
      headers: { origin: APP, authorization: "Bearer not.a.jwt" },
      body,
    });
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain("signed_out");
    expect(text).not.toContain("not.a.jwt");
    expect(text).not.toMatch(/\bat\s.+:\d+/); // no stack frames
  });
});
