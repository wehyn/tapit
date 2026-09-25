import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const DAY = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 25;

export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const analyticsCutoff = new Date(now);
    analyticsCutoff.setUTCMonth(analyticsCutoff.getUTCMonth() - 13);
    const auditCutoff = new Date(now);
    auditCutoff.setUTCFullYear(auditCutoff.getUTCFullYear() - 1);

    const invitationCutoff = now - 30 * DAY;
    const [
      sessions,
      analytics,
      audits,
      expiredInvites,
      acceptedInvites,
      invalidatedInvites,
      usedInvites,
      expiredChallenges,
    ] = await Promise.all([
      ctx.db
        .query("analyticsSessions")
        .withIndex("by_firstSeenAt", (q) => q.lt("firstSeenAt", now - 90 * DAY))
        .take(BATCH_SIZE),
      ctx.db
        .query("analytics")
        .withIndex("by_bucket", (q) => q.lt("bucketStart", analyticsCutoff.getTime()))
        .take(BATCH_SIZE),
      ctx.db
        .query("auditLogs")
        .withIndex("by_occurredAt", (q) => q.lt("occurredAt", auditCutoff.getTime()))
        .take(BATCH_SIZE),
      ctx.db
        .query("invitations")
        .withIndex("by_expiresAt", (q) => q.gt("expiresAt", 0).lt("expiresAt", invitationCutoff))
        .take(BATCH_SIZE),
      ctx.db
        .query("invitations")
        .withIndex("by_acceptedAt", (q) => q.gt("acceptedAt", 0).lt("acceptedAt", invitationCutoff))
        .take(BATCH_SIZE),
      ctx.db
        .query("invitations")
        .withIndex("by_invalidatedAt", (q) =>
          q.gt("invalidatedAt", 0).lt("invalidatedAt", invitationCutoff),
        )
        .take(BATCH_SIZE),
      ctx.db
        .query("invitations")
        .withIndex("by_usedAt", (q) => q.gt("usedAt", 0).lt("usedAt", invitationCutoff))
        .take(BATCH_SIZE),
      ctx.db
        .query("cardClaimChallenges")
        .withIndex("by_expiresAt", (q) => q.lt("expiresAt", invitationCutoff))
        .take(BATCH_SIZE),
    ]);

    const invitations = new Map(
      [...expiredInvites, ...acceptedInvites, ...invalidatedInvites, ...usedInvites].map((row) => [
        row._id,
        row,
      ]),
    );
    for (const row of [
      ...sessions,
      ...analytics,
      ...audits,
      ...invitations.values(),
      ...expiredChallenges,
    ])
      await ctx.db.delete(row._id);
    if (
      [
        sessions,
        analytics,
        audits,
        expiredInvites,
        acceptedInvites,
        invalidatedInvites,
        usedInvites,
        expiredChallenges,
      ].some((rows) => rows.length === BATCH_SIZE)
    )
      await ctx.scheduler.runAfter(0, internal.retention.prune, {});
  },
});
