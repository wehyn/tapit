import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";

import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAdministrator } from "./admin";
import schema from "./schema";

const auditEntryValidator = schema.doc("auditLogs").extend({
  targetAccountEmail: v.optional(v.string()),
});

async function withTargetAccountEmail(ctx: QueryCtx, row: Doc<"auditLogs">) {
  const targetAccount = row.accountId ? await ctx.db.get(row.accountId) : null;
  return {
    ...row,
    ...(targetAccount !== null &&
    targetAccount.scope === row.scope &&
    targetAccount.email !== undefined
      ? { targetAccountEmail: targetAccount.email }
      : {}),
  };
}

export const list = query({
  args: { search: v.optional(v.string()) },
  returns: v.array(auditEntryValidator),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_scope_and_occurredAt", (query) => query.eq("scope", account.scope))
      .order("desc")
      .take(200);
    const entries = await Promise.all(rows.map((row) => withTargetAccountEmail(ctx, row)));
    const search = args.search?.trim().toLowerCase();
    if (!search) return entries;
    return entries.filter((row) =>
      `${row.actorLabel} ${row.targetAccountEmail ?? ""} ${row.action} ${row.before ?? ""} ${row.after ?? ""}`
        .toLowerCase()
        .includes(search),
    );
  },
});

export const listPaginated = query({
  args: { search: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(auditEntryValidator),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_scope_and_occurredAt", (query) => query.eq("scope", account.scope))
      .order("desc")
      .paginate(args.paginationOpts);
    const entries = await Promise.all(rows.page.map((row) => withTargetAccountEmail(ctx, row)));
    const search = args.search?.trim().toLowerCase();
    return {
      ...rows,
      page: search
        ? entries.filter((row) =>
            `${row.actorLabel} ${row.targetAccountEmail ?? ""} ${row.action} ${row.before ?? ""} ${row.after ?? ""}`
              .toLowerCase()
              .includes(search),
          )
        : entries,
    };
  },
});
