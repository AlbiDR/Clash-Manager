
export interface Point { x: number; y: number }

const getLineProps = (a: Point, b: Point) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return {
    length: Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2)),
    angle: Math.atan2(dy, dx)
  }
}

const getControlPoint = (current: Point, prev: Point, next: Point, reverse?: boolean): Point => {
  const p = prev || current
  const n = next || current
  const smoothing = 0.15
  const line = getLineProps(p, n)
  const angle = line.angle + (reverse ? Math.PI : 0)
  const length = line.length * smoothing
  
  return {
    x: current.x + Math.cos(angle) * length,
    y: current.y + Math.sin(angle) * length
  }
}

export const generateSmoothPath = (points: Point[]): string => {
  if (points.length < 2) return ''
  
  let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`
  
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i]
    const next = points[i + 1]
    const prev = points[i - 1] || curr
    const nextNext = points[i + 2] || next
    
    const cp1 = getControlPoint(curr, prev, next, false)
    const cp2 = getControlPoint(next, curr, nextNext, true)
    
    d += ` C ${cp1.x.toFixed(2)},${cp1.y.toFixed(2)} ${cp2.x.toFixed(2)},${cp2.y.toFixed(2)} ${next.x.toFixed(2)},${next.y.toFixed(2)}`
  }
  return d
}

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
