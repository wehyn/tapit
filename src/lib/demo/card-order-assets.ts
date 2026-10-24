"use client";

import { validateCardOrderDesignFile } from "../card-design";
import type { DemoCardOrderDesignSource } from "./fixtures";
import { refreshDemoAccessSnapshot, resolveDemoSessionAccess, updateDemoState } from "./store";

const DATABASE_NAME = "tapit-card-order-assets";
const STORE_NAME = "originals";

type StoredAsset = {
  assetKey: string;
  ownerId: string;
  attachedOrderId?: string;
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

function approvedDeletionState(customerId: string) {
  const { state, account } = access();
  if (account.role !== "admin") throw new Error("Administrator access required.");
  if (
    state.customers.find((candidate) => candidate.id === customerId)?.deletionStatus !== "requested"
  ) {
    throw new Error("Deletion request unavailable.");
  }
  return state;
}

async function withLock<T>(
  name: string,
  operation: () => Promise<T>,
  errorMessage = "Artwork changes require a browser with Web Locks support.",
): Promise<T> {
  if (typeof navigator === "undefined" || typeof navigator.locks?.request !== "function") {
    throw new Error(errorMessage);
  }
  return await navigator.locks.request<Promise<T>>(name, { mode: "exclusive" }, operation);
}

export function withDemoCardOrderCommitLock<T>(operation: () => Promise<T>): Promise<T> {
  return withLock(
    "tapit:card-order-commit",
    operation,
    "Card order changes require a browser with Web Locks support.",
  );
}

function withAssetLock<T>(assetKey: string, operation: () => Promise<T>): Promise<T> {
  return withLock(`tapit:card-order-asset:${assetKey}`, operation);
}

function withCustomerAssetsLock<T>(customerId: string, operation: () => Promise<T>): Promise<T> {
  return withLock(`tapit:card-order-customer-assets:${customerId}`, operation);
}

function withAssetLocks<T>(assetKeys: string[], operation: () => Promise<T>): Promise<T> {
  const keys = [...new Set(assetKeys)].sort();
  const lockNext = (index: number): Promise<T> =>
    index === keys.length ? operation() : withAssetLock(keys[index]!, () => lockNext(index + 1));
  return lockNext(0);
}

function orderReferencesAsset(
  state: ReturnType<typeof access>["state"],
  assetKey: string,
): boolean {
  return state.cardOrders.some(
    (order) => order.designSource.kind === "upload" && order.designSource.assetKey === assetKey,
  );
}

async function recoverUnreferencedAssetReservations(ownerId: string): Promise<void> {
  const assetKeys = await withStore("readonly", (store) =>
    requestValue<IDBValidKey[]>(store.index("by_ownerId").getAllKeys(ownerId)),
  );
  for (const assetKey of assetKeys.map(String)) {
    await withAssetLock(assetKey, async () => {
      const { state, account } = access();
      if (account.role !== "customer" || account.id !== ownerId) {
        throw new Error("Customer session changed. Try again.");
      }
      await withStore("readwrite", async (store) => {
        const asset = await requestValue<StoredAsset | undefined>(store.get(assetKey));
        if (
          !asset ||
          asset.ownerId !== ownerId ||
          asset.attachedOrderId === undefined ||
          orderReferencesAsset(state, assetKey)
        ) {
          return;
        }
        delete asset.attachedOrderId;
        await requestValue(store.put(asset));
      });
    });
  }
}

export function assertDemoCardOrderDeletionAccess(customerId: string): void {
  approvedDeletionState(customerId);
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Artwork storage is unavailable in this browser."));
  }
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      if (!window.indexedDB) throw new Error();
      request = window.indexedDB.open(DATABASE_NAME, 1);
    } catch {
      reject(new Error("Artwork storage is unavailable in this browser."));
      return;
    }
    request.onupgradeneeded = () => {
      request.result
        .createObjectStore(STORE_NAME, { keyPath: "assetKey" })
        .createIndex("by_ownerId", "ownerId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Artwork storage is unavailable in this browser."));
    request.onblocked = () => reject(new Error("Artwork storage is blocked by another tab."));
  });
}

