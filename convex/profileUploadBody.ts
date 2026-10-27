export type BoundedBodyResult =
  | { kind: "ok"; bytes: Uint8Array<ArrayBuffer> }
  | { kind: "invalid-length" }
  | { kind: "too-large" }
  | { kind: "length-mismatch" };

/** Read a request body without ever retaining more than the configured limit. */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult> {
  const rawLength = request.headers.get("Content-Length");
  let declaredLength: number | null = null;
  if (rawLength !== null) {
    if (!/^\d+$/.test(rawLength)) return { kind: "invalid-length" };
    declaredLength = Number(rawLength);
    if (!Number.isSafeInteger(declaredLength)) return { kind: "invalid-length" };
    if (declaredLength > maxBytes) return { kind: "too-large" };
  }

  if (request.body === null) {
    if (declaredLength !== null && declaredLength > 0) return { kind: "length-mismatch" };
    return { kind: "ok", bytes: new Uint8Array(new ArrayBuffer(0)) };
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { kind: "too-large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (declaredLength !== null && declaredLength !== total) return { kind: "length-mismatch" };
  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: "ok", bytes };
}
