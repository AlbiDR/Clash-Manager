/**
 * TypeScript Environment Definitions
 * Defines the shape of import.meta.env and handles static assets.
 */

interface ImportMetaEnv {
  readonly VITE_GAS_URL: string;
  readonly VITE_WORKER_URL: string;
  readonly VITE_APP_VERSION: string;
  readonly TEST: boolean;
  BASE_URL: string;
  MODE: string;
  DEV: boolean;
  PROD: boolean;
  SSR: boolean;
}

interface ImportMeta {
  url: string;
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;

declare module "*.vue" {
  const component: any;
  export default component;
}

declare module "*.css" {
  const content: string;
  export default content;
}

interface Document {
  startViewTransition(callback: () => Promise<void> | void): {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
    skipTransition: () => void;
  };
}
