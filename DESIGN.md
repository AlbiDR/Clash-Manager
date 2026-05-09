---
seed: 246813
name: "Clash Manager Neo-Material"
brand:
  colors:
    primary: "#0061A4"
    secondary: "#535F70"
  typography:
    heading: "Inter"
    body: "Inter"
    mono: "JetBrains Mono"
tokens:
  color:
    background:
      light: "#FDFCFF"
      dark: "#0B0E14"
    surface:
      light: "#FDFCFF"
      dark: "#0B0E14"
    surfaceContainer:
      light: "#F3EDF7"
      dark: "#1B1F27"
    primary:
      light: "#0061A4"
      dark: "#A8C7FA"
    onPrimary:
      light: "#FFFFFF"
      dark: "#00315B"
    secondary:
      light: "#535F70"
      dark: "#BBC7DB"
    error:
      light: "#BA1A1A"
      dark: "#FFB4AB"
    success:
      light: "#145218"
      dark: "#6DD58C"
    glass:
      light: "rgba(255, 255, 255, 0.9)"
      dark: "rgba(20, 24, 32, 0.94)"
    outline:
      light: "#5F6368"
      dark: "#9AA0A6"
  radius:
    small: 8
    medium: 12
    large: 24
    full: 9999
  motion:
    spring: "cubic-bezier(0.175, 0.885, 0.32, 1.15)"
  elevation:
    level2: "0 4px 12px -2px rgba(0, 0, 0, 0.08)"
    level3: "0 12px 32px -4px rgba(0, 0, 0, 0.1)"
---

# Clash Manager Design System

The Clash Manager design system, "Neo-Material," is a high-performance, mobile-first design language built for technical purity and tactical engagement. It fuses the structural foundations of Material Design 3 (M3) with a premium, glassmorphic aesthetic tailored for a Progressive Web App (PWA) environment.

## Vision & Principles

- **Technical Purity**: Zero runtime bloat. All design tokens are programmatically derived and optimized for static extraction, ensuring 100/100 Lighthouse performance scores.
- **Tactile Precision**: Interfaces should feel alive. Every interaction uses high-fidelity "squish" physics and spring-based animations to provide immediate, satisfying feedback.
- **Mobile-First Gestalt**: Designed for one-handed operation. Elements are sized for touch-targets, and layout logic accounts for safe-area insets and native overscroll behaviors.
- **Clarity in Complexity**: Data-heavy views are organized through hierarchical elevation and subtle contrast shifts, ensuring critical gaming stats are readable at a glance.

## Visual Identity

### Color & Contrast
The palette utilizes a dynamic M3 color system. In light mode, it emphasizes professional clarity with deep blues and soft grays. In dark mode, it shifts to a "True Black" background (`#0B0E14`) to maximize OLED efficiency and visual focus, using high-saturation primary accents to guide the eye.

### Typography
- **Primary (Inter)**: A modern variable font used for all UI text and headings. Heavy weights (800-900) are used for titles to create a strong, authoritative hierarchy.
- **Technical (JetBrains Mono)**: Used for player tags, trophy counts, and performance metrics to convey a "pro-tool" aesthetic.

### Shape & Structure
The system uses a generous corner radius system. Large radii (24px) are used for primary containers and panels, while full rounding (9999px) is reserved for interactive primitives like buttons and status pills. This creates a soft, approachable silhouette that contrasts with the technical nature of the data.

### Interaction & Motion
Motion is a core component of the user experience.
- **Spring Physics**: All scaling and translation effects use a signature spring curve (`cubic-bezier(0.175, 0.885, 0.32, 1.15)`) that avoids the robotic feel of linear transitions.
- **Micro-interactions**: Buttons and cards "squish" when pressed, providing a physical sense of resistance and activation.
- **Glassmorphism**: High-level panels (like the floating dock and tooltips) use glass backgrounds with 24px blur and saturation filters to maintain context with the underlying content.

## Component Archetypes

- **Glass Panels**: Elevated containers with 0.5px borders and deep shadows, used for overlays and global navigation.
- **Status Pills**: Vibrant, high-contrast indicators for roles, tiers, and momentum.
- **Base Cards**: The primary unit of information, using level 2 elevation and squish interactions for selection.
