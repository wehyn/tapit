import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp({
  env: {
    TAPIT_SUPPORT_URL: v.string(),
    TAPIT_AUTH_EMAIL_FROM: v.string(),
    TAPIT_AUTH_EMAIL_API_KEY: v.string(),
    TAPIT_AUTH_EMAIL_API_URL: v.string(),
  },
});

app.use(rateLimiter);

export default app;
