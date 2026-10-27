import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeRequest = {
  result?: unknown;
  onsuccess?: () => void;
  onupgradeneeded?: (event: { oldVersion: number }) => void;
};
type FakeTransaction = {
  oncomplete?: () => void;
  objectStore?: () => {
    add: (asset: { assetKey: string }) => FakeRequest;
    get: (key: string) => FakeRequest;
    delete: (key: string) => FakeRequest;
  };
};

const mocks = vi.hoisted(() => ({
  state: {
    cardOrderPaymentMethods: [{ id: "method-1", active: true }],
    cardOrders: [],
  },
  session: { email: "admin@example.test", role: "admin" } as null | {
    email: string;
    role: "admin";
  },
  assets: new Map<string, unknown>(),
  validate: vi.fn<() => Promise<void>>(),
  updateDemoState: vi.fn(),
}));

vi.mock("@/lib/card-design", () => ({ validateCardOrderDesignFile: mocks.validate }));
vi.mock("@/lib/demo/store", () => ({
  refreshDemoAccessSnapshot: () => ({
    kind: "ready",
    snapshot: { state: mocks.state, session: mocks.session },
  }),
  resolveDemoSessionAccess: (_state: unknown, session: typeof mocks.session) =>
    session ? { kind: "active", account: { id: "admin-1", role: "admin" } } : { kind: "guest" },
  updateDemoState: mocks.updateDemoState,
}));
vi.mock("@/lib/demo/card-order-assets", () => ({
  withDemoCardOrderCommitLock: (operation: () => Promise<unknown>) => operation(),
}));

import { saveDemoCardOrderPaymentQr } from "@/lib/demo/card-order-payment-assets";

function indexedDb() {
  return {
    open: () => {
      const request: FakeRequest = {};
      queueMicrotask(() => {
        request.result = {
          createObjectStore: () => ({ createIndex: vi.fn() }),
          transaction: () => {
            const transaction: FakeTransaction = {};
            const run = (operation: () => unknown) => {
              const result: FakeRequest = {};
              queueMicrotask(() => {
                result.result = operation();
                result.onsuccess?.();
                setTimeout(() => transaction.oncomplete?.(), 0);
              });
              return result;
            };
            transaction.objectStore = () => ({
              add: (asset: { assetKey: string }) =>
                run(() => mocks.assets.set(asset.assetKey, asset)),
              get: (key: string) => run(() => mocks.assets.get(key)),
              delete: (key: string) => run(() => mocks.assets.delete(key)),
            });
            return transaction;
          },
          close: vi.fn(),
        };
        request.onupgradeneeded?.({ oldVersion: 0 });
        request.onsuccess?.();
      });
      return request;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("demo payment QR failed-save cleanup", () => {
  beforeEach(() => {
    mocks.state = {
      cardOrderPaymentMethods: [{ id: "method-1", active: true }],
      cardOrders: [],
    };
    mocks.session = { email: "admin@example.test", role: "admin" };
    mocks.assets.clear();
    mocks.validate.mockReset().mockResolvedValue(undefined);
    mocks.updateDemoState.mockReset().mockImplementation((updater) => {
      mocks.state = updater(mocks.state);
    });
    vi.stubGlobal("crypto", { randomUUID: () => "new-qr" });
    Object.defineProperty(window, "indexedDB", { configurable: true, value: indexedDb() });
  });

  it("deletes a newly stored QR when the admin signs out during validation", async () => {
    const validation = deferred<void>();
    mocks.validate.mockReturnValue(validation.promise);
    const save = saveDemoCardOrderPaymentQr(
      "method-1",
      new File(["qr"], "qr.png", { type: "image/png" }),
    );
    mocks.session = null;
    validation.resolve();

    await expect(save).rejects.toThrow();
    expect(mocks.assets.size).toBe(0);
  });

  it("keeps the new QR if state references it when cleanup runs without a session", async () => {
    mocks.updateDemoState.mockImplementation((updater) => {
      mocks.state = updater(mocks.state);
      mocks.session = null;
      throw new Error("save interrupted");
    });

    await expect(
      saveDemoCardOrderPaymentQr("method-1", new File(["qr"], "qr.png", { type: "image/png" })),
    ).rejects.toThrow("save interrupted");
    expect(mocks.assets.has("new-qr")).toBe(true);
  });
});
