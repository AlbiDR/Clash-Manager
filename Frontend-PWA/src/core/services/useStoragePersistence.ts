import { ref, readonly, onMounted } from "vue";

/**
 * 💾 STORAGE PERSISTENCE API
 * Prevents the browser from clearing IndexedDB/localStorage under storage pressure.
 */

const isPersisted = ref(false);
const isSupported = ref(false);

export function useStoragePersistence() {
  async function check() {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage &&
      navigator.storage.persisted
    ) {
      isPersisted.value = await navigator.storage.persisted();
    }
  }

  async function requestPersistence() {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage &&
      navigator.storage.persist
    ) {
      isSupported.value = true;
      const result = await navigator.storage.persist();
      isPersisted.value = result;
    }
  }

  // Auto-check on mount logic (optional, but good for UI state)
  onMounted(() => {
    if (typeof navigator !== "undefined" && "storage" in navigator) {
      isSupported.value = true;
      check();
    }
  });

  return {
    isSupported: readonly(isSupported),
    isPersisted: readonly(isPersisted),
    requestPersistence,
  };
}
