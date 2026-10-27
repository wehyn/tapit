"use client";

import { validateCardOrderDesignFile } from "../card-design";
import type { DemoState } from "./fixtures";
import { refreshDemoAccessSnapshot, resolveDemoSessionAccess, updateDemoState } from "./store";
import { withDemoCardOrderCommitLock } from "./card-order-assets";

const DATABASE_NAME = "tapit-card-order-assets";
const STORE_NAME = "originals";

type StoredQr = {
  assetKey: string;
  ownerId: string;
  kind: "payment-qr";
  fileName: string;
  contentType: "image/jpeg" | "image/png";
  byteSize: number;
  blob: Blob;
};

function access() {
  const refreshed = refreshDemoAccessSnapshot();
  if (refreshed.kind !== "ready") throw new Error("Demo account storage is unavailable.");
  const resolved = resolveDemoSessionAccess(refreshed.snapshot.state, refreshed.snapshot.session);
  if (resolved.kind !== "active") throw new Error("An active demo account is required.");
  return { state: refreshed.snapshot.state, account: resolved.account };
}

function currentState() {
  const refreshed = refreshDemoAccessSnapshot();
  if (refreshed.kind !== "ready") throw new Error("Demo account storage is unavailable.");
  return refreshed.snapshot.state;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(
      new Error(
        "Payment QR storage requires IndexedDB in this browser. Enable browser storage or use a browser/profile that supports IndexedDB.",
      ),
    );
  }
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(DATABASE_NAME, 2);
    } catch {
      reject(
        new Error(
          "Payment QR storage requires IndexedDB in this browser. Enable browser storage or use a browser/profile that supports IndexedDB.",
        ),
      );
      return;
    }
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) {
        request.result
          .createObjectStore(STORE_NAME, { keyPath: "assetKey" })
          .createIndex("by_ownerId", "ownerId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Payment QR storage is unavailable in this browser. Enable browser storage or use a browser/profile that supports IndexedDB.",
        ),
      );
    request.onblocked = () => reject(new Error("Payment QR storage is blocked by another tab."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Payment QR storage failed."));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Payment QR storage failed."));
    });
    try {
      const result = await operation(transaction.objectStore(STORE_NAME));
      await done;
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* The transaction has already finished. */
      }
      void done.catch(() => undefined);
      throw error;
    }
  } finally {
    database.close();
  }
}

function value<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Payment QR storage failed."));
  });
}

function qrReferenced(state: DemoState, assetKey: string) {
  return (
    state.cardOrderPaymentMethods.some((method) => method.qrAssetKey === assetKey) ||
    state.cardOrders.some((order) => order.paymentSnapshot.qrAssetKey === assetKey)
  );
}

async function deleteIfUnreferenced(assetKey: string) {
  if (qrReferenced(currentState(), assetKey)) return;
  await withStore("readwrite", async (store) => {
    const asset = await value<StoredQr | undefined>(store.get(assetKey));
    if (asset?.kind === "payment-qr") await value(store.delete(assetKey));
  });
}

export async function saveDemoCardOrderPaymentQr(
  methodId: string,
  file: File | null,
): Promise<void> {
  const initial = access();
  if (initial.account.role !== "admin") throw new Error("Administrator access required.");
  if (!initial.state.cardOrderPaymentMethods.some((method) => method.id === methodId)) {
    throw new Error("Payment method unavailable.");
  }

  let newAsset: StoredQr | undefined;
  if (file) {
    await validateCardOrderDesignFile(file);
    newAsset = {
      assetKey: crypto.randomUUID(),
      ownerId: initial.account.id,
      kind: "payment-qr",
      fileName: file.name,
      contentType: file.type as StoredQr["contentType"],
      byteSize: file.size,
      blob: file,
    };
    await withStore("readwrite", async (store) => {
      await value(store.add(newAsset));
    });
  }

  let displacedKey: string | undefined;
  try {
    await withDemoCardOrderCommitLock(async () => {
      const current = access();
      if (current.account.role !== "admin" || current.account.id !== initial.account.id) {
        throw new Error("Administrator session changed. Try again.");
      }
      if (!current.state.cardOrderPaymentMethods.some((method) => method.id === methodId)) {
        throw new Error("Payment method unavailable.");
      }
      displacedKey = current.state.cardOrderPaymentMethods.find(
        (method) => method.id === methodId,
      )?.qrAssetKey;
      updateDemoState((state) => ({
        ...state,
        cardOrderPaymentMethods: state.cardOrderPaymentMethods.map((method) =>
          method.id === methodId ? { ...method, qrAssetKey: newAsset?.assetKey } : method,
        ),
      }));
    });
  } catch (error) {
    if (newAsset) await deleteIfUnreferenced(newAsset.assetKey).catch(() => undefined);
    throw error;
  }
  if (displacedKey) await deleteIfUnreferenced(displacedKey).catch(() => undefined);
}

export async function readDemoPaymentMethodQr(methodId: string): Promise<Blob | null> {
  const initial = access();
  if (initial.account.role !== "admin") throw new Error("Administrator access required.");
  const key = initial.state.cardOrderPaymentMethods.find(
    (method) => method.id === methodId,
  )?.qrAssetKey;
  return key ? readAuthorizedQr(key, initial.account.id, "admin") : null;
}

export async function readDemoActivePaymentQr(methodId: string): Promise<Blob | null> {
  const initial = access();
  const role = initial.account.role;
  const method = initial.state.cardOrderPaymentMethods.find(
    (item) => item.id === methodId && item.active,
  );
  return method?.qrAssetKey
    ? readAuthorizedQr(method.qrAssetKey, initial.account.id, role, undefined, methodId)
    : null;
}

export async function readDemoOrderPaymentQr(orderId: string): Promise<Blob | null> {
  const initial = access();
  const role = initial.account.role;
  const order = initial.state.cardOrders.find(
    (item) => item.id === orderId && item.customerId === initial.account.id,
  );
  return order?.paymentSnapshot.qrAssetKey
    ? readAuthorizedQr(order.paymentSnapshot.qrAssetKey, initial.account.id, role, orderId)
    : null;
}

async function readAuthorizedQr(
  key: string,
  accountId: string,
  role: "admin" | "customer",
  orderId?: string,
  methodId?: string,
) {
  const asset = await withStore("readonly", (store) => value<StoredQr | undefined>(store.get(key)));
  const latest = access();
  if (latest.account.id !== accountId || latest.account.role !== role)
    throw new Error("Demo account changed. Try again.");
  if (!asset || asset.kind !== "payment-qr") return null;
  const referenced = orderId
    ? latest.state.cardOrders.some(
        (order) =>
          order.id === orderId &&
          order.customerId === accountId &&
          order.paymentSnapshot.qrAssetKey === key,
      )
    : methodId
      ? latest.state.cardOrderPaymentMethods.some(
          (method) => method.id === methodId && method.active && method.qrAssetKey === key,
        )
      : latest.state.cardOrderPaymentMethods.some(
          (method) => method.active && method.qrAssetKey === key,
        );
  if (!referenced && role === "customer") throw new Error("Payment QR unavailable.");
  if (role === "admin" && asset.ownerId !== accountId) throw new Error("Payment QR unavailable.");
  return asset.blob;
}
