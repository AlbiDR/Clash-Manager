import { config } from "@vue/test-utils";
import { vi } from "vitest";

// Global mocks or config

// 1. Fix JSDOM Navigation Error
// JSDOM does not implement navigation. We mock it to prevent "Error: Not implemented: navigation"
const mockSafeLocation = {
  ...window.location,
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
};
delete (window as any).location;
window.location = mockSafeLocation as any;

// 2. Fix Network Fetch Failures
// Mock global fetch to prevent real network requests and retry loops in CI
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  }),
);

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: any) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // Deprecated
    removeListener: () => {}, // Deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock localStorage
const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] || null,
    length: 0,
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });
