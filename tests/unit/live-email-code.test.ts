import { beforeEach, describe, expect, it, vi } from "vitest";
import { request as httpRequest } from "node:http";

const listen = async (server: import("node:http").Server) => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return `http://127.0.0.1:${address.port}`;
};

const close = async (server: import("node:http").Server) => {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
};

const jsonRequest = (baseURL: string, path: string, token: string, body: unknown) =>
  fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const rawPost = (baseURL: string, body: string) => {
  const url = new URL(`${baseURL}/send`);
  const result = new Promise<{ response: import("node:http").IncomingMessage; body: string }>(
    (resolve, reject) => {
      const request = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            Authorization: "Bearer provider-secret",
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () =>
            resolve({ response, body: Buffer.concat(chunks).toString("utf8") }),
          );
        },
      );
      request.on("error", reject);
      request.end(body);
    },
  );
  return result;
};

const splitPost = (baseURL: string, body: string) => {
  const url = new URL(`${baseURL}/send`);
  let resolveResponse!: (value: {
    response: import("node:http").IncomingMessage;
    body: string;
  }) => void;
  let rejectResponse!: (error: Error) => void;
  const responsePromise = new Promise<{
    response: import("node:http").IncomingMessage;
    body: string;
  }>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const request = httpRequest(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        Authorization: "Bearer provider-secret",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolveResponse({ response, body: Buffer.concat(chunks).toString("utf8") }),
      );
    },
  );
  request.on("error", rejectResponse);
  request.write(body.slice(0, Math.ceil(body.length / 2)));
  return { request, responsePromise };
};

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

  it("accepts delivery and returns only the newest code for a normalized recipient", async () => {
    // @ts-expect-error The assigned production module is JavaScript and cannot receive a declaration file.
    const { createEmailSinkServer } = await import("../../scripts/live-email-sink.mjs");
    const sink = createEmailSinkServer({
      providerToken: "provider-secret",
      codeToken: "reader-secret",
    });
    const baseURL = await listen(sink.server);
    try {
      const first = await jsonRequest(baseURL, "/send", "provider-secret", {
        to: " Person@Example.test ",
        text: "https://tapit.test/auth?code=OldCode_1234567",
        html: "<p>ignored mailbox content</p>",
      });
      const second = await jsonRequest(baseURL, "/send", "provider-secret", {
        to: "Person@Example.test",
        text: "https://tapit.test/auth?code=NewCode_1234567890",
        html: "<p>ignored mailbox content</p>",
      });
      expect(first.status).toBe(202);
      expect(await first.json()).toEqual({ accepted: true });
      expect(second.status).toBe(202);

      const response = await fetch(`${baseURL}/code?email=person%40example.test&kind=signup`, {
        headers: { Authorization: "Bearer reader-secret" },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ code: "NewCode_1234567890" });
    } finally {
      await close(sink.server);
    }
  });

  it("uses request arrival order when POST bodies complete out of order", async () => {
    // @ts-expect-error The assigned production module is JavaScript and cannot receive a declaration file.
    const { createEmailSinkServer } = await import("../../scripts/live-email-sink.mjs");
    const sink = createEmailSinkServer({
      providerToken: "provider-secret",
      codeToken: "reader-secret",
    });
    const baseURL = await listen(sink.server);
    const oldBody = JSON.stringify({
      to: "race@example.test",
      text: "https://tapit.test/?code=OldCode_1234567",
    });
    const newBody = JSON.stringify({
      to: "race@example.test",
      text: "https://tapit.test/?code=NewCode_1234567",
    });
    let requestCount = 0;
    let resolveSecondRequest!: () => void;
    const secondRequestArrived = new Promise<void>((resolve) => {
      resolveSecondRequest = resolve;
    });
    const onRequest = () => {
      requestCount += 1;
      if (requestCount === 2) resolveSecondRequest();
    };
    sink.server.on("request", onRequest);
    try {
      const old = splitPost(baseURL, oldBody);
      const newRequest = rawPost(baseURL, newBody);
      await secondRequestArrived;
      old.request.end(oldBody.slice(Math.ceil(oldBody.length / 2)));
      await Promise.all([old.responsePromise, newRequest]);

      const response = await fetch(`${baseURL}/code?email=race%40example.test&kind=signup`, {
        headers: { Authorization: "Bearer reader-secret" },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ code: "NewCode_1234567" });
    } finally {
      sink.server.off("request", onRequest);
      await close(sink.server);
    }
  });

  it("rejects identical provider and reader tokens before listening", async () => {
    // @ts-expect-error The assigned production module is JavaScript and cannot receive a declaration file.
    const { createEmailSinkServer } = await import("../../scripts/live-email-sink.mjs");
    expect(() =>
      createEmailSinkServer({
        providerToken: "same-secret",
        codeToken: "same-secret",
      }),
    ).toThrow("different");
  });

  it("rejects wrong route tokens and oversized delivery bodies without message content", async () => {
    // @ts-expect-error The assigned production module is JavaScript and cannot receive a declaration file.
    const { createEmailSinkServer } = await import("../../scripts/live-email-sink.mjs");
    const sink = createEmailSinkServer({
      providerToken: "provider-secret",
      codeToken: "reader-secret",
    });
    const baseURL = await listen(sink.server);
    try {
      const providerResponse = await jsonRequest(baseURL, "/send", "wrong-provider", {
        to: "person@example.test",
        text: "private mailbox text",
      });
      const crossRouteProviderResponse = await jsonRequest(baseURL, "/send", "reader-secret", {
        to: "person@example.test",
        text: "https://tapit.test/auth?code=CrossRoute_123456",
      });
      const codeResponse = await fetch(`${baseURL}/code?email=person%40example.test&kind=signup`, {
        headers: { Authorization: "Bearer wrong-reader" },
      });
      const crossRouteReaderResponse = await fetch(
        `${baseURL}/code?email=person%40example.test&kind=signup`,
        { headers: { Authorization: "Bearer provider-secret" } },
      );
      const oversizedResponse = await fetch(`${baseURL}/send`, {
        method: "POST",
        headers: { Authorization: "Bearer provider-secret", "Content-Type": "application/json" },
        body: "x".repeat(262145),
      });
      expect(providerResponse.status).toBe(401);
      expect(await providerResponse.text()).not.toContain("private mailbox text");
      expect(crossRouteProviderResponse.status).toBe(401);
      expect(await crossRouteProviderResponse.text()).toBe("");
      expect(codeResponse.status).toBe(401);
      expect(await codeResponse.text()).toBe("");
      expect(crossRouteReaderResponse.status).toBe(401);
      expect(await crossRouteReaderResponse.text()).toBe("");
      expect(oversizedResponse.status).toBe(413);
      expect(await oversizedResponse.text()).toBe("");
    } finally {
      await close(sink.server);
    }
  });

  it("rejects an oversized declared body before waiting for its bytes", async () => {
    // @ts-expect-error The assigned production module is JavaScript and cannot receive a declaration file.
    const { createEmailSinkServer } = await import("../../scripts/live-email-sink.mjs");
    const sink = createEmailSinkServer({
      providerToken: "provider-secret",
      codeToken: "reader-secret",
    });
    const baseURL = await listen(sink.server);
    const url = new URL(`${baseURL}/send`);
    try {
      const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
        const pending = httpRequest(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: "POST",
            headers: {
              Authorization: "Bearer provider-secret",
              "Content-Type": "application/json",
              "Content-Length": 262145,
            },
          },
          resolve,
        );
        pending.on("response", (response) => {
          response.on("end", () => pending.destroy());
        });
        pending.on("error", reject);
        pending.flushHeaders();
      });
      expect(response.statusCode).toBe(413);
      response.resume();
    } finally {
      await close(sink.server);
    }
  });

  it("closes an oversized header-only request promptly", async () => {
    // @ts-expect-error The assigned production module is JavaScript and cannot receive a declaration file.
    const { createEmailSinkServer } = await import("../../scripts/live-email-sink.mjs");
    const sink = createEmailSinkServer({
      providerToken: "provider-secret",
      codeToken: "reader-secret",
    });
    const baseURL = await listen(sink.server);
    const url = new URL(`${baseURL}/send`);
    try {
      let request!: import("node:http").ClientRequest;
      let resolveRequestClosed!: () => void;
      const requestClosed = new Promise<void>((resolve) => {
        resolveRequestClosed = resolve;
      });
      const responsePromise = new Promise<import("node:http").IncomingMessage>((resolve) => {
        request = httpRequest(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: "POST",
            headers: {
              Authorization: "Bearer provider-secret",
              "Content-Type": "application/json",
              "Content-Length": 262145,
            },
          },
          resolve,
        );
        request.on("close", resolveRequestClosed);
        request.on("error", () => undefined);
        request.flushHeaders();
      });
      const response = await responsePromise;
      expect(response.statusCode).toBe(413);
      response.resume();
      await expect(
        Promise.race([
          requestClosed,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("request stayed open")), 500),
          ),
        ]),
      ).resolves.toBeUndefined();
      await expect(close(sink.server)).resolves.toBeUndefined();
    } finally {
      if (sink.server.listening) {
        sink.server.closeAllConnections?.();
        await close(sink.server);
      }
    }
  });

  it("closes cleanly after an aborted request body", async () => {
    // @ts-expect-error The assigned production module is JavaScript and cannot receive a declaration file.
    const { createEmailSinkServer } = await import("../../scripts/live-email-sink.mjs");
    const sink = createEmailSinkServer({
      providerToken: "provider-secret",
      codeToken: "reader-secret",
    });
    const baseURL = await listen(sink.server);
    const url = new URL(`${baseURL}/send`);
    const pending = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        Authorization: "Bearer provider-secret",
        "Content-Type": "application/json",
        "Content-Length": 1000,
      },
    });
    pending.on("error", () => undefined);
    pending.write('{"to":"abort@example.test"');
    pending.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    sink.server.closeAllConnections?.();
    await expect(close(sink.server)).resolves.toBeUndefined();
  });

  it("returns generic errors for missing codes, bodyless unknown routes, and malformed input", async () => {
    // @ts-expect-error The assigned production module is JavaScript and cannot receive a declaration file.
    const { createEmailSinkServer } = await import("../../scripts/live-email-sink.mjs");
    const sink = createEmailSinkServer({
      providerToken: "provider-secret",
      codeToken: "reader-secret",
    });
    const baseURL = await listen(sink.server);
    try {
      const missingCode = await jsonRequest(baseURL, "/send", "provider-secret", {
        to: "missing@example.test",
        text: "no verification link",
      });
      const malformed = await fetch(`${baseURL}/send`, {
        method: "POST",
        headers: { Authorization: "Bearer provider-secret", "Content-Type": "application/json" },
        body: "not-json",
      });
      const unknown = await fetch(`${baseURL}/unknown`);
      expect(missingCode.status).toBe(400);
      expect(await missingCode.text()).toBe("");
      expect(malformed.status).toBe(400);
      expect(await malformed.text()).toBe("");
      expect(unknown.status).toBe(404);
      expect(await unknown.text()).toBe("");
    } finally {
      await close(sink.server);
    }
  });

  it("extracts escaped HTML codes and rejects invalid flow kinds or codes", async () => {
    // @ts-expect-error The assigned production module is JavaScript and cannot receive a declaration file.
    const sinkModule = await import("../../scripts/live-email-sink.mjs");
    const { createEmailSinkServer, extractVerificationCode } = sinkModule;
    expect(extractVerificationCode("no code", "https://tapit.test/auth?code=short")).toBeNull();
    expect(
      extractVerificationCode(
        "no code",
        "https://tapit.test/auth?code=valid_code-12345678&amp;other=x",
      ),
    ).toBe("valid_code-12345678");
    expect(
      extractVerificationCode(
        "no code",
        "https://tapit.test/auth?code=short&code=valid_code-12345678",
      ),
    ).toBe("valid_code-12345678");

    const sink = createEmailSinkServer({
      providerToken: "provider-secret",
      codeToken: "reader-secret",
    });
    const baseURL = await listen(sink.server);
    try {
      const delivery = await jsonRequest(baseURL, "/send", "provider-secret", {
        to: "person@example.test",
        text: "ignored",
        html: "https://tapit.test/auth?code=valid_code-12345678&amp;other=x",
      });
      const invalidKind = await fetch(`${baseURL}/code?email=person%40example.test&kind=unknown`, {
        headers: { Authorization: "Bearer reader-secret" },
      });
      const missingEmail = await fetch(`${baseURL}/code?kind=signup`, {
        headers: { Authorization: "Bearer reader-secret" },
      });
      expect(delivery.status).toBe(202);
      expect(invalidKind.status).toBe(400);
      expect(await invalidKind.text()).toBe("");
      expect(missingEmail.status).toBe(400);
    } finally {
      await close(sink.server);
    }
  });
});
