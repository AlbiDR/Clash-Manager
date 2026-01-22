import { useRegisterSW } from "virtual:pwa-register/vue";
import { useToast } from "./useToast";
import { useHaptics } from "./useHaptics";
import { useTheme } from "./useTheme";
import { idb } from "../utils/idb";

/**
 * 🛠️ USE SYSTEM RECOVERY
 * Centralized logic for application health and update management.
 */
export function useSystemRecovery() {
  const { updateServiceWorker } = useRegisterSW();
  const toast = useToast();
  const haptics = useHaptics();
  const { clearManifestCache } = useTheme();

  /**
   * 🔄 FORCE UPDATE
   * Manually triggers a Service Worker check and update.
   */
  async function forceUpdate() {
    haptics.heavy();
    const tId = toast.info("Checking for updates...");

    if (!("serviceWorker" in navigator)) {
      toast.remove(tId);
      toast.error("Service Worker not available");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        toast.remove(tId);
        toast.error("No active session found");
        return;
      }

      // 1. Check if update is already waiting
      if (reg.waiting) {
        toast.remove(tId);
        toast.success("Update ready! Reloading...");
        updateServiceWorker(true);
        return;
      }

      // 2. Force network check
      await reg.update();

      // 3. Check results
      if (reg.installing || reg.waiting) {
        toast.remove(tId);
        toast.success("Update found! Downloading...");
      } else {
        toast.remove(tId);
        toast.success("Clash Manager is up to date");
      }
    } catch (e) {
      console.error("Update check failed", e);
      toast.remove(tId);
      toast.error("Update check failed");
    }
  }

  /**
   * 🧹 CLEAR CACHE
   * Unregisters Service Workers and clears Browser Cache.
   */
  async function clearCache() {
    haptics.medium();
    if (
      confirm(
        "Purge Asset Cache?\n\nThis will clear the Service Worker cache and reload the application. Your settings and data will be preserved.",
      )
    ) {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      clearManifestCache();
      window.location.reload();
    }
  }

  /**
   * 🏭 FACTORY RESET
   * Complete wipe of local state (LocalStorage, SessionStorage, IDB).
   */
  async function factoryReset() {
    haptics.heavy();
    if (
      confirm(
        "Reset Application Data?\n\nThis will clear local cache, indexedDB, and settings. Data on the Google Sheet will NOT be affected.",
      )
    ) {
      localStorage.clear();
      sessionStorage.clear();
      try {
        await idb.clear();
      } catch (e) {
        console.warn("IDB clear failed", e);
      }
      window.location.reload();
    }
  }

  return {
    forceUpdate,
    clearCache,
    factoryReset,
  };
}
