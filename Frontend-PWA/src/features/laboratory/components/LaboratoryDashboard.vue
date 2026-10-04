<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<template>
  <div class="dashboard-grid">
    <div class="dashboard-sidebar">
      <slot name="sidebar" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.dashboard-grid {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-20);
}

.dashboard-sidebar {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, var(--sys-layout-two-panel-min-width)), 1fr)
  );
  gap: var(--sys-space-16);
}
</style>
