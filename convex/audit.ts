import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireAdministrator } from "./admin";
import schema from "./schema";

export const list = query({
  args: { search: v.optional(v.string()) },
  returns: v.array(schema.doc("auditLogs").extend({ targetAccountEmail: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_scope_and_occurredAt", (query) => query.eq("scope", account.scope))
      .order("desc")
      .take(200);
    const entries = await Promise.all(
      rows.map(async (row) => {
        const targetAccount = row.accountId ? await ctx.db.get(row.accountId) : null;
        return {
          ...row,
          ...(targetAccount !== null && targetAccount.scope === row.scope
            ? { targetAccountEmail: targetAccount.email }
            : {}),
        };
      }),
    );
    const search = args.search?.trim().toLowerCase();
    if (!search) return entries;
    return entries.filter((row) =>
      `${row.actorLabel} ${row.targetAccountEmail ?? ""} ${row.action} ${row.before ?? ""} ${row.after ?? ""}`
        .toLowerCase()
        .includes(search),
    );
  },
});
