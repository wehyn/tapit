import { componentsGeneric } from "convex/server";
import type { ComponentApi } from "@convex-dev/rate-limiter/_generated/component.js";

/** Typed access to app-installed Convex components without depending on app codegen. */
export const components = componentsGeneric() as unknown as {
  rateLimiter: ComponentApi<"rateLimiter">;
};
