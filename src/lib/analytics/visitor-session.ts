const SESSION_KEY = "tapit:analytics-session";

export function getVisitorSessionKey(): string | undefined {
  try {
    const key = window.sessionStorage.getItem(SESSION_KEY) ?? window.crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, key);
    return key;
  } catch {
    return undefined;
  }
}
