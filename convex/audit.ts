import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireAdministrator } from "./admin";

export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const rows = await ctx.db.query("auditLogs").withIndex("by_occurredAt").order("desc").collect();
    const search = args.search?.trim().toLowerCase();
    if (!search) return rows;
    return rows.filter((row) =>
      `${row.actorLabel} ${row.action} ${row.before ?? ""} ${row.after ?? ""}`
        .toLowerCase()
        .includes(search),
    );
  },
});
