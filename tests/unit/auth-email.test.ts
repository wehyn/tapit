import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("../../convex/_generated/server", () => ({
  env: {
    TAPIT_AUTH_EMAIL_API_URL: "https://mailer.example.test/send",
    TAPIT_AUTH_EMAIL_API_KEY: "secret-api-key",
    TAPIT_AUTH_EMAIL_FROM: "Tapit <auth@example.test>",
    TAPIT_SUPPORT_URL: "https://tapit.example.test/support",
  },
}));

describe("provider-neutral authentication email boundary", () => {
  const request = {
    identifier: "person@example.test",
    url: 'https://tapit.example.test/verify?code=<secret>&x="quoted"',
    expires: new Date("2026-09-15T08:00:00.000Z"),
    token: "token-secret",
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("builds account-security content with expiry, support, and escaped HTML", async () => {
    const { buildAuthEmailMessage } = await import("../../convex/authEmail");

    const message = buildAuthEmailMessage(
      request,
      "https://tapit.example.test/support?topic=account",
    );

    expect(message.subject).toBe("Tapit account security");
    expect(message.text).toContain(request.url);
    expect(message.text).toContain("2026-09-15T08:00:00.000Z");
    expect(message.text).toContain("https://tapit.example.test/support?topic=account");
    expect(message.html).toContain("2026-09-15T08:00:00.000Z");
    expect(message.html).toContain("https://tapit.example.test/support?topic=account");
    expect(message.html).toContain("&lt;secret&gt;");
    expect(message.html).toContain("&quot;quoted&quot;");
    expect(message.html).not.toContain("<secret>");
  });

  it("posts the message and logs only provider status on failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendAuthEmail } = await import("../../convex/authEmail");

    await sendAuthEmail(request);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://mailer.example.test/send",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret-api-key" }),
      }),
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as {
      to: string;
      from: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(requestBody).toMatchObject({
      to: request.identifier,
      from: "Tapit <auth@example.test>",
      subject: "Tapit account security",
    });
    expect(requestBody.text).toContain(request.url);
    expect(requestBody.html).toContain("&lt;secret&gt;");
    expect(requestBody.html).not.toContain("<secret>");
    expect(errorSpy).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response("provider body", { status: 503 }));
    await expect(sendAuthEmail(request)).rejects.toThrow(
      "Authentication email service unavailable.",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "Tapit authentication email provider rejected the request",
      { status: 503 },
    );
    const logText = JSON.stringify(errorSpy.mock.calls);
    expect(logText).not.toContain(request.url);
    expect(logText).not.toContain(request.token);
    expect(logText).not.toContain("secret-api-key");
    expect(logText).not.toContain("provider body");
    errorSpy.mockRestore();
  });
});
