<template>
  <div class="skeleton-card">
    <div class="skeleton-header">
      <div class="info-stack">
        <div class="sk-bar name-bar"></div>
        <div class="sk-bar meta-bar"></div>
      </div>
      <div class="action-area">
        <div class="sk-box stat-pod"></div>
        <div class="sk-circle chevron"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-card {
  background: var(--sys-color-surface-container);
  border-radius: var(--shape-corner-l);
  padding: var(--spacing-l) var(--spacing-m);
  margin-bottom: var(--spacing-xs);
  border: 1px solid transparent;
  height: 106px; /* Approx height of MemberCard header */
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}

/* Shimmer Effect */
.skeleton-card::after {
  content: "";
  position: absolute;
  top: 0; right: 0; bottom: 0; left: 0;
  transform: translateX(-100%);
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0,
    rgba(255, 255, 255, 0.05) 20%,
    rgba(255, 255, 255, 0.1) 60%,
    rgba(255, 255, 255, 0)
  );
  animation: shimmer 2s infinite;
}

.skeleton-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}

.info-stack {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-area {
  display: flex;
  align-items: center;
  gap: var(--spacing-s);
}

.sk-bar {
  background: var(--sys-color-surface-container-highest);
  border-radius: 4px;
}

.name-bar {
  width: 60%;
  height: 20px;
}

.meta-bar {
  width: 40%;
  height: 14px;
}

.sk-box {
  background: var(--sys-color-surface-container-highest);
  border-radius: 20px; /* Matched to new squircle */
}

.stat-pod {
  width: 64px; /* Increased from 56px */
  height: 64px;
}

.sk-circle {
  background: var(--sys-color-surface-container-highest);
  border-radius: 50%;
}

.chevron {
  width: 32px;
  height: 32px;
}

@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
