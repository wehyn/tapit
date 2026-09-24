import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp({
  env: {
    TAPIT_SUPPORT_URL: v.string(),
    TAPIT_ADMIN_EMAILS: v.optional(v.string()),
    TAPIT_DEMO_AUTH_MODE: v.optional(v.literal("hosted-demo")),
  },
});

app.use(rateLimiter);

export default app;
