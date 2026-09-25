export type AnalyticsConsentChoice = "allow" | "decline" | "unset";

const CONSENT_KEY = "tapit:analytics-consent";
const SESSION_KEY = "tapit:analytics-session";
const CHANGED_EVENT = "tapit:analytics-consent-changed";
let memoryChoice: AnalyticsConsentChoice = "unset";

export function getAnalyticsConsent(): AnalyticsConsentChoice {
  if (typeof window === "undefined") return "unset";
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "allow" || value === "decline" ? value : memoryChoice;
  } catch {
    return memoryChoice;
  }
}

export function setAnalyticsConsent(choice: Exclude<AnalyticsConsentChoice, "unset">) {
  memoryChoice = choice;
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // The choice still applies to this page even if browser storage is unavailable.
  }
  if (choice === "decline") clearAnalyticsSessionKey();
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

function clearAnalyticsSessionKey() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Browser storage can be unavailable; no key can be read or created in that case.
  }
}

export function subscribeToAnalyticsConsent(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_KEY && event.newValue === "decline") {
      memoryChoice = "decline";
      clearAnalyticsSessionKey();
    }
    onChange();
  };
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getAnalyticsSessionKey(): string | undefined {
  if (getAnalyticsConsent() !== "allow") return undefined;
  try {
    const key = window.sessionStorage.getItem(SESSION_KEY) ?? crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, key);
    return key;
  } catch {
    return undefined;
  }
}
