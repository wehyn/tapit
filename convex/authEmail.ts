import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";

import { env } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { components } from "./_generated/api";

export type AuthEmailRequest = {
  identifier: string;
  url: string;
  expires: Date;
  token: string;
};

export type AuthEmailMessage = {
  subject: string;
  text: string;
  html: string;
};

const authEmailLimiter = new RateLimiter(components.rateLimiter, {
  authEmail: { kind: "fixed window", rate: 3, period: HOUR },
});

export function normalizeAuthEmail(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>\"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export function buildAuthEmailMessage(
  request: AuthEmailRequest,
  supportUrl: string,
): AuthEmailMessage {
  const expiresAt = request.expires.toISOString();
  const safeUrl = escapeHtml(request.url);
  const safeSupportUrl = escapeHtml(supportUrl);
  return {
    subject: "Tapit account security",
    text: [
      "Use this Tapit account-security link:",
      request.url,
      "",
      `This link expires at ${expiresAt}.`,
      `Need help? ${supportUrl}`,
    ].join("\n"),
    html: [
      "<p>Use this Tapit account-security link:</p>",
      `<p><a href="${safeUrl}">Continue securely</a></p>`,
      `<p>This link expires at ${expiresAt}.</p>`,
      `<p>Need help? <a href="${safeSupportUrl}">${safeSupportUrl}</a></p>`,
    ].join(""),
  };
}

type ProviderRequest = AuthEmailMessage & {
  to: string;
  from: string;
  apiKey: string;
  endpoint: string;
};

async function sendThroughSelectedProvider(input: ProviderRequest): Promise<Response> {
  return await fetch(input.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.to,
      from: input.from,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });
}

export async function sendAuthEmail(request: AuthEmailRequest, ctx?: ActionCtx): Promise<void> {
  if (ctx !== undefined) {
    const rateLimit = await authEmailLimiter.limit(ctx, "authEmail", {
      key: normalizeAuthEmail(request.identifier),
    });
    if (!rateLimit.ok) {
      console.error("Tapit authentication email request rate limited", {
        status: "rate-limited",
      });
      throw new Error("Authentication email service unavailable.");
    }
  }
  const message = buildAuthEmailMessage(request, env.TAPIT_SUPPORT_URL);
  let response: Response;
  try {
    response = await sendThroughSelectedProvider({
      to: request.identifier,
      from: env.TAPIT_AUTH_EMAIL_FROM,
      apiKey: env.TAPIT_AUTH_EMAIL_API_KEY,
      endpoint: env.TAPIT_AUTH_EMAIL_API_URL,
      ...message,
    });
  } catch {
    console.error("Tapit authentication email provider request failed", {
      status: "network-error",
    });
    throw new Error("Authentication email service unavailable.");
  }
  if (!response.ok) {
    console.error("Tapit authentication email provider rejected the request", {
      status: response.status,
    });
    throw new Error("Authentication email service unavailable.");
  }
}
