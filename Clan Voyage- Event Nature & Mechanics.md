# Clan Voyage — Master Reference Document

> **Project**: Clash Manager (CM)
> **Date**: May 2026
> **Status**: Implementation Ready
> **Scope**: Event tracking, data strategy, scoring integration, and implementation plan for the in-game Clan Voyage event.

---

## Part I — Event Nature & Mechanics

### Overview

Clan Voyage is a cooperative, milestone-driven in-game event that tracks collective clan activity through crown accumulation. Unlike standard ladder rankings, it prioritizes consistent participation across the entire roster — making active members in lower trophy brackets technically as valuable as top-tier players for the purpose of completing the event.

Critically, **there is no dedicated Clan Voyage endpoint in the official Clash Royale API**. This makes it a "phantom" event: it exists in-game but must be tracked entirely through aggregation of individual member battle logs.

---

### 1. Structure and Schedule

- **Duration**: Variable per event. Historically 5 or 7 days; recently reduced to a 3-day window.
- **Participation Threshold**: Players must be clan members at the event's start. Eligibility for rewards requires a minimum contribution (historically **15 crowns**), preventing inactive accounts from claiming prizes.
- **Milestone Scaling**: The total crown target is hardcoded per event and subject to change between events. It is **not exposed by the API** and must be entered manually at activation time.

---

### 2. Scoring and Progression

- **Primary Metric**: Enemy Crowns (towers destroyed). Maximum of **3 crowns per match**.
- **Included Game Modes**: Ladder (Trophy Road), Path of Legends, 2v2, Clan Wars, Special Challenges.
- **Excluded Game Modes**: Friendly Battles, Private Tournaments.

---

### 3. Rewards and Completion

The event features a segmented progression bar. Reaching specific milestones instantly unlocks rewards (Gold Crates, Lucky Drops, Tower Troop Chests, etc.) for all eligible members, regardless of individual contribution level — provided the minimum contribution threshold is met.

---

### 4. Tracking Gap & API Constraints

- **Core Limitation**: The absence of a dedicated API endpoint is the sole missing feature preventing the Roster system from reaching full reliability.
- **Notably**: Members in the bottom 10% of the clan can be critical contributors to event completion, making their tracking equally important to that of top-ranked members.
- **Consequence**: Tracking requires monitoring the `battle_log` of each individual member and aggregating crowns earned within the specific event's active timestamp window.
- **Back-Dating Constraint**: Back-dating an event's start is not feasible. Historical `battle_log` data cannot be retroactively captured. A ±1 day adjustment window may be considered for end time only.

---

### 5. Crown Target

- Since no API exposes the event's crown target, hardcoding must be avoided.
- **Preferred Approach**: Manual target entry via the UI at activation time.
- Smarter dynamic implementations (e.g., community-sourced defaults) may be explored in future iterations but are not a current priority.

---

## Part II — Technical Data Strategy

### 1. Data Capture Strategy ("Individual Aggregation")

Since no direct endpoint exists, the system must derive Clan Voyage data by aggregating individual battle logs.

| Property | Value |
|---|---|
| Primary Metric | Enemy Crowns (Towers Destroyed) |
| Max Crowns Per Match | 3 |
| Excluded Modes | Friendly Battles, Private Tournaments |
| Included Modes | Ladder, Path of Legends, 2v2, Clan Wars, Special Challenges |

**Backend Implementation**: The existing `ingest_player_battles` RPC already processes `team_crowns`. It will be extended to check whether a battle's `battle_time` falls within a `drivers.clan_voyages` active window. If so, it increments the member's contribution in `drivers.clan_voyage_contributions`.

---

### 2. Frontend Trigger Mechanism — Manual Activation via Countdown

Since neither the event start time nor the end time are available through the API, the user inputs both countdowns as displayed in-game.

**Inputs required at activation**:
1. **"Starts in HH:MM:SS"** — e.g., `"Starts in 04:20:00"`
2. **"Ends in HH:MM:SS"** — e.g., `"Ends in 72:00:00"`
3. **Crown Target** — the milestone total displayed in-game

