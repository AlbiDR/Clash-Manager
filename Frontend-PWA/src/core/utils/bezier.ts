// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * MODULE: BEZIER & MATHEMATICAL VISUALIZATION (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Provides pure mathematical utilities for generating geometric
 * paths and statistical trends used in data visualization components.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 * - Role: Mathematical Substrate.
 * - Import Boundaries: This module is a leaf node in the dependency graph.
 *   It MUST NOT import from any other layers.
 */

/**
 * Represents a discrete coordinate in a 2D Cartesian plane.
 */
export interface Point {
  /** The horizontal coordinate. */
  x: number;
  /** The vertical coordinate (inverted in SVG space). */
  y: number;
}

/**
 * Calculates a Linear Regression (Best Fit) line for a series of data points.
 *
 * @remarks
 * This function uses the Ordinary Least Squares (OLS) method to find the
 * linear relationship between x and y coordinates. It is primarily used
 * to render performance trendlines in charts (e.g., War History).
 *
 * @param points - An array of {@link Point} objects to analyze.
 * @returns An object containing:
 *  - `path`: An SVG-compliant 'M L' path string.
 *  - `isPositive`: Boolean indicating if the trend is upward (improvement).
 */
export const generateLinearTrend = (
  points: Point[],
): { path: string; isPositive: boolean } => {
  // Domain Guard: Linear regression requires at least two points to establish a slope.
  if (points.length < 2) return { path: "", isPositive: false };

  const n = points.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;

  // 1. Accumulate Sums
  // Rationale: We iterate once to gather all necessary components for the OLS formula.
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }

  // 2. Ordinary Least Squares (OLS) Formula
  // Intent: Calculate the 'm' (slope) and 'b' (intercept) for the line y = mx + b.
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // 3. Coordinate Projection
  // We project the trendline from the first X-coordinate to the last X-coordinate
  // using the derived linear equation.
  const x1 = points[0].x;
  const y1 = slope * x1 + intercept;
  const x2 = points[n - 1].x;
  const y2 = slope * x2 + intercept;

  // 4. Trend Interpretation
  // [DECISION LOG] SVG Coordinate Space:
  // In SVG, Y=0 is the top of the viewport. A NEGATIVE slope in coordinate space
  // actually represents a POSITIVE visual trend (the value is rising).
  const isPositive = slope < 0;

  return {
    path: `M ${x1.toFixed(2)},${y1.toFixed(2)} L ${x2.toFixed(2)},${y2.toFixed(2)}`,
    isPositive,
  };
};
