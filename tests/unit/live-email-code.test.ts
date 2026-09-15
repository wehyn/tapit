import { beforeEach, describe, expect, it, vi } from "vitest";

describe("live email code adapter contract", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a malformed code without exposing the response body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ body: "private mailbox text" }));
    vi.stubGlobal("fetch", fetchMock);
    const { readLiveVerificationCode } = await import("../../scripts/live-e2e-contract.mjs");

    await expect(
      readLiveVerificationCode(
        {
          emailCodeURL: "https://mailbox.example.test/code",
          emailCodeToken: "mailbox-token",
        },
        "person@example.test",
        "setup",
        { timeoutMs: 0, pollIntervalMs: 0 },
      ),
    ).rejects.toThrow("did not return a verification code");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("private mailbox text");
  });
});
