/**
 * TypeScript Environment Definitions
 * Defines the shape of import.meta.env and handles static assets.
 */

interface ImportMetaEnv {
  readonly VITE_GAS_URL: string;
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
