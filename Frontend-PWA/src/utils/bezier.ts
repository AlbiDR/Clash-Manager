
export interface Point { x: number; y: number }

/**
 * Calculates a Linear Regression (Best Fit) line for the given points.
 * Returns the SVG path and the trend direction.
 */
export const generateLinearTrend = (points: Point[]): { path: string, isPositive: boolean } => {
  if (points.length < 2) return { path: '', isPositive: false }

  const n = points.length
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0

  for (const p of points) {
    sumX += p.x
    sumY += p.y
    sumXY += p.x * p.y
    sumXX += p.x * p.x
  }

  // Least Squares Formula
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Calculate start (x1) and end (x2) points based on first and last bar center
  const x1 = points[0].x
  const y1 = slope * x1 + intercept
  const x2 = points[n - 1].x
  const y2 = slope * x2 + intercept

  // SVG Y-axis is inverted (0 is top). 
  // A negative slope means the line is going UP visually (Value is increasing).
  const isPositive = slope < 0

  return {
    path: `M ${x1.toFixed(2)},${y1.toFixed(2)} L ${x2.toFixed(2)},${y2.toFixed(2)}`,
    isPositive
  }
}
