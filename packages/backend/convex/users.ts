import { vGoogleProfile } from "@convex-dev/auth/methods/google/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

// A user holds nothing but its identity. Name and email stay with Google; add a field here
// (backward compatibly, see schema.ts) only when a feature needs it.
export const createUserFromGoogle = internalMutation({
  args: { method: v.object({ name: v.literal("google"), profile: vGoogleProfile }) },
  returns: v.id("users"),
  handler: async (ctx) => ctx.db.insert("users", {}),
});

// The deployment switch that keeps password accounts out of production (ADR 0016).
function passwordSignUpEnabled(): boolean {
  return process.env.E2E_PASSWORD_SIGN_UP === "1";
}

export const createUserFromPassword = internalMutation({
  args: { method: v.any() },
  returns: v.id("users"),
  handler: async (ctx) => {
    if (!passwordSignUpEnabled()) throw new Error("Password sign-up is disabled");
    return ctx.db.insert("users", {});
  },
});

// The caller's user id, or null when signed out. Nothing about the caller leaves the server.
export const me = query({
  args: {},
  returns: v.union(v.null(), v.object({ userId: v.id("users") })),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId === null ? null : { userId };
  },
});
