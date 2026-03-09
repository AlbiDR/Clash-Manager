# Architecture Supplement: Kernel Purity & Mocking Foundation

## 1. Concept: The "Pure" Kernel (Layer 1)

In the context of the **CleanStack Architecture**, Kernel Purity is the absolute isolation of business logic and utility functions from the underlying runtime environment. 

Currently, the Clash-Manager Backend operates within Google Apps Script (GAS). While Layer 2 (Stores) and Layer 3 (Features) are relatively well-structured, the foundational Layer 1 (Utilities & Kernel) often contains hardcoded dependencies on the Google execution context.

**A "Pure" Kernel means:**
*   **Determinism:** Given the same inputs, functions always produce the exact same outputs. Time, external state, and random generation are passed as arguments, not calculated internally.
*   **Zero Side Effects:** Functions do not read from or write to external state directly. They do not call `SpreadsheetApp.getActive()`, `CacheService.getScriptCache()`, `PropertiesService.getScriptProperties()`, or `UrlFetchApp.fetch()`.
*   **Environment Agnosticism:** The business logic does not "know" it is running in Google Apps Script. It is a standalone TypeScript application compiled into the environment.

## 2. Implications of Kernel Purity

Achieving Kernel Purity unlocks the "OCD Clean Stack" nirvana, transmuting the project from a "script" into enterprise-grade software.

### The Rewards (The "Why")
1.  **Local Node.js Unit Testing (Vitest)**: This is the primary objective. By decoupling the logic from GAS globals, the entire Layer 2 and Layer 3 stack can be tested locally on a developer's machine in milliseconds using Vitest. You can simulate complex edge cases (e.g., Google API quotas exceeded, network latency) by instructing the mocks to fail immediately, bypassing the need to deploy to Google.
2.  **Absolute Determinism**: If a calculation fails, it is a flaw in the logic, not a transient timeout from a Google service. Side effects are pushed to the absolute outer boundary of the application (Layer 4).
3.  **Portability (The Nuclear Option)**: If Google ever deprecates Apps Script, or if the project outgrows it (e.g., hitting hard execution time limits), moving the Backend to a Node.js server (like Cloudflare Workers or AWS Lambda) requires zero changes to the core business logic. You only construct new Layer 4 Adapters.
4.  **Implicit Documentation**: When a function's signature defines `cacheProvider: ICacheProvider, apiProvider: INetworkProvider`, an engineer instantly knows exactly what side-effects this function relies on, without reading a single line of its internal implementation.

### The Risks (The "Cost")
1.  **Boilerplate & Verbosity**: True decoupling requires strict Dependency Injection (DI) and Interface definitions. Instantiating objects becomes more verbose because you must explicitly pass their dependencies to them upon creation. It shifts complexity from the logic to the wiring.
2.  **GAS Execution Context Complexity**: Google Apps Script compiles everything into a flat global scope and executes `doGet` or `onEdit` in isolated event lifecycles. Advanced abstraction patterns (like reflection-based IoC containers such as InversifyJS) either break, bloat the bundle size significantly, or behave unpredictably in GAS. We must achieve decoupling through manual composition (Constructor or Method Injection).

## 3. The Execution Path: Migrating from Impure to Pure

To reach this state without breaking the application, we must follow a strict, systematic refactoring process. This cannot be done file-by-file; it must be done layer-by-layer, from the bottom up.

### Step 1: Discovering Impurities (The Audit)
The first step is a grep search for all Layer 4 dependencies bleeding into Layer 1 and 2. The most common offenders in GAS are:
- `SpreadsheetApp` (Data persistence)
- `CacheService` (Ephemeral caching)
- `PropertiesService` (Secret management and chunked state)
- `UrlFetchApp` (External APIs)
- `LockService` (Concurrency control)
- `Utilities` (Hashing, sleep, zip)
- `Date.now()` or `new Date()` (Impure time generation inside tests)

### Step 2: Interface Segregation (The Contract)
Define exact TypeScript interfaces for the actions the application needs to perform, **not** the underlying Google Service's entire API. We only depend on the *shape* of the action.

```typescript
// Backend-GAS/Interfaces.ts

export interface ICacheProvider {
  get(key: string): string | null;
  set(key: string, value: string, expirationInSeconds?: number): void;
  remove(key: string): void;
}

export interface INetworkProvider {
  /**
   * Executes a GET request and returns the raw string payload.
   */
  fetchString(url: string, headers?: Record<string, string>): string;
}

export interface IPropertiesProvider {
  getProperty(key: string): string | null;
  setProperty(key: string, value: string): void;
}
```

