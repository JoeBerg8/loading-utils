export interface GradientStop {
  offset: number  // 0-1
  color: string
}

export interface GradientConfig {
  type: 'linear' | 'radial'
  angle?: number  // For linear gradients (degrees)
  stops: GradientStop[]
}

export type ColorValue = string | GradientConfig

export interface BaseShape {
  id: string
  x: number
  y: number
  type: 'square' | 'triangle' | 'circle'
  width?: number
  height?: number
  radius?: number
  fill: ColorValue
}

export interface ConnectionAnchor {
  // Normalized position (0-1) around shape perimeter at 0.1 increments
  // 0 = top, 0.25 = right, 0.5 = bottom, 0.75 = left
  // 10 snap points total (0, 0.1, 0.2, ... 0.9) for precise control
  position: number
}

export interface Connection {
  id: string
  fromShapeId: string
  toShapeId: string
  fromAnchor: ConnectionAnchor
  toAnchor: ConnectionAnchor
  stroke: ColorValue
  // null = straight line, { x, y } = offset from midpoint for curve control
  curveOffset: { x: number; y: number } | null
}

export interface AlignmentGuide {
  type: 'horizontal' | 'vertical'
  position: number  // x for vertical, y for horizontal
  start: number     // line start coordinate
  end: number       // line end coordinate
}

export interface SpacingGuide {
  type: 'horizontal' | 'vertical'
  position: { x: number; y: number }
  distance: number
}

export type ToolMode = 'pan' | 'square' | 'triangle' | 'circle' | 'line' | 'curved-line' | 'delete' | 'paint'

export interface AnimationConfig {
  enabled: boolean
  speed: number  // 0.25 to 6.0 multiplier
  animationMode: 'dot' | 'snake'
  dotSize: number
  dotColor: string
  snakeLength: number  // 0-1 representing percentage of total path length
  rotationSpeed: number  // Degrees per second (0 = disabled, positive = clockwise, negative = counter-clockwise)
}
