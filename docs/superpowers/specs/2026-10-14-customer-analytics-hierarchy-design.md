# Customer Analytics Hierarchy

Date: 2026-10-14
Status: Draft for review

## Goal

Let customers answer “how is my profile performing?” quickly and understand what each aggregate count means.

## Design

Keep the existing time-range choices and aggregate metrics. Order the screen as: page title and time range, Engagement summary, Engagement trend, activity by source, link results, then the existing privacy note. The three summary metrics—Profile views, Unique views, and Link clicks—appear before the chart and remain easy to scan on a phone.

Use fixed display intervals so equally spaced chart bars represent equally sized periods: daily for Last 7 days; weekly for Last 30 days and Last 90 days; monthly for Lifetime. Aggregate the existing daily buckets in the customer UI; do not change stored events or summary totals. Label each period with its actual date span, including partial first or last periods when the selected rolling range cuts through a week or month.

Rename or annotate Traffic sources so customers know the total combines profile views and link clicks. Explain that Unknown / legacy contains events recorded without source attribution, including historical rows from before attribution was added. Keep the current privacy promise and do not expose visitor identities or raw visit history.

## Scope

- Customer route: /app/analytics.
- Analytics presentation and client-side trend grouping only.
- Existing aggregate query, range values, source attribution, and link-click totals remain authoritative.

## Constraints

- Preserve the current 7d, 30d, 90d, and lifetime cutoffs and the meaning of Profile views, Unique views, and Link clicks.
- Source totals continue to count views plus clicks; make that visible in the label or its supporting copy.
- Preserve aggregate-only storage and the existing privacy note.
- No new endpoints, stored fields, visitor-level records, filters, or exports.

## Acceptance criteria

1. The visible page title and time-range control precede the summary metrics; the trend follows the summary.
2. Summary totals do not change when trend periods are regrouped.
3. Last 7 days produces daily bars; Last 30 days and Last 90 days produce weekly bars; Lifetime produces monthly bars.
4. Every bar label identifies its period; equally spaced bars correspond to equally sized periods.
5. The source section says that counts combine profile views and link clicks, and explains the Unknown / legacy bucket accurately.
6. Empty ranges retain the existing helpful empty state and privacy explanation.
7. The phone layout has no horizontal overflow and keeps the three headline metrics easy to compare.

## Implementation boundary

No change to analytics persistence, attribution, access control, privacy scope, or backend range queries.
