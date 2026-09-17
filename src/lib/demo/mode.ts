export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}

export function isHostedDemoMode(): boolean {
  return isDemoMode() && process.env.NEXT_PUBLIC_DEMO_STORAGE === "convex";
}

export function isLocalDemoMode(): boolean {
  return isDemoMode() && !isHostedDemoMode();
}

export function isLiveMode(): boolean {
  return !isDemoMode();
}
