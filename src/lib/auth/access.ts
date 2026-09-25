export type AccountAccessStatus =
  "unauthenticated" | "unprovisioned" | "pending" | "invited" | "active" | "deleted";

export type AccessSnapshot = {
  authenticated: boolean;
  accountStatus?: AccountAccessStatus;
  role: "admin" | "customer" | null;
  profileId: string | null;
};

/**
 * Older hosted-demo deployments do not return accountStatus yet. Their
 * authenticated access response is still safe to treat as active until the
 * deployment catches up with the client.
 */
export function isActiveAccess(
  access: AccessSnapshot | null | undefined,
): access is AccessSnapshot & { authenticated: true } {
  return (
    access?.authenticated === true &&
    (access.accountStatus === undefined || access.accountStatus === "active")
  );
}