function storageError(error: unknown): Error {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new Error("Artwork storage is full. Free browser storage and try again.");
  }
  return error instanceof Error ? error : new Error("Artwork storage is unavailable.");
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(storageError(transaction.error));
      transaction.onerror = () => reject(storageError(transaction.error));
    });
    try {
      const result = await operation(transaction.objectStore(STORE_NAME), transaction);
      await completed;
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
      void completed.catch(() => undefined);
      throw storageError(error);
    }
  } finally {
    database.close();
  }
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError(request.error));
  });
}

export async function saveDemoCardOrderAsset(
  file: File,
): Promise<Extract<DemoCardOrderDesignSource, { kind: "upload" }>> {
  return replaceDemoCardOrderAsset(undefined, file);
}

export async function readDemoCardOrderAsset(assetKey: string): Promise<StoredAsset | null> {
  const { account } = access();
  const asset = await withStore("readonly", (store) =>
    requestValue<StoredAsset | undefined>(store.get(assetKey)),
  );
  if (asset && account.role !== "admin" && asset.ownerId !== account.id) {
    throw new Error("Artwork unavailable.");
  }
  return asset ?? null;
}

async function reserveDemoCardOrderAsset(
  designSource: Extract<DemoCardOrderDesignSource, { kind: "upload" }>,
  orderId: string,
  ownerId: string,
): Promise<void> {
  const { state, account } = access();
  if (account.role !== "customer" || account.id !== ownerId) {
    throw new Error("Customer session changed. Try again.");
  }
  if (orderReferencesAsset(state, designSource.assetKey)) {
    throw new Error("The uploaded card design is unavailable.");
  }
  await withStore("readwrite", async (store) => {
    const asset = await requestValue<StoredAsset | undefined>(store.get(designSource.assetKey));
    if (
      !asset ||
      asset.ownerId !== ownerId ||
      asset.fileName !== designSource.fileName ||
      asset.contentType !== designSource.contentType ||
      asset.byteSize !== designSource.byteSize
    ) {
      throw new Error("The uploaded card design is unavailable.");
    }
    await requestValue(store.put({ ...asset, attachedOrderId: orderId }));
  });
}

async function releaseDemoCardOrderAsset(
  assetKey: string,
  orderId: string,
  ownerId: string,
): Promise<void> {
  await withStore("readwrite", async (store) => {
    const asset = await requestValue<StoredAsset | undefined>(store.get(assetKey));
    if (asset?.ownerId !== ownerId || asset.attachedOrderId !== orderId) return;
    delete asset.attachedOrderId;
    await requestValue(store.put(asset));
  });
}

export async function withDemoCardOrderAssetReservation<T>(
  designSource: Extract<DemoCardOrderDesignSource, { kind: "upload" }>,
  orderId: string,
  ownerId: string,
  persistOrder: () => T | Promise<T>,
): Promise<T> {
  return withAssetLock(designSource.assetKey, async () => {
    await reserveDemoCardOrderAsset(designSource, orderId, ownerId);
    try {
      return await persistOrder();
    } catch (error) {
      try {
        const latest = refreshDemoAccessSnapshot();
        if (
          latest.kind === "ready" &&
          !orderReferencesAsset(latest.snapshot.state, designSource.assetKey)
        ) {
          await releaseDemoCardOrderAsset(designSource.assetKey, orderId, ownerId);
        }
      } catch {
        // Keep the reservation if a persisted order cannot be ruled out.
      }
      throw error;
    }
  });
}

export async function deleteDemoCardOrderAsset(assetKey: string): Promise<void> {
  await withAssetLock(assetKey, async () => {
    const { state, account } = access();
    if (account.role !== "customer") throw new Error("Customer access required.");
    if (orderReferencesAsset(state, assetKey)) {
      throw new Error("Artwork attached to an order cannot be removed.");
    }
    await withStore("readwrite", async (store) => {
      const asset = await requestValue<StoredAsset | undefined>(store.get(assetKey));
      if (asset?.ownerId !== account.id) throw new Error("Artwork unavailable.");
      await requestValue(store.delete(assetKey));
    });
  });
}

