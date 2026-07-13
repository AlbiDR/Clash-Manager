// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { STORAGE_DB_NAME, STORAGE_STORE_NAME, STORAGE_DB_VERSION } from "../../core/config";

/**
 * SW KERNEL (Layer 4 Sub-module)
 * ----------------------------------------------------------------------------
 * Rationale: Provides minimalist IndexedDB primitives for the Service Worker.
 * Extracted from sw.ts to reduce monolithic complexity and improve SRP.
 *
 * @remarks
 * Satisfies ADR Section II (Layer 4: App). Provides low-level persistence
 * for the Service Worker without relying on higher-layer services.
 * ----------------------------------------------------------------------------
 */

/**
 * Minimal IDB helper to open a database connection in the Service Worker.
 *
 * @returns A promise resolving to the IDBDatabase instance.
 *
 * @remarks
 * [THREAT:] IndexedDB connection failures.
 * [DECISION LOG] In the SW context, we do not implement a memory-fallback here
 * because the kernel must provide atomic database access. Failures are rejected
 * to allow calling sync tasks to fail gracefully.
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idbRequest = indexedDB.open(STORAGE_DB_NAME, STORAGE_DB_VERSION);
    idbRequest.onerror = () => reject(idbRequest.error);
    idbRequest.onsuccess = () => resolve(idbRequest.result);
  });
}

/**
 * Retrieves a value from the IndexedDB store.
 *
 * @param storageConnection - The active IDBDatabase connection.
 * @param key - The record key.
 * @returns A promise resolving to the value or null.
 *
 * @remarks
 * [THREAT:] Transaction timeouts in Service Worker.
 * [DECISION LOG] We use a dedicated transaction per request to ensure isolation
 * and minimize the risk of "Transaction inactive" errors during async orchestration.
 */
export function getValue(storageConnection: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve) => {
    const idbTransaction = storageConnection.transaction([STORAGE_STORE_NAME], "readonly");
    const idbStore = idbTransaction.objectStore(STORAGE_STORE_NAME);
    const idbRequest = idbStore.get(key);
    idbRequest.onsuccess = () => resolve(idbRequest.result);
    idbRequest.onerror = () => resolve(null);
  });
}

/**
 * Persists a value to the IndexedDB store.
 *
 * @param storageConnection - The active IDBDatabase connection.
 * @param key - The record key.
 * @param value - The value to persist.
 * @returns A promise that resolves when the value is saved.
 */
export function setValue(storageConnection: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const idbTransaction = storageConnection.transaction([STORAGE_STORE_NAME], "readwrite");
    const idbStore = idbTransaction.objectStore(STORAGE_STORE_NAME);
    const idbRequest = idbStore.put(value, key);
    idbRequest.onsuccess = () => resolve();
    idbRequest.onerror = () => reject(idbRequest.error);
  });
}
