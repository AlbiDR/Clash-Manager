// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { STORAGE_DB_NAME, STORAGE_STORE_NAME, STORAGE_DB_VERSION } from "../../core/config";

/**
 * SW KERNEL (Layer 4 Sub-module)
 * ----------------------------------------------------------------------------
 * Rationale: Provides minimalist IndexedDB primitives for the Service Worker.
 * Extracted from sw.ts to reduce monolithic complexity and improve SRP.
 * ----------------------------------------------------------------------------
 */

/**
 * Minimal IDB helper to open a database connection in the Service Worker.
 *
 * @returns A promise resolving to the IDBDatabase instance.
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB_NAME, STORAGE_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Retrieves a value from the IndexedDB store.
 *
 * @param db - The active IDBDatabase connection.
 * @param key - The record key.
 * @returns A promise resolving to the value or null.
 */
export function getValue(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve) => {
    const transaction = db.transaction([STORAGE_STORE_NAME], "readonly");
    const store = transaction.objectStore(STORAGE_STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/**
 * Persists a value to the IndexedDB store.
 *
 * @param db - The active IDBDatabase connection.
 * @param key - The record key.
 * @param value - The value to persist.
 */
export function setValue(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORAGE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORAGE_STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
