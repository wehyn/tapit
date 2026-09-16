import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 262144;
const BODY_TIMEOUT_MS = 5000;
const VALID_KINDS = new Set(["signup", "setup", "reset", "verification"]);
const CODE_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

const genericResponse = (response, status) => {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status);
  response.end();
};

const rejectAndCloseRequest = (request, response, status) => {
  genericResponse(response, status);
  const closeRequest = () => request.destroy();
  response.once("finish", closeRequest);
  response.once("close", closeRequest);
};

const hasBearerToken = (request, expected) => {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return false;
  const actual = Buffer.from(authorization.slice(7));
  const target = Buffer.from(expected);
  return actual.length === target.length && actual.length > 0 && timingSafeEqual(actual, target);
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("aborted", onAborted);
      request.off("close", onClose);
      request.setTimeout(0);
      callback(value);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        finish(reject, Object.assign(new Error("request too large"), { statusCode: 413 }));
      } else {
        chunks.push(chunk);
      }
    };
    const onEnd = () => finish(resolve, Buffer.concat(chunks).toString("utf8"));
    const onError = (error) => finish(reject, error);
    const onAborted = () => finish(reject, new Error("request aborted"));
    const onClose = () => {
      if (!request.complete) finish(reject, new Error("request closed"));
    };

    request.setTimeout(BODY_TIMEOUT_MS, () => {
      request.destroy();
      finish(reject, Object.assign(new Error("request timeout"), { statusCode: 408 }));
    });
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
    request.on("aborted", onAborted);
    request.on("close", onClose);
  });

const normalizeRecipient = (recipient) =>
  typeof recipient === "string" ? recipient.trim().toLowerCase() : "";

export const extractVerificationCode = (text, html) => {
  const content = [text, html]
    .filter((value) => typeof value === "string")
    .join("\n")
    .replaceAll("&amp;", "&");
  const urls = content.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  for (const value of urls) {
    try {
      for (const code of new URL(value).searchParams.getAll("code")) {
        if (CODE_PATTERN.test(code)) return code;
      }
    } catch {
      // Ignore malformed URL-like text and continue scanning for the first valid code.
    }
  }
  return null;
};

export const createEmailSinkServer = ({
  host = "127.0.0.1",
  port = 8025,
  providerToken,
  codeToken,
}) => {
  if (!providerToken || !codeToken) {
    throw new Error("TAPIT email sink requires both bearer tokens");
  }
  if (providerToken === codeToken) {
    throw new Error("TAPIT email sink requires different provider and reader tokens");
  }

  const codes = new Map();
  let nextArrivalSequence = 0;
  const server = createServer(async (request, response) => {
    const arrivalSequence = ++nextArrivalSequence;
    try {
      const requestURL = new URL(request.url ?? "/", `http://${host}:${port}`);

      if (request.method === "POST" && requestURL.pathname === "/send") {
        if (!hasBearerToken(request, providerToken)) return genericResponse(response, 401);
        const contentLength = request.headers["content-length"];
        if (
          contentLength !== undefined &&
          (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)
        ) {
          rejectAndCloseRequest(request, response, 413);
          return;
        }
        let body;
        try {
          body = JSON.parse(await readBody(request));
        } catch (error) {
          const status = error?.statusCode === 413 ? 413 : 400;
          if (status === 413) {
            rejectAndCloseRequest(request, response, status);
          } else {
            genericResponse(response, status);
          }
          return;
        }
        const recipient = normalizeRecipient(body?.to);
        if (!recipient) return genericResponse(response, 400);
        const code = extractVerificationCode(body?.text, body?.html);
        if (!code) return genericResponse(response, 400);
        const current = codes.get(recipient);
        if (!current || arrivalSequence > current.arrivalSequence) {
          codes.set(recipient, { code, arrivalSequence });
        }
        response.writeHead(202, { "Content-Type": "application/json" });
        return response.end(JSON.stringify({ accepted: true }));
      }

      if (request.method === "GET" && requestURL.pathname === "/code") {
        if (!hasBearerToken(request, codeToken)) return genericResponse(response, 401);
        const recipient = normalizeRecipient(requestURL.searchParams.get("email"));
        const kind = requestURL.searchParams.get("kind");
        if (!recipient || !VALID_KINDS.has(kind)) return genericResponse(response, 400);
        const entry = codes.get(recipient);
        if (!entry) return genericResponse(response, 404);
        response.writeHead(200, { "Content-Type": "application/json" });
        return response.end(JSON.stringify({ code: entry.code }));
      }

      return genericResponse(response, 404);
    } catch (error) {
      return genericResponse(response, error?.statusCode === 413 ? 413 : 400);
    }
  });

  return { server };
};

const isCli =
  process.argv[1] &&
  new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname;
if (isCli) {
  const host = process.env.TAPIT_EMAIL_SINK_HOST || "127.0.0.1";
  const port = Number(process.env.TAPIT_EMAIL_SINK_PORT || 8025);
  const providerToken = process.env.TAPIT_EMAIL_SINK_PROVIDER_TOKEN;
  const codeToken = process.env.TAPIT_LIVE_EMAIL_CODE_TOKEN;
  if (!providerToken || !codeToken) {
    process.stderr.write("TAPIT email sink requires both bearer tokens\n");
    process.exit(1);
  }

  const { server } = createEmailSinkServer({ host, port, providerToken, codeToken });
  const close = () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  server.listen(port, host);
}
