type OwnedProfileQueryResult =
  | { status: "pending" }
  | { status: "error"; error: Error }
  | { status: "success"; data: { _id: string } | null };

export function matchesOwnedProfileQuery(
  result: OwnedProfileQueryResult,
  profileId: string,
): boolean {
  return result.status === "success" && result.data !== null && result.data._id === profileId;
}
