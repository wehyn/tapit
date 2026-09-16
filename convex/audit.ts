import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireAdministrator } from "./admin";
import schema from "./schema";

export const list = query({
  args: { search: v.optional(v.string()) },
  returns: v.array(schema.doc("auditLogs")),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_scope_and_occurredAt", (query) => query.eq("scope", account.scope))
      .order("desc")
      .take(200);
    const search = args.search?.trim().toLowerCase();
    if (!search) return rows;
    return rows.filter((row) =>
      `${row.actorLabel} ${row.action} ${row.before ?? ""} ${row.after ?? ""}`
        .toLowerCase()
        .includes(search),
    );
  },
});