### Step 3: Adapter Implementation (Layer 4)
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

  remove(key: string): void {
    this.cache.remove(key);
  }
}
```

### Step 4: Dependency Injection in the Logic Layers
Refactor Layer 1 utilities and Layer 2 Stores to accept these interfaces as arguments (Method Injection) or via a class constructor (Constructor Injection), rather than calling GAS globals directly.

**Impure (Current State):**
```typescript
class NetworkService {
  fetchClanData(tag: string) {
    const cache = CacheService.getScriptCache(); // HIDDEN DEPENDENCY!
    const apiKey = PropertiesService.getScriptProperties().getProperty('CLASH_API_KEY'); // HIDDEN DEPENDENCY!
    // ...
  }
}
```

**Pure (Target State via Dependency Injection):**
```typescript
class NetworkService {
  constructor(
    private cacheProvider: ICacheProvider, 
    private propsProvider: IPropertiesProvider,
    private networkProvider: INetworkProvider
  ) {}

  fetchClanData(tag: string) {
    const cached = this.cacheProvider.get(tag);
    if (cached) return JSON.parse(cached);

    const apiKey = this.propsProvider.getProperty('CLASH_API_KEY');
    if (!apiKey) throw new Error("API Key missing");
    // ...
  }
}
```

## 4. The Composition Root (Registry)

Because GAS requires entry points (like `doGet`, `doPost`, or time-driven triggers) to be globally accessible functions, we cannot use a traditional `main()` function to wire everything together at startup.

Instead, the `Registry.ts` file evolves into our **Composition Root**. It is the *only* file in the core application allowed to know which concrete implementations are being used. It instantiates the Adapters (Layer 4) and injects them into the Services (Layer 1) and Stores (Layer 2) at runtime.

### Example Registry Wiring:
```typescript
// Backend-GAS/Registry.ts
import { GasCacheAdapter } from './Adapters/GasCacheAdapter';
import { GasPropertiesAdapter } from './Adapters/GasPropertiesAdapter';
import { NetworkService } from './Network_Service';

// Initialize Adapters (Layer 4)
const cacheAdapter = new GasCacheAdapter();
const propsAdapter = new GasPropertiesAdapter();

// Initialize Core Services (Layer 1) passing in the Adapters
export const CoreServices = {
  Network: new NetworkService(cacheAdapter, propsAdapter, ...),
  // ...
};
```

When a trigger runs in Google:
```typescript
// Main.gs (Layer 5 - Delivery)
function executeNightlySync() {
  const data = Registry.CoreServices.Network.fetchClanData("#TAG");
  // ...
}
```

## 5. The Vitest Mocking Ecosystem

The true test of Kernel Purity is writing a Vitest assertion that runs in Node.js without crashing due to a `ReferenceError: CacheService is not defined`.

We create mock implementations of our interfaces that run purely in memory during CI/CD.

```typescript
// __tests__/mocks/MockCacheAdapter.ts
import { ICacheProvider } from '../../Backend-GAS/Interfaces';

export class MockCacheAdapter implements ICacheProvider {
  public memory = new Map<string, string>(); // Expose memory for test assertions

  get(key: string): string | null {
    return this.memory.get(key) || null;
  }
  
  set(key: string, value: string): void {
    this.memory.set(key, value);
  }

  remove(key: string): void {
      this.memory.delete(key);
  }
}
```

**Testing the Pure Logic:**
```typescript
import { test, expect } from 'vitest';
import { NetworkService } from '../../Backend-GAS/Network_Service';
import { MockCacheAdapter } from './mocks/MockCacheAdapter';
import { MockPropertiesAdapter } from './mocks/MockPropertiesAdapter';

test('NetworkService returns cached data when available', () => {
  // Arrange (Setup Mocks)
  const mockCache = new MockCacheAdapter();
  mockCache.set("#TAG", '{"name": "Mock Clan"}');
  
  const mockProps = new MockPropertiesAdapter();
  mockProps.setProperty('CLASH_API_KEY', 'fake_key');
  
  // Inject Mocks into the Pure Service
  const networkSvc = new NetworkService(mockCache, mockProps, new MockNetworkAdapter());

  // Act
  const result = networkSvc.fetchClanData("#TAG");

  // Assert
  expect(result.name).toBe("Mock Clan");
});
```

By completing this transition, the entire Backend-GAS architecture becomes a mathematically pure, universally testable domain core, interacting with the volatile Google environment only through strict, verifiable contracts.
