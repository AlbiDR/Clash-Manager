# Optimize Journal

> "Tracking the daily pursuit of performance."

| Date | Title | Bottleneck | Proof of Gain |
| ---- | ----- | ---------- | ------------- |
| 17-01-2025 | Bundle Strategy Refinement | Monolithic UI bundle & misaligned validation chunks | ~80kB reduction in entry payload; true lazy-loading for WarHistoryChart |

## 17-01-2025 [Bundle Chunking Precision]
**Learning:** Vite's `manualChunks` take precedence over `defineAsyncComponent` dynamic imports. If a component is matched by a broad manual chunk pattern (e.g., `src/components/`), it will be pulled into that monolithic bundle instead of remaining lazy-loaded.
**Action:** Always exclude async-intended components from broad manual chunk regex/rules to preserve code-splitting.

18-01-2026 Optimized List Sync Re-renders
Learning: Redundant O(N) re-renders during background data refreshes can be avoided by conditionalizing the sync state in v-memo. Action: Always use conditional v-memo for global states that only affect expanded or specific items in long lists.
