// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// [UI] UI Components
export { default as Icon } from "./ui/Icon.vue";
export { default as BaseCard } from "./ui/BaseCard.vue";
export { default as BaseCardSkeleton } from "./ui/BaseCardSkeleton.vue";
export { default as SettingsCard } from "./ui/SettingsCard.vue";
export { default as SkeletonSettingsCard } from "./ui/SkeletonSettingsCard.vue";
export { default as StatusPill } from "./ui/StatusPill.vue";
export { default as MomentumPill } from "./ui/MomentumPill.vue";
export { default as TrophyBadge } from "./ui/TrophyBadge.vue";
export { default as ScoreBadge } from "./ui/ScoreBadge.vue";
export { default as RoleBadge } from "./ui/RoleBadge.vue";
export { default as TenureBadge } from "./ui/TenureBadge.vue";
export { default as TagBadge } from "./ui/TagBadge.vue";
export { default as LongevityBadge } from "./ui/LongevityBadge.vue";
export { default as BaseBadge } from "./ui/BaseBadge.vue";
export { default as StatsGrid } from "./ui/StatsGrid.vue";
export { default as StatisticItem } from "./ui/StatisticItem.vue";
export { default as ErrorState } from "./ui/ErrorState.vue";
export { default as EmptyState } from "./ui/EmptyState.vue";
export { default as ErrorBoundary } from "./ui/ErrorBoundary.vue";
export { default as CardActions } from "./ui/CardActions.vue";
export { default as Toast } from "./ui/Toast.vue";
export { default as ToastContainer } from "./ui/ToastContainer.vue";
export { default as SelectionBar } from "./ui/SelectionBar.vue";
export { default as SettingRow } from "./ui/SettingRow.vue";
export { default as ConsoleHeader } from "./ui/ConsoleHeader.vue";
export { default as ConsoleLayout } from "./ui/ConsoleLayout.vue";
export { default as ConsoleList } from "./ui/ConsoleList.vue";
export { default as FloatingDock } from "./ui/FloatingDock.vue";
export { default as AppFooter } from "./ui/AppFooter.vue";
export { default as HeaderInfoOverlay } from "./ui/HeaderInfoOverlay.vue";
export { default as DurationInput } from "./ui/DurationInput.vue";
export { default as BaseHistoryChart } from "./ui/BaseHistoryChart.vue";

// Directives
export { vTactile } from "./directives/vTactile";
export { vTooltip } from "./directives/vTooltip";

// Composables (Shared Atoms)

export { useTheme } from "./composables/useTheme";
export { useLongPress } from "./composables/useLongPress";

export { useHeaderScroll } from "./composables/useHeaderScroll";
export { usePullToRefresh } from "./composables/usePullToRefresh";

export { useCardMechanics } from "./composables/useCardMechanics";
