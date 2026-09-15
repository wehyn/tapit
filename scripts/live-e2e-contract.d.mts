export const LIVE_PROVISION_CONFIRMATION: "I_UNDERSTAND_NON_PRODUCTION";

export const liveContractEnvNames: Record<string, string>;

export function missingLiveContract(
  env: Record<string, string | undefined>,
  options?: { includeSetup?: boolean },
): string[];

export function validateLiveContract(
  env: Record<string, string | undefined>,
  options?: { requireWrapper?: boolean; requireConfirmation?: boolean },
): string | null;

export function validateObservedLiveApp(
  expected: Record<string, string | undefined>,
  observed: { mode?: string; appEnvironment?: string; convexUrl?: string },
): string | null;

export function readLiveAppContract(
  env: Record<string, string | undefined>,
): Promise<string | null>;

export function readLiveVerificationCode(
  env: { emailCodeURL: string; emailCodeToken: string },
  recipient: string,
  kind: "signup" | "setup" | "reset" | "verification",
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<string>;
