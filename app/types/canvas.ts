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

export interface Connection {
  id: string
  fromShapeId: string
  toShapeId: string
  stroke: string
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

export type ToolMode = 'pan' | 'select' | 'square' | 'triangle' | 'circle' | 'line' | 'delete' | 'paint'