**Parsing Logic (Mirror Activation)**:
1. **Starts in (HH:MM:SS)**: `start_at = now() + (H*3600 + M*60 + S)`
2. **Ends in (DD:HH:MM)**: `end_at = now() + (D*86400 + H*3600 + M*60)`
3. **Safety Buffer**: A +5s offset is applied to account for UI switching latency.
4. `target_crowns` is stored for progress bar calculation.
5. Event status automatically transitions: `PENDING` → `ACTIVE` at `start_at`, `ACTIVE` → `COMPLETED` at `end_at`.

---

### 3. Polling Strategy

**Rationale for interval selection**:
- The official API returns a maximum of **25 battles** per player per request.
- A standard Clash Royale match lasts approximately **3–7 minutes** (absolute floor ~1–3 minutes under ideal conditions).
- At a realistic average of ~5 minutes per match, 25 matches would take a minimum of **~125 minutes** to complete.
- A 25-match session completing in under 60 minutes would require every single match to finish in under 2.5 minutes — an extremely rare edge case.

**Decision**: Polling interval during an `ACTIVE` voyage is set to **60 minutes**.

**Rationale**:
- Even at an extreme pace of 3 minutes per match, a full 25-battle session (the API's maximum) would take **75 minutes** to complete.
- A 60-minute interval ensures we capture every match without overlapping requests or resource waste.

---

### 4. Data Integrity & Duplicate Prevention

Two-layer deduplication strategy to guarantee 100% fidelity:

1. **Source Deduplication**: The `ingest_player_battles` RPC enforces a `(player_tag, battle_time)` unique constraint in `drivers.player_battles`. Each battle is stored exactly once, regardless of how many times the polling cycle runs.

2. **Contribution Aggregation**: `drivers.clan_voyage_contributions` is **not** a cumulative counter. It is derived via a `SUM(team_crowns)` query over `drivers.player_battles` filtered to the specific voyage's active time window. This makes the system fully resilient to re-ingestion, out-of-order data, and edge-case replay scenarios.

---

## Part III — Scoring Integration (RPeS)

### Rolling Voyage Performance (RVP) Score

To provide scoring stability and natural decay of performance across events (consistent with the War Week model), a **Rolling Voyage Performance (RVP)** score is used.

**Step 1 — Single Event Score (SES)**:

```
SES = (1 - (Rank - 1) / (Eligible_Members - 1)) × 100
```

- Top contributor → SES = 100
- Bottom contributor → SES = 0
- Non-participants are classified and penalized separately (not included in rank denominator)

**Step 2 — Rolling Average (RVP)**:

```
RVP = AVG(SES) over last 3 Voyages
```

This provides natural decay: a single strong performance doesn't permanently elevate a member, and a single poor performance doesn't catastrophically penalize them.

---

### Integration into `baseline_raw_score`

```
baseline_raw_score = [existing components] + (RVP × 50)
```

**Weight**: 50 → **Maximum contribution**: **5,000 points**

#### Contextual Magnitude (compared to actual RPeS components)

| Metric | Calculation Weight | Approx. Max Raw Points | Role in Formula |
|---|---|---|---|
| **War Fame** | `current_fame * 3` | ~10,800 | Weekly Performance |
| **Legacy Fame** | `avg_fame * 15` | ~54,000 | Long-term War Consistency |
| **War Participation** | `war_rate * 150` | ~15,000 | Deck Usage Efficiency |
| **Donations** | `donations * 100` | ~100,000 | Support Activity |
| **Trophies** | `trophies * 0.1` | ~900 | Skill Floor |
| **`RVP` (Voyage)** | **`RVP * 50`** | **5,000** | **Consistent Activity Booster** |

**Design Intent**: Voyage performance is calibrated to be a significant "Activity Booster." While it is secondary to the combined War components (~80k potential), it is **5x more impactful than Trophies** and acts as a powerful tie-breaker for active members.

---

## Part IV — Implementation Plan

### Database (Supabase)

#### 8. Frontend Implementation

### Folder Structure
- `src/features/voyage/`
    - `components/EventManagement.vue` (Settings Card)
    - `components/VoyageBanner.vue` (Roster Progress)
    - `composables/useVoyage.ts` (T2T Logic & State)
    - `types.ts` (API/Schema Definitions)

### Visual Rationale
- **Mirror Setup**: Uses a `SettingsCard` with reactive `startsIn` inputs.
- **Progress Monitoring**: Uses a `VoyageBanner` with glassmorphism styling, animated progress bars, and a pulsing "Live" indicator when an event is active.

## 9. Connectivity & Communication

### Protocol: Supabase Realtime
- The frontend subscribes to `drivers.clan_voyage_contributions` for the active `voyage_id`.
- As battles are ingested every 60 minutes, the progress bar updates automatically for all users.

### Activation Logic (T2T Triple-Input)
1. **User Interface**: Three distinct containers `[ Days ] : [ Hours ] : [ Mins ]`.
2. **Logic**: Frontend calculates `total_seconds = (D * 86400) + (H * 3600) + (M * 60)`.
3. **Database Injection**: Calls `drivers.initialize_voyage()` with absolute timestamps.

## 10. Reliability & Troubleshooting

### Backend Audit Ledger
All completed voyages generate a record in `drivers.voyage_audit_logs`. This provides a clinical trace of:
- **Final Accuracy**: Comparison between target and actual crowns at the exact moment of `end_at`.
- **System Drift**: Recording the delay between the event end and the final high-fidelity ingestion sync.

### Showcase Mode (Synthetic Simulation)
The `voyage` feature is integrated into `useShowcaseMode`, allowing simulation of:
- **Active State**: Progress bar at 50%.
- **Victory State**: Goal met, triggering the vibrant success UI.

#### [MODIFY] `scoring_view` (`20260504000300_clinical_dry_view_consolidation.sql`)
- Update the view to join with the latest completed voyage data.
- Integrate `RVP` relative ranking score into the `baseline_raw_score` calculation with weight 50.

---

### Backend (Edge Functions / Cron)

#### [NEW] `20260515000100_setup_voyage_cron.sql` — `voyage-high-fidelity-cron`
- Set up a staggered cron job at a **60-minute interval**.
- Cron only triggers `ingest-royale-data` if a voyage is currently in `ACTIVE` status — no unnecessary execution otherwise.

#### [MODIFY] `ingest-player-battles` RPC (`20260421200000_player_registry_unification.sql`)
- Add logic to check if an ingested battle's `battle_time` falls within an active voyage window.
- If so, update `drivers.clan_voyage_contributions` accordingly (via the `SUM`-based aggregation model, not a counter increment).

---

### Frontend (PWA) — Hybrid Architecture

#### 1. Setup & Activation (`Settings` Feature)
| Component | Purpose |
|---|---|
| `EventManagement.vue` | A settings card for **Mirror Activation**. Inputs for countdowns (Starts in, Ends in) and crown targets. |

#### 2. Monitoring & Progress (`Roster` Feature)
| Component | Purpose |
|---|---|
| `VoyageProgressBanner.vue` | A high-fidelity progress bar and countdown located in the `RosterHeader` extra slot. Only visible during `ACTIVE` events. |
| `VoyageDashboard.vue` | Detailed per-member leaderboard overlay accessible from the banner. |

#### 3. Core Logic (`Voyage` Feature)
| File | Purpose |
|---|---|
| `useVoyage.ts` | Centralized composable for event state, T2T parsing, and progress calculations. |

#### [MODIFY] `RosterView.vue`
- Integrate `VoyageProgressBanner` into the `#extra` slot of `ConsoleHeader`.

---

### Verification Plan

#### Automated Tests
- Unit tests for `useVoyage.ts` to verify countdown-to-timestamp conversion accuracy across edge cases (e.g., cross-midnight rollover, sub-minute inputs).
- SQL tests to confirm that `ingest_player_battles` correctly updates voyage contributions and that the unique constraint prevents duplicate entries.

#### Manual Verification
- Manually trigger a "Test Voyage" with a 1-hour window.
- Verify that battles fought during that hour are captured and displayed in the UI.
- Verify that the RPeS score updates correctly after voyage completion.
- Confirm non-participants are classified separately and penalized as expected.

---

## Part V — Open Questions & Future Work

| Topic | Status | Notes |
|---|---|---|
| RPoS integration | Not yet scoped | RPoS will likely require algebraic revision similar to RPeS; formal research needed before implementation |
| Dynamic crown target | Future | Community-sourced defaults or pattern recognition across events |
| Non-participant penalty | To be defined | Penalization model for members who were eligible but contributed 0 crowns |
| Back-date adjustment window | Low priority | A ±1 day end-time adjustment may be useful; start-time back-dating is infeasible by design |
