export interface BaseShape {
  id: string
  x: number
  y: number
  type: 'square' | 'triangle' | 'circle'
  width?: number
  height?: number
  radius?: number
  fill: string
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
  stroke: string
  curved: boolean  // whether to render as arc
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
