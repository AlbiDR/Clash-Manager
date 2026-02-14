import { ref, onMounted, onUnmounted } from "vue";

/**
 * 🛰️ HEADER SCROLL ENGINE
 * Manages sticky header transitions and scroll-depth awareness.
 */
export function useHeaderScroll(threshold = 20) {
  const isScrolled = ref(false);

  const handleScroll = () => {
    isScrolled.value = window.scrollY > threshold;
  };

  onMounted(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    // Initial check in case page is already scrolled
    handleScroll();
  });

  onUnmounted(() => {
    window.removeEventListener("scroll", handleScroll);
  });

  return {
    isScrolled,
  };
}
