// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import type { Directive } from "vue";
import type { BenchmarkData } from "../../core/services/useBenchmarking";

// Singleton Tooltip State
let tooltipEl: HTMLDivElement | null = null;
let activeTarget: HTMLElement | null = null;
let hideTimer: number | null = null;
let pressTimer: any = null;

/**
 * Internal UI: Create or retrieve the singleton tooltip element.
 *
 * @internal
 * Side Effect: Appends a div to document.body and initializes Popover API if supported.
 */
function createTooltip() {
  if (tooltipEl) return tooltipEl;
  const el = document.createElement("div");
  el.className = "rich-tooltip";
  
  // OPTIMIZATION: Use Popover API if available (Optimization #54)
  if ("showPopover" in el) {
    (el as any).popover = "manual";
  }
  
  document.body.appendChild(el);
  tooltipEl = el;
  return el;
}

/**
 * Renders the tooltip content based on the provided data.
 *
 * @param data - Either a simple string or a complex BenchmarkData object.
 */
function renderContent(data: BenchmarkData | string) {
  if (!tooltipEl) return;
  if (typeof data === "string") {
    tooltipEl.innerHTML = `<div class="rt-simple">${data}</div>`;
    return;
  }
  
  const range = data.max - data.min || 1;
  const playerPos = Math.min(100, Math.max(0, ((data.value - data.min) / range) * 100));
  const avgPos = Math.min(100, Math.max(0, ((data.avg - data.min) / range) * 100));
  const sentimentClass = data.isBetter ? "better" : "worse";
  const delta = data.isBetter ? `+${data.percent}%` : `-${data.percent}%`;

  tooltipEl.innerHTML = `
    <div class="rt-header">
        <span class="rt-label">${data.label}</span>
        <span class="rt-tier tier-${data.tier.toLowerCase().replace(/\s+/g, "-")}">${data.tier}</span>
    </div>
    <div class="rt-visual"><div class="rt-track">
        <div class="rt-line"></div>
        <div class="rt-marker avg" style="left: ${avgPos}%"></div>
        <div class="rt-marker player ${sentimentClass}" style="left: ${playerPos}%"></div>
    </div></div>
    <div class="rt-footer">
        <span class="rt-stat">AVG ${Math.round(data.avg).toLocaleString()}</span>
        <span class="rt-delta ${sentimentClass}">${delta}</span>
    </div>
    <div class="rt-bounds">
        <div class="rt-bound"><span>MIN</span> ${Math.round(data.min).toLocaleString()}</div>
        <div class="rt-bound"><span>MAX</span> ${Math.round(data.max).toLocaleString()}</div>
    </div>`;
}

/**
 * Positions the tooltip relative to the target element.
 *
 * @param el - The target element to anchor the tooltip to.
 */
function positionTooltip(el: HTMLElement) {
  if (!tooltipEl) return;
  const rect = el.getBoundingClientRect();
  const scrollY = window.scrollY;
  const viewportWidth = window.innerWidth;
  const padding = 12;

  tooltipEl.classList.add("visible");
  
  // Show via Popover API if supported for better layering
  if ("showPopover" in tooltipEl) {
    try { (tooltipEl as any).showPopover(); } catch (e) { /* fallback */ }
  }

  const tipRect = tooltipEl.getBoundingClientRect();

  let left = rect.left + rect.width / 2;
  const halfWidth = tipRect.width / 2;
  if (left - halfWidth < padding) left = halfWidth + padding;
  else if (left + halfWidth > viewportWidth - padding) left = viewportWidth - halfWidth - padding;

  let top = rect.top + scrollY - 8;
  let translateY = "-100%";
  if (rect.top < tipRect.height + padding * 2) {
    top = rect.bottom + scrollY + 8;
    translateY = "0%";
  }

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipEl.style.transform = `translateX(-50%) translateY(${translateY}) scale(1)`;
}

/**
 * Hides the tooltip globally.
 */