export function replaceDemoCardOrderAsset(
  previousAssetKey: string | undefined,
  file: File,
): Promise<Extract<DemoCardOrderDesignSource, { kind: "upload" }>>;
export function replaceDemoCardOrderAsset(
  previousAssetKey: string | undefined,
  file: null,
): Promise<null>;
export function replaceDemoCardOrderAsset(
  previousAssetKey: string | undefined,
  file: File | null,
): Promise<Extract<DemoCardOrderDesignSource, { kind: "upload" }> | null>;
export async function replaceDemoCardOrderAsset(
  previousAssetKey: string | undefined,
  file: File | null,
): Promise<Extract<DemoCardOrderDesignSource, { kind: "upload" }> | null> {
  if (file === null) {
    if (previousAssetKey !== undefined) await deleteDemoCardOrderAsset(previousAssetKey);
    return null;
  }

  const { account } = access();
  if (account.role !== "customer") throw new Error("An active customer account is required.");
  await validateCardOrderDesignFile(file);
  const assetKey = crypto.randomUUID();
  const asset: StoredAsset = {
    assetKey,
    ownerId: account.id,
    fileName: file.name,
    contentType: file.type as StoredAsset["contentType"],
    byteSize: file.size,
    blob: file,
  };

  await withCustomerAssetsLock(account.id, async () => {
    const current = access();
    if (current.account.role !== "customer" || current.account.id !== account.id) {
      throw new Error("Customer session changed. Try again.");
    }
    await recoverUnreferencedAssetReservations(account.id);
    await withAssetLocks(
      previousAssetKey === undefined ? [assetKey] : [previousAssetKey, assetKey],
      () =>
        withStore("readwrite", async (store) => {
          const { state, account: owner } = access();
          if (owner.role !== "customer" || owner.id !== account.id) {
            throw new Error("Customer session changed. Try again.");
          }
          if (previousAssetKey !== undefined) {
            if (orderReferencesAsset(state, previousAssetKey)) {
              throw new Error("Artwork attached to an order cannot be removed.");
            }
            const previous = await requestValue<StoredAsset | undefined>(
              store.get(previousAssetKey),
            );
            if (!previous || previous.ownerId !== owner.id) {
              throw new Error("Artwork unavailable.");
            }
            if (previous.attachedOrderId !== undefined) {
              throw new Error("Artwork attached to an order cannot be removed.");
            }
            await requestValue(store.delete(previousAssetKey));
          }
          await requestValue(store.add(asset));
        }),
    );
  });

  return {
    kind: "upload",
    assetKey,
    fileName: asset.fileName,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
  };
}

export async function deleteDemoCardOrderAssetsForApprovedDeletion(
  customerId: string,
): Promise<void> {
  await withCustomerAssetsLock(customerId, async () => {
    approvedDeletionState(customerId);
    const assetKeys = await withStore("readonly", (store) =>
      requestValue<IDBValidKey[]>(store.index("by_ownerId").getAllKeys(customerId)),
    );
    const keys = assetKeys.map(String);
    await withAssetLocks(keys, async () => {
      await withDemoCardOrderCommitLock(async () => {
        approvedDeletionState(customerId);
        updateDemoState((state) => {
          const customer = state.customers.find((candidate) => candidate.id === customerId);
          if (customer?.deletionStatus !== "requested") {
            throw new Error("Deletion request unavailable.");
          }
          const erasedOrderIds = new Set(
            state.cardOrders
              .filter((order) => order.customerId === customerId)
              .map((order) => order.id),
          );
          return {
            ...state,
            cardOrders: state.cardOrders.filter((order) => order.customerId !== customerId),
            audits: state.audits.filter(
              (event) =>
                !(event.action.startsWith("card_order.") && erasedOrderIds.has(event.target)),
            ),
          };
        });
        const state = approvedDeletionState(customerId);
        await withStore("readwrite", async (store, transaction) => {
          const currentKeys = await requestValue<IDBValidKey[]>(
            store.index("by_ownerId").getAllKeys(customerId),
          );
          if (currentKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
            transaction.abort();
            throw new Error("Artwork changed during deletion. Retry the approval.");
          }
          for (const key of currentKeys) {
            if (typeof key !== "string") {
              transaction.abort();
              throw new Error("Artwork could not be verified for deletion.");
            }
            if (
              state.cardOrders.some(
                (order) =>
                  order.customerId !== customerId &&
                  order.designSource.kind === "upload" &&
                  order.designSource.assetKey === key,
              )
            ) {
              transaction.abort();
              throw new Error("Artwork is attached to another customer's order.");
            }
            await requestValue(store.delete(key));
          }
        });
      });
    });
  });
}
