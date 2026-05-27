# Roster -- Leadership Console

The **Leaderboard**. A specialized Feature (Layer 3) responsible for analyzing clan member performance, visualizing historical trends, and orchestrating roster management operations.

---

## Purpose
The Roster feature provides an authoritative view of the clan's internal health. It replaces intuition with high-precision metrics (PeS/RPeS), allowing leadership to objectively evaluate members based on both lifetime contribution and current competitive momentum.

## Architectural Context
- **Layer**: Layer 3 (@features)
- **Isolation**: Strictly siloed. Never imports from `Laboratory`, `Headhunter`, or `Settings`.
- **Dependencies**:
  - `@core/utils/predictionMath`: Historical parsing and predictive algorithms.
  - `@core/services/useConsoleController`: Standardized list orchestration (Search/Sort/Selection).
  - `@shared/ui/BaseCard`: The foundational UI molecule for member profiles.

## Logic Subsystems

### Leaderboard Orchestration (useLeaderboard.ts)
The primary behavioral engine for the Roster interface.
- **Console Integration**: Configures the `useConsoleController` with roster-specific sorting (Score, Trophies, War Rate, Donations) and deep-linking (`member-`).
- **Data Synchronization**: Bridges the reactive `members` state from the Layer 1 store (`useClashDataStore`) to the view layer, managing hydration and refresh cycles.
- **Bulk Selection**: Extends the standard selection logic to support specialized "Select by Score" filters for rapid group management.

### Performance Scoring (PeS & RPeS)
The Roster feature utilizes a dual-metric model to distinguish between historical "grind" and current form.
- **RPeS (Raw Performance Score)**: The absolute sum of weighted performance vectors (Fame, Donations, Trophies, and Participation Rate). It represents a member's total value accumulated in the system.
- **PeS (Performance Score)**: A relative normalization of the RPeS against the current clan benchmark. The top member defines the 100% curve, ensuring the leaderboard remains a relative benchmark regardless of meta shifts.

### Visualization & Predictive Trends (WarHistoryChart.vue)
A high-precision visualization engine for war performance.
- **Historical Parsing**: Decompresses 52-week war history logs into chronological data points.
- **Trend Analysis**: Uses a Linear Best Fit algorithm (`generateLinearTrend`) to calculate performance trajectories (Positive/Negative).
- **Predictive Projection**: Implements a 10-week linear decay weighted average engine to project next-week performance.
- **Hardware Acceleration**: Utilizes SVG overlays and CSS transforms for fluid, 60FPS interactions.

## Component Registry

### MemberCard.vue
The primary entry for member data. Implements high-density information layout, including:
- **Identity Stack**: Name, Tag, Role, and Tenure (Days in clan).
- **Metric Pods**: Integrated tooltips for benchmarking individual stats against clan averages.
- **Interactive Slots**: Leverages `BaseCard` for unified selection and expansion behavior.

### WarHistoryChart.vue
A domain-specific molecule for war fame visualization.
- **Geometric Dot Mapping**: Maps discrete fame values to an SVG coordinate space (0-100).
- **Dynamic Styling**: Color-coded bars based on win thresholds and activity status.
- **Skeleton Support**: Integrated loading states using the `sk-chart-area` design pattern.

## Data Flow
1. **Ingestion**: `useLeaderboard` observes the Layer 1 `members` store.
2. **Analysis**: Stats are passed through `@core/utils` formatters for display normalization.
3. **Visualization**: `WarHistoryChart` parses raw logs and generates geometric trend paths.
4. **Interaction**: User selection/search updates the `useConsoleController` state -> Filters the visible list with `v-auto-animate` transitions.

## Key Constraints & Silo Isolation
- **Sovereign Design**: No third-party charting libraries. All visualizations are custom-crafted using SVG and pure CSS.
- **No Cross-Feature Imports**: The Roster feature is domain-blind to recruitment (Headhunter) or simulations (Laboratory).
- **Read-Only Purity**: While the Roster allows for management decisions, it never modifies core data directly. All persistent state changes must be routed through Layer 1 API services.