function globalHide() {
  if (tooltipEl) {
    tooltipEl.classList.remove("visible");
    tooltipEl.style.transform = tooltipEl.style.transform.replace("scale(1)", "scale(0.8)");
    if ("hidePopover" in tooltipEl) {
      try { (tooltipEl as any).hidePopover(); } catch (e) { /* ignore */ }
    }
  }
  activeTarget = null;
}

// Typing for element-bound values to fix any usage
interface TooltipHTMLElement extends HTMLElement {
  _tooltipValue?: BenchmarkData | string;
}

// SPEED WIZARD: Unified Delegated Listeners
if (typeof window !== "undefined") {
  const handleShow = (el: TooltipHTMLElement) => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    const value = el._tooltipValue;
    if (!value) return;
    createTooltip();
    activeTarget = el;
    renderContent(value);
    positionTooltip(el);
    if (navigator.vibrate) navigator.vibrate(40);
  };

  const handleHide = () => {
    hideTimer = window.setTimeout(globalHide, 100);
  };

  // Mouse Delegation
  document.body.addEventListener("mouseover", (e) => {
    const target = (e.target as HTMLElement).closest("[data-v-tooltip]") as TooltipHTMLElement | null;
    if (target) handleShow(target);
  });
  
  document.body.addEventListener("mouseout", (e) => {
    const target = (e.target as HTMLElement).closest("[data-v-tooltip]") as TooltipHTMLElement | null;
    if (target) handleHide();
  });

  // Touch Delegation (Long Press)
  document.body.addEventListener("touchstart", (e) => {
    const target = (e.target as HTMLElement).closest("[data-v-tooltip]") as TooltipHTMLElement | null;
    if (!target) {
        if (tooltipEl?.classList.contains("visible") && !((e.target as HTMLElement).closest(".rich-tooltip"))) globalHide();
        return;
    }
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => handleShow(target), 400);
  }, { passive: true });

  document.body.addEventListener("touchend", () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  }, { passive: true });

  window.addEventListener("scroll", globalHide, { passive: true });
}

/**
 * V-TOOLTIP DIRECTIVE
 * Provides an interactive rich tooltip for strings or BenchmarkData.
 *
 * @remarks
 * This directive is a Layer 2 (@shared) molecule. It provides a context-blind
 * information overlay that remains consistent across all business features.
 * To maintain performance and prevent DOM bloat, it utilizes a singleton pattern
 * with event delegation on document.body.
 *
 * Architectural Constraints:
 * - Must not import from @features or @app.
 * - Relies on the Popover API for top-layer rendering (Optimization #54).
 * - Implements delegated listeners to avoid attaching thousands of mouse events.
 *
 * Interaction Thresholds:
 * - Touch (Long Press): 400ms hold required to trigger.
 * - Haptic Duration: 40ms vibration on activation.
 * - Hide Delay: 100ms debounced exit to prevent flickering.
 *
 * Side Effects:
 * - Creates and appends a '.rich-tooltip' div to document.body on first use.
 * - Attaches global listeners to document.body and window for event delegation and scroll-to-hide.
 * - Triggers hardware haptics via navigator.vibrate.
 *
 * Reactive State:
 * - The directive's value (BenchmarkData | string) is stored as an expando
 *   '_tooltipValue' on the DOM element for retrieval by the delegated handler.
 */
export const vTooltip: Directive<TooltipHTMLElement, BenchmarkData | string> = {
  mounted(el, binding) {
    el._tooltipValue = binding.value;
    if (binding.value) {
      el.setAttribute("data-v-tooltip", "true");
    }
  },
  updated(el, binding) {
    el._tooltipValue = binding.value;
    if (binding.value) {
      el.setAttribute("data-v-tooltip", "true");
    } else {
      el.removeAttribute("data-v-tooltip");
    }
  },
  unmounted(el) {
    if (activeTarget === el) globalHide();
    delete el._tooltipValue;
  }
};
