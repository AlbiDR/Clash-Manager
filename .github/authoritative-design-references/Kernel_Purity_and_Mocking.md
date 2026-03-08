# Architecture Supplement: Kernel Purity & Mocking Foundation

## 1. Concept: The "Pure" Kernel (Layer 1)

In the context of the **CleanStack Architecture**, Kernel Purity is the absolute isolation of business logic and utility functions from the underlying runtime environment. 

Currently, the Clash-Manager Backend operates within Google Apps Script (GAS). While Layer 2 (Stores) and Layer 3 (Features) are relatively well-structured, the foundational Layer 1 (Utilities & Kernel) often contains hardcoded dependencies on the Google execution context.

**A "Pure" Kernel means:**
*   Functions are strictly deterministic: given the same inputs, they always produce the same outputs.
*   Functions have **zero side effects**: they do not read from or write to external state (e.g., they do not call `SpreadsheetApp.getActive()`, `CacheService.getScriptCache()`, or `UrlFetchApp.fetch()`).
*   The business logic does not "know" it is running in Google Apps Script. It is a standalone, environment-agnostic TypeScript application.

## 2. Implications of Kernel Purity

Achieving Kernel Purity unlocks the "OCD Clean Stack" nirvana, transmuting the project from a "script" into enterprise-grade software.

### The Rewards (The "Why")
1.  **Local Node.js Unit Testing (Vitest)**: This is the primary objective. By decoupling the logic from GAS globals, the entire Layer 2 and Layer 3 stack can be tested locally on a developer's machine in milliseconds using Vitest, completely bypassing the need to deploy to Google to verify logic.
2.  **Absolute Determinism**: If a calculation fails, it is a flaw in the logic, not a transient timeout from a Google service. Side effects are pushed to the absolute boundary of the application.
3.  **Portability (The Nuclear Option)**: If Google ever deprecates Apps Script, or if the project outgrows it, moving the Backend to a Node.js server (like Cloudflare Workers, mirroring the current remote worker) requires zero changes to the core business logic. You only rewrite the Layer 4 Adapters.

### The Risks (The "Cost")
1.  **Boilerplate & Verbosity**: True decoupling requires Dependency Injection (DI) and Interface definitions. Instantiating objects becomes more verbose because you must pass their dependencies to them.
2.  **GAS Execution Context Complexity**: Google Apps Script compiles everything into a flat global scope. Advanced abstraction patterns (like IoC containers) often break or behave unpredictably in GAS. We must achieve decoupling without relying on heavy framework magic.

## 3. How to Achieve It: The Execution Path

To reach this state without breaking the application, we must follow a strict, systematic refactoring process.

### Step 1: Interface Segregation (The Contract)
Define TypeScript interfaces for every external side effect. We never depend on the *implementation* (Google), only on the *shape* of the action.

```typescript
// Backend-GAS/Interfaces.ts
export interface ICacheProvider {
  get(key: string): string | null;
  set(key: string, value: string, expirationInSeconds?: number): void;
}

export interface INetworkProvider {
  fetchUrl(url: string, options: any): string;
}
```

### Step 2: Adapter Implementation (Layer 4)
Create concrete implementations of these interfaces that wrap the Google-specific services. These wrappers belong exclusively in Layer 4 (Frameworks & Drivers).

```typescript
// Backend-GAS/Adapters/GasCacheAdapter.ts
import { ICacheProvider } from '../Interfaces';

export class GasCacheAdapter implements ICacheProvider {
  private cache = CacheService.getScriptCache();

  get(key: string): string | null {
    return this.cache.get(key);
  }
  
  set(key: string, value: string, expiration?: number): void {
    if (expiration) this.cache.put(key, value, expiration);
    else this.cache.put(key, value);
  }
}
```

### Step 3: Dependency Injection in the Kernel
Refactor Layer 1 utilities and Layer 2 Stores to accept these interfaces as arguments (or via a registry constructor), rather than calling GAS globals directly.

**Impure (Current State):**
```typescript
function fetchClanData(tag: string) {
  const cache = CacheService.getScriptCache(); // HIDDEN DEPENDENCY!
  // ...
}
```

**Pure (Target State):**
```typescript
function fetchClanData(tag: string, cacheProvider: ICacheProvider) {
  const cached = cacheProvider.get(tag);
  // ...
}
```

### Step 4: The Mocking Foundation (Vitest)
Once the logic is decoupled, creating local tests becomes trivial. We create mock implementations of our interfaces that run purely in Node.js memory.

```typescript
// __tests__/mocks/MockCacheAdapter.ts
import { ICacheProvider } from '../../Backend-GAS/Interfaces';

export class MockCacheAdapter implements ICacheProvider {
  private memory = new Map<string, string>();

  get(key: string): string | null {
    return this.memory.get(key) || null;
  }
  
  set(key: string, value: string): void {
    this.memory.set(key, value);
  }
}

// In the test file:
// const store = new RosterStore(new MockCacheAdapter());
// expect(store.loadData()).toEqual(...);
```

## 4. The Registry as the Composition Root
Because GAS requires entry points (like `doGet` or triggers) to be globally accessible functions, we cannot use a traditional `main()` function to wire everything together.

The `Registry.ts` file will evolve into our **Composition Root**. It will instantiate the Adapters (Layer 4) and inject them into the Services (Layer 1) and Stores (Layer 2) at runtime. 

When the code runs in Google, `Registry.ts` wires up `GasCacheAdapter`. When the code runs in Vitest, the test file wires up `MockCacheAdapter`. The inner layers remain completely ignorant of the switch.
