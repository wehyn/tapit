export function requirePairedConvexSiteUrl(cloudUrl: string, siteUrl: string): string {
  const mismatch = "Convex site URL does not match the configured deployment.";
  let cloud: URL;
  let site: URL;
  try {
    cloud = new URL(cloudUrl);
    site = new URL(siteUrl);
  } catch {
    throw new Error(mismatch);
  }
  const expectedSiteHost = cloud.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  if (
    cloud.protocol !== "https:" ||
    cloud.port !== "" ||
    !cloud.hostname.endsWith(".convex.cloud") ||
    expectedSiteHost === ".convex.site" ||
    site.protocol !== "https:" ||
    site.port !== "" ||
    site.hostname !== expectedSiteHost ||
    cloud.username ||
    cloud.password ||
    site.username ||
    site.password ||
    cloud.pathname !== "/" ||
    site.pathname !== "/" ||
    cloud.search ||
    site.search ||
    cloud.hash ||
    site.hash
  ) {
    throw new Error(mismatch);
  }
  return site.origin;
}
