"use client";

import { validateCardOrderDesignFile } from "../card-design";
import type { DemoCardOrderDesignSource } from "./fixtures";
import { refreshDemoAccessSnapshot, resolveDemoSessionAccess } from "./store";

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
  const { account } = access();
  if (account.role !== "customer") throw new Error("An active customer account is required.");
  await validateCardOrderDesignFile(file);
  if (access().account.id !== account.id) throw new Error("Customer session changed. Try again.");
  const assetKey = crypto.randomUUID();
  const asset: StoredAsset = {
    assetKey,
    ownerId: account.id,
    fileName: file.name,
    contentType: file.type as StoredAsset["contentType"],
    byteSize: file.size,
    blob: file,
  };
  await withStore("readwrite", async (store) => {
    await requestValue(store.add(asset));
  });
  return {
    kind: "upload",
    assetKey,
    fileName: asset.fileName,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
  };
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

export async function reserveDemoCardOrderAsset(
  designSource: Extract<DemoCardOrderDesignSource, { kind: "upload" }>,
  orderId: string,
  ownerId: string,
): Promise<void> {
  const { account } = access();
  if (account.role !== "customer" || account.id !== ownerId) {
    throw new Error("Customer session changed. Try again.");
  }
  await withStore("readwrite", async (store) => {
    const asset = await requestValue<StoredAsset | undefined>(store.get(designSource.assetKey));
    if (
      !asset ||
      asset.ownerId !== ownerId ||
      asset.attachedOrderId !== undefined ||
      asset.fileName !== designSource.fileName ||
      asset.contentType !== designSource.contentType ||
      asset.byteSize !== designSource.byteSize
    ) {
      throw new Error("The uploaded card design is unavailable.");
    }
    await requestValue(store.put({ ...asset, attachedOrderId: orderId }));
  });
}

export async function releaseDemoCardOrderAsset(
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

export async function deleteDemoCardOrderAsset(assetKey: string): Promise<void> {
  const { state, account } = access();
  if (account.role !== "customer") throw new Error("Customer access required.");
  if (
    state.cardOrders.some(
      (order) => order.designSource.kind === "upload" && order.designSource.assetKey === assetKey,
    )
  ) {
    throw new Error("Artwork attached to an order cannot be removed.");
  }
  await withStore("readwrite", async (store) => {
    const asset = await requestValue<StoredAsset | undefined>(store.get(assetKey));
    if (asset?.ownerId !== account.id) throw new Error("Artwork unavailable.");
    if (asset.attachedOrderId !== undefined) {
      throw new Error("Artwork attached to an order cannot be removed.");
    }
    await requestValue(store.delete(assetKey));
  });
}

export async function deleteDemoCardOrderAssetsForApprovedDeletion(
  customerId: string,
): Promise<void> {
  const state = approvedDeletionState(customerId);
  await withStore("readwrite", async (store, transaction) => {
    const keys = await requestValue(store.index("by_ownerId").getAllKeys(customerId));
    for (const key of keys) {
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
}
