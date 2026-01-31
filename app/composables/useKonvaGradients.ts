import type { ColorValue, GradientConfig } from '~/types/canvas'

/**
 * Convert ColorValue to Konva fill properties
 */
export function getKonvaFillProps(
  color: ColorValue,
  bounds: { width: number; height: number }
): Record<string, any> {
  if (typeof color === 'string') {
    return { fill: color }
  }

  const gradient = color as GradientConfig

  if (gradient.type === 'linear') {
    const angle = (gradient.angle ?? 0) * (Math.PI / 180)
    const centerX = bounds.width / 2
    const centerY = bounds.height / 2
    
    // Calculate start and end points based on angle
    // For linear gradients, we'll use diagonal from center
    const length = Math.sqrt(bounds.width ** 2 + bounds.height ** 2) / 2
    const startX = centerX - length * Math.cos(angle)
    const startY = centerY - length * Math.sin(angle)
    const endX = centerX + length * Math.cos(angle)
    const endY = centerY + length * Math.sin(angle)

    return {
      fillLinearGradientStartPoint: { x: startX, y: startY },
      fillLinearGradientEndPoint: { x: endX, y: endY },
      fillLinearGradientColorStops: gradient.stops.flatMap(s => [s.offset, s.color]),
    }
  } else {
    // Radial gradient
    const centerX = bounds.width / 2
    const centerY = bounds.height / 2
    const radius = Math.min(bounds.width, bounds.height) / 2

    return {
      fillRadialGradientStartPoint: { x: centerX, y: centerY },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndPoint: { x: centerX, y: centerY },
      fillRadialGradientEndRadius: radius,
      fillRadialGradientColorStops: gradient.stops.flatMap(s => [s.offset, s.color]),
    }
  }
}

/**
 * Convert ColorValue to Konva stroke properties for lines
 * For lines, we need to calculate gradient along the line path
 */
export function getKonvaStrokeProps(
  color: ColorValue,
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number }
): Record<string, any> {
  if (typeof color === 'string') {
    return { stroke: color }
  }

  const gradient = color as GradientConfig

  if (gradient.type === 'linear') {
    // For linear gradients on strokes, use the line's start and end points
    return {
      strokeLinearGradientStartPoint: { x: startPoint.x, y: startPoint.y },
      strokeLinearGradientEndPoint: { x: endPoint.x, y: endPoint.y },
      strokeLinearGradientColorStops: gradient.stops.flatMap(s => [s.offset, s.color]),
    }
  } else {
    // Radial gradients on strokes - use midpoint as center
    const midX = (startPoint.x + endPoint.x) / 2
    const midY = (startPoint.y + endPoint.y) / 2
    const distance = Math.sqrt(
      (endPoint.x - startPoint.x) ** 2 + (endPoint.y - startPoint.y) ** 2
    )

    return {
      strokeRadialGradientStartPoint: { x: midX, y: midY },
      strokeRadialGradientStartRadius: 0,
      strokeRadialGradientEndPoint: { x: midX, y: midY },
      strokeRadialGradientEndRadius: distance / 2,
      strokeRadialGradientColorStops: gradient.stops.flatMap(s => [s.offset, s.color]),
    }
  }
}

/**
 * Get a CSS gradient string for preview purposes
 */
export function getCSSGradient(color: ColorValue, angle: number = 135): string {
  if (typeof color === 'string') {
    return color
  }

  const gradient = color as GradientConfig
  const stops = gradient.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ')

  if (gradient.type === 'linear') {
    const angleDeg = gradient.angle ?? angle
    return `linear-gradient(${angleDeg}deg, ${stops})`
  } else {
    return `radial-gradient(circle, ${stops})`
  }
}
