"use client";

import type { DemoCardOrder } from "./fixtures";
import { withDemoCardOrderCommitLock } from "./card-order-assets";
import { refreshDemoAccessSnapshot, resolveDemoSessionAccess, updateDemoState } from "./store";

const DB = "tapit-card-order-receipts";
const STORE = "receipts";
const MAX_BYTES = 5 * 1024 * 1024;
type Receipt = NonNullable<DemoCardOrder["receipt"]>;
type StoredReceipt = Receipt & { ownerId: string; orderId: string; blob: Blob };

function current() {
  const snapshot = refreshDemoAccessSnapshot();
  if (snapshot.kind !== "ready") throw new Error("Demo account storage is unavailable.");
  const access = resolveDemoSessionAccess(snapshot.snapshot.state, snapshot.snapshot.session);
  if (access.kind !== "active") throw new Error("An active demo account is required.");
  return { state: snapshot.snapshot.state, account: access.account };
}

function db(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB)
    return Promise.reject(new Error("Receipt storage is unavailable."));
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "receiptKey" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Receipt storage is unavailable."));
  });
}

async function store<T>(
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await db();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result!);
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function validate(file: File) {
  if (file.size === 0 || file.size >= MAX_BYTES)
    throw new Error("Choose a non-empty receipt under 5 MiB.");
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  let contentType: Receipt["contentType"];
  if (
    bytes.length === 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) &&
    file.type === "image/png"
  )
    contentType = "image/png";
  else if (
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    file.type === "image/jpeg"
  )
    contentType = "image/jpeg";
  else if (String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-" && file.type === "application/pdf")
    contentType = "application/pdf";
  else throw new Error("Receipt must be a valid PNG, JPEG, or PDF file.");
  if (contentType !== "application/pdf") {
    let image: ImageBitmap;
    try {
      image = await createImageBitmap(file);
    } catch {
      throw new Error("Receipt image could not be decoded.");
    }
    const valid =
      image.width > 0 &&
      image.height > 0 &&
      image.width * image.height <= 6_000_000 &&
      image.width <= 12_000 &&
      image.height <= 12_000;
    image.close();
    if (!valid)
      throw new Error("Receipt image must be at most 6 megapixels and 12,000 pixels per side.");
  }
  return contentType;
}

export async function attachDemoCardOrderReceipt(orderId: string, file: File): Promise<Receipt> {
  const before = current();
  const owner = before.account;
  if (owner.role !== "customer") throw new Error("Active customer account required.");
  const order = before.state.cardOrders.find(
    (item) => item.id === orderId && item.customerId === owner.id,
  );
  if (!order) throw new Error("Order unavailable.");
  if (order.paymentStatus !== "unpaid" || order.fulfillmentStatus !== "awaiting_payment")
    throw new Error("Receipt upload is available only while awaiting payment.");
  const contentType = await validate(file);
  const receipt: Receipt = {
    receiptKey: crypto.randomUUID(),
    fileName: file.name,
    contentType,
    byteSize: file.size,
    uploadedAt: Date.now(),
  };
  let displaced: string | undefined;
  try {
    await withDemoCardOrderCommitLock(async () => {
      const latest = current();
      const live = latest.state.cardOrders.find((item) => item.id === orderId);
      if (latest.account.role !== "customer" || latest.account.id !== owner.id)
        throw new Error("Customer session changed. Try again.");
      if (
        !live ||
        live.customerId !== owner.id ||
        live.paymentStatus !== "unpaid" ||
        live.fulfillmentStatus !== "awaiting_payment"
      )
        throw new Error("Receipt upload is available only for your unpaid order awaiting payment.");
      await store("readwrite", (s) =>
        s.add({ ...receipt, ownerId: owner.id, orderId, blob: file } satisfies StoredReceipt),
      );
      updateDemoState((state) => {
        const latest = refreshDemoAccessSnapshot();
        if (latest.kind !== "ready") throw new Error("Demo account storage is unavailable.");
        const active = resolveDemoSessionAccess(latest.snapshot.state, latest.snapshot.session);
        const stateOrder = state.cardOrders.find((item) => item.id === orderId);
        const persistedOrder = latest.snapshot.state.cardOrders.find((item) => item.id === orderId);
        const canAttach = (candidate: DemoCardOrder | undefined) =>
          candidate?.customerId === owner.id &&
          candidate.paymentStatus === "unpaid" &&
          candidate.fulfillmentStatus === "awaiting_payment";
        if (
          active.kind !== "active" ||
          active.account.role !== "customer" ||
          active.account.id !== owner.id
        ) {
          throw new Error("Customer session changed. Try again.");
        }
        if (!canAttach(stateOrder) || !canAttach(persistedOrder)) {
          throw new Error(
            "Receipt upload is available only for your unpaid order awaiting payment.",
          );
        }
        displaced = stateOrder?.receipt?.receiptKey;
        return {
          ...state,
          cardOrders: state.cardOrders.map((item) =>
            item.id === orderId ? { ...item, receipt, updatedAt: Date.now() } : item,
          ),
        };
      });
    });
  } catch (error) {
    await store("readwrite", (s) => s.delete(receipt.receiptKey)).catch(() => undefined);
    throw error;
  }
  const displacedKey = displaced;
  if (
    displacedKey &&
    !current().state.cardOrders.some((item) => item.receipt?.receiptKey === displacedKey)
  )
    await store("readwrite", (s) => s.delete(displacedKey)).catch(() => undefined);
  return receipt;
}

export async function recoverDemoCardOrderReceipts(): Promise<void> {
  await withDemoCardOrderCommitLock(async () => {
    const { state } = current();
    const referencedKeys = new Set(
      state.cardOrders.flatMap((order) => (order.receipt ? [order.receipt.receiptKey] : [])),
    );
    const database = await db();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        const request = transaction.objectStore(STORE).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const record = cursor.value as StoredReceipt;
          if (!referencedKeys.has(record.receiptKey)) cursor.delete();
          cursor.continue();
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });
}

export async function readDemoCardOrderReceipt(orderId: string): Promise<Blob | null> {
  const before = current();
  const order = before.state.cardOrders.find((item) => item.id === orderId);
  const receipt = order?.receipt;
  if (
    !receipt ||
    (before.account.role !== "admin" &&
      (before.account.role !== "customer" || order.customerId !== before.account.id))
  )
    return null;
  const stored = await store<StoredReceipt | undefined>("readonly", (s) =>
    s.get(receipt.receiptKey),
  );
  const after = current();
  if (
    after.account.id !== before.account.id ||
    after.account.role !== before.account.role ||
    !stored ||
    stored.orderId !== orderId ||
    stored.ownerId !== order.customerId
  )
    return null;
  return stored.blob;
}

export async function deleteDemoCardOrderReceiptsForCustomer(
  customerId: string,
  retainedKeys: Set<string>,
) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const request = transaction.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const item = cursor.value as StoredReceipt;
        if (item.ownerId === customerId && !retainedKeys.has(item.receiptKey)) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
