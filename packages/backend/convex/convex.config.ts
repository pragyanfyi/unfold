import authGoogle from "@convex-dev/auth/components/google/convex.config.js";
import authPassword from "@convex-dev/auth/components/password/convex.config.js";
import authUsername from "@convex-dev/auth/components/username/convex.config.js";
import auth from "@convex-dev/auth/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

// Convex Auth v2 with Google (ADR 0016), plus username/password for E2E only (see auth.ts).
// The Google client is required, so every deployment needs both values before it accepts a
// push: production has the real client, local backends get placeholders
// (scripts/ensure-local-env.mjs).
const app = defineApp({
  env: {
    AUTH_GOOGLE_CLIENT_ID: v.string(),
    AUTH_GOOGLE_CLIENT_SECRET: v.string(),
  },
});
app.use(auth);
app.use(authGoogle, {
  httpPrefix: "/oauth/google",
  env: {
    CLIENT_ID: app.env.AUTH_GOOGLE_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GOOGLE_CLIENT_SECRET,
  },
});
app.use(authPassword);
app.use(authUsername);

export default app;
