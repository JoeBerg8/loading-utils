import { ref, computed } from 'vue'
import type { BaseShape, Connection, ConnectionAnchor, ToolMode, AlignmentGuide, SpacingGuide } from '~/types/canvas'
import { useAlignmentGuides } from './useAlignmentGuides'

// Utility functions for connection anchors

/**
 * Snap a normalized position to the nearest 0.1 increment
 */
function snapToAnchor(position: number): number {
  return Math.round(position * 10) / 10
}

/**
 * Calculate the best anchor position for a shape based on direction to another shape
 * Returns normalized position (0-1) snapped to nearest 0.1 increment
 */
function calculateBestAnchor(
  fromShape: BaseShape,
  toShape: BaseShape,
  getShapeCenter: (shape: BaseShape) => { x: number; y: number }
): number {
  const fromCenter = getShapeCenter(fromShape)
  const toCenter = getShapeCenter(toShape)
  
  const dx = toCenter.x - fromCenter.x
  const dy = toCenter.y - fromCenter.y
  
  // Calculate angle in radians (0 = right, PI/2 = down, PI = left, 3PI/2 = up)
  let angle = Math.atan2(dy, dx)
  // Convert to 0-2PI range
  if (angle < 0) angle += Math.PI * 2
  
  // Convert angle to normalized position (0-1)
  // 0 = top (3PI/2), 0.25 = right (0), 0.5 = bottom (PI/2), 0.75 = left (PI)
  let position = (angle + Math.PI / 2) / (Math.PI * 2)
  if (position >= 1) position -= 1
  
  return snapToAnchor(position)
}

/**
 * Calculate actual pixel coordinates for an anchor position on a shape
 */
export function getAnchorPosition(shape: BaseShape, anchor: ConnectionAnchor): { x: number; y: number } {
  const position = anchor.position
  
  if (shape.type === 'circle') {
    const radius = shape.radius || 20
    // Convert normalized position (0-1) to angle (0 = top, clockwise)
    const angle = (position * Math.PI * 2) - Math.PI / 2
    return {
      x: shape.x + radius * Math.cos(angle),
      y: shape.y + radius * Math.sin(angle),
    }
  }
  
  if (shape.type === 'square') {
    const width = shape.width || 40
    const height = shape.height || 40
    const perimeter = (width + height) * 2
    
    // Calculate distance along perimeter
    let distance = position * perimeter
    
    // Determine which edge and position on that edge
    if (distance < width) {
      // Top edge (left to right)
      return { x: shape.x + distance, y: shape.y }
    } else if (distance < width + height) {
      // Right edge (top to bottom)
      return { x: shape.x + width, y: shape.y + (distance - width) }
    } else if (distance < width * 2 + height) {
      // Bottom edge (right to left)
      return { x: shape.x + width - (distance - width - height), y: shape.y + height }
    } else {
      // Left edge (bottom to top)
      return { x: shape.x, y: shape.y + height - (distance - width * 2 - height) }
    }
  }
  
  if (shape.type === 'triangle') {
    const width = shape.width || 40
    const height = shape.height || 40
    
    // Triangle vertices: bottom-left, top-center, bottom-right
    const bottomLeft = { x: shape.x, y: shape.y + height }
    const topCenter = { x: shape.x + width / 2, y: shape.y }
    const bottomRight = { x: shape.x + width, y: shape.y + height }
    
    // Calculate edge lengths
    const leftEdge = Math.sqrt((width / 2) ** 2 + height ** 2)
    const rightEdge = Math.sqrt((width / 2) ** 2 + height ** 2)
    const bottomEdge = width
    const perimeter = leftEdge + rightEdge + bottomEdge
    
    // Calculate distance along perimeter
    let distance = position * perimeter
    
    if (distance < leftEdge) {
      // Left edge (bottom-left to top-center)
      const t = distance / leftEdge
      return {
        x: bottomLeft.x + (topCenter.x - bottomLeft.x) * t,
        y: bottomLeft.y + (topCenter.y - bottomLeft.y) * t,
      }
    } else if (distance < leftEdge + bottomEdge) {
      // Bottom edge (bottom-left to bottom-right)
      const t = (distance - leftEdge) / bottomEdge
      return {
        x: bottomLeft.x + (bottomRight.x - bottomLeft.x) * t,
        y: bottomLeft.y + (bottomRight.y - bottomLeft.y) * t,
      }
    } else {
      // Right edge (bottom-right to top-center)
      const t = (distance - leftEdge - bottomEdge) / rightEdge
      return {
        x: bottomRight.x + (topCenter.x - bottomRight.x) * t,
        y: bottomRight.y + (topCenter.y - bottomRight.y) * t,
      }
    }
  }
  
  // Fallback to center
  const width = shape.width || 40
  const height = shape.height || 40
  return { x: shape.x + width / 2, y: shape.y + height / 2 }
}

/**
 * Find the nearest anchor position to a given point
 */
export function findNearestAnchor(
  shape: BaseShape,
  point: { x: number; y: number },
  getShapeCenter: (shape: BaseShape) => { x: number; y: number }
): ConnectionAnchor {
  // Try all 10 anchor positions and find the closest
  let minDistance = Infinity
  let bestAnchor: ConnectionAnchor = { position: 0 }
  
  for (let i = 0; i < 10; i++) {
    const position = i / 10
    const anchor: ConnectionAnchor = { position }
    const anchorPos = getAnchorPosition(shape, anchor)
    const dx = anchorPos.x - point.x
    const dy = anchorPos.y - point.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    if (distance < minDistance) {
      minDistance = distance
      bestAnchor = anchor
    }
  }
  
  return bestAnchor
}

export function useCanvasState() {
  const shapes = ref<BaseShape[]>([])
  const connections = ref<Connection[]>([])
  const currentTool = ref<ToolMode>('square')
  const selectedShapeId = ref<string | null>(null)
  const selectedConnectionId = ref<string | null>(null)
  const pendingLineStart = ref<{ shapeId: string; anchor: ConnectionAnchor } | null>(null)
  const selectedColor = ref<string>('#60a5fa')
  const activeGuides = ref<AlignmentGuide[]>([])
  const spacingGuides = ref<SpacingGuide[]>([])

  const { computeAlignmentGuides } = useAlignmentGuides()

  function addShape(type: 'square' | 'triangle' | 'circle', x: number, y: number) {
    const id = `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const shape: BaseShape = {
      id,
      x,
      y,
      type,
      width: type === 'square' ? 40 : undefined,
      height: type === 'square' ? 40 : undefined,
      radius: type === 'circle' ? 20 : undefined,
      fill: selectedColor.value,
    }
    shapes.value.push(shape)
    return id
  }

  function removeShape(id: string) {
    shapes.value = shapes.value.filter(s => s.id !== id)
    connections.value = connections.value.filter(
      c => c.fromShapeId !== id && c.toShapeId !== id
    )
    if (selectedShapeId.value === id) {
      selectedShapeId.value = null
    }
  }

  function updateShapePosition(id: string, x: number, y: number) {
    const shape = shapes.value.find(s => s.id === id)
    if (shape) {
      shape.x = x
      shape.y = y
    }
  }

  function computeGuidesForDrag(
    draggingShapeId: string,
    viewportBounds: { left: number; right: number; top: number; bottom: number },
    temporaryPosition?: { x: number; y: number }
  ) {
    const draggingShape = shapes.value.find(s => s.id === draggingShapeId)
    if (!draggingShape) {
      activeGuides.value = []
      spacingGuides.value = []
      return
    }

    // Use temporary position if provided (for drag preview), otherwise use current position
    const shapeForCalculation = temporaryPosition
      ? { ...draggingShape, x: temporaryPosition.x, y: temporaryPosition.y }
      : draggingShape

    const { alignmentGuides, spacingGuides: computedSpacingGuides } = computeAlignmentGuides(
      draggingShapeId,
      shapeForCalculation,
      shapes.value,
      viewportBounds
    )

    activeGuides.value = alignmentGuides
    spacingGuides.value = computedSpacingGuides
  }

  function clearGuides() {
    activeGuides.value = []
    spacingGuides.value = []
  }

  function updateShapeColor(id: string, color: string) {
    const shape = shapes.value.find(s => s.id === id)
    if (shape) {
      shape.fill = color
    }
  }

  // Helper to get shape center (used for anchor calculation)
  function getShapeCenter(shape: BaseShape): { x: number; y: number } {
    if (shape.type === 'circle') {
      return { x: shape.x, y: shape.y }
    }
    const width = shape.width || 40
    const height = shape.height || 40
    return { x: shape.x + width / 2, y: shape.y + height / 2 }
  }

  // Helper to calculate default curve offset
  function calculateDefaultCurveOffset(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return { x: 0, y: 0 }
    
    // Default: 30% of line length, perpendicular direction
    const offset = len * 0.3
    return {
      x: -dy / len * offset,
      y: dx / len * offset
    }
  }

  function addConnection(
    fromShapeId: string,
    toShapeId: string,
    fromAnchorOverride?: ConnectionAnchor,
    toAnchorOverride?: ConnectionAnchor
  ) {
    const fromShape = shapes.value.find(s => s.id === fromShapeId)
    const toShape = shapes.value.find(s => s.id === toShapeId)
    
    if (!fromShape || !toShape) return

    // Use provided anchors or calculate best anchor positions based on direction between shapes
    const fromAnchor: ConnectionAnchor = fromAnchorOverride || { position: calculateBestAnchor(fromShape, toShape, getShapeCenter) }
    const toAnchor: ConnectionAnchor = toAnchorOverride || { position: calculateBestAnchor(toShape, fromShape, getShapeCenter) }

    // Calculate curve offset if using curved line tool
    let curveOffset: { x: number; y: number } | null = null
    if (currentTool.value === 'curved-line') {
      // Get anchor positions for default curve calculation
      const fromPos = getAnchorPosition(fromShape, fromAnchor)
      const toPos = getAnchorPosition(toShape, toAnchor)
      curveOffset = calculateDefaultCurveOffset(fromPos, toPos)
    }

    const id = `connection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    connections.value.push({ 
      id, 
      fromShapeId, 
      toShapeId,
      fromAnchor,
      toAnchor,
      stroke: selectedColor.value,
      curveOffset
    })
  }

  function removeConnection(id: string) {
    connections.value = connections.value.filter(c => c.id !== id)
    if (selectedConnectionId.value === id) {
      selectedConnectionId.value = null
    }
  }

  function updateConnectionColor(id: string, color: string) {
    const connection = connections.value.find(c => c.id === id)
    if (connection) {
      connection.stroke = color
    }
  }

  function updateConnectionCurveOffset(id: string, offset: { x: number; y: number } | null) {
    const connection = connections.value.find(c => c.id === id)
    if (connection) {
      connection.curveOffset = offset
    }
  }

  function updateConnectionAnchor(
    connectionId: string,
    anchorType: 'from' | 'to',
    anchor: ConnectionAnchor
  ) {
    const connection = connections.value.find(c => c.id === connectionId)
    if (connection) {
      if (anchorType === 'from') {
        connection.fromAnchor = anchor
      } else {
        connection.toAnchor = anchor
      }
    }
  }


  function selectConnection(id: string | null) {
    selectedConnectionId.value = id
    // Clear shape selection when selecting a connection
    if (id !== null) {
      selectedShapeId.value = null
    }
  }

  function handleConnectionClick(connectionId: string) {
    if (currentTool.value === 'delete') {
      removeConnection(connectionId)
    } else if (currentTool.value === 'paint') {
      updateConnectionColor(connectionId, selectedColor.value)
      selectedConnectionId.value = connectionId
    } else {
      // Select connection in any other mode (pan, square, triangle, circle, line, curved-line)
      selectConnection(connectionId)
    }
  }

  function setTool(tool: ToolMode) {
    currentTool.value = tool
    selectedShapeId.value = null
    selectedConnectionId.value = null
    pendingLineStart.value = null
  }

  function selectShape(id: string | null) {
    selectedShapeId.value = id
    // Clear connection selection when selecting a shape
    if (id !== null) {
      selectedConnectionId.value = null
    }
  }

  function handleAnchorClick(shapeId: string, anchor: ConnectionAnchor) {
    if (currentTool.value !== 'line' && currentTool.value !== 'curved-line') {
      return
    }

    if (pendingLineStart.value === null) {
      // Start a new line from this anchor
      pendingLineStart.value = { shapeId, anchor }
      selectedShapeId.value = shapeId
    } else if (pendingLineStart.value.shapeId !== shapeId) {
      // Complete the line to this anchor
      addConnection(pendingLineStart.value.shapeId, shapeId, pendingLineStart.value.anchor, anchor)
      // Continue the line from this new anchor (for chaining)
      pendingLineStart.value = { shapeId, anchor }
      selectedShapeId.value = shapeId
    } else {
      // Same shape clicked - just update the anchor
      pendingLineStart.value = { shapeId, anchor }
      selectedShapeId.value = shapeId
    }
  }

  function handleShapeClick(shapeId: string) {
    if (currentTool.value === 'delete') {
      removeShape(shapeId)
    } else if (currentTool.value === 'paint') {
      updateShapeColor(shapeId, selectedColor.value)
      selectedShapeId.value = shapeId
    } else if (currentTool.value === 'line' || currentTool.value === 'curved-line') {
      // Fallback: if clicking shape (not anchor), use auto-calculated anchor
      const shape = shapes.value.find(s => s.id === shapeId)
      if (!shape) return

      if (pendingLineStart.value === null) {
        // Calculate best anchor based on direction (will be refined when second shape is clicked)
        const anchor: ConnectionAnchor = { position: 0 } // Default to top, will be recalculated
        pendingLineStart.value = { shapeId, anchor }
        selectedShapeId.value = shapeId
      } else if (pendingLineStart.value.shapeId !== shapeId) {
        // Complete the line - recalculate anchors based on actual direction
        const fromShape = shapes.value.find(s => s.id === pendingLineStart.value!.shapeId)
        const toShape = shapes.value.find(s => s.id === shapeId)
        if (fromShape && toShape) {
          const fromAnchor: ConnectionAnchor = { position: calculateBestAnchor(fromShape, toShape, getShapeCenter) }
          const toAnchor: ConnectionAnchor = { position: calculateBestAnchor(toShape, fromShape, getShapeCenter) }
          addConnection(pendingLineStart.value.shapeId, shapeId, fromAnchor, toAnchor)
          // Continue from this shape
          pendingLineStart.value = { shapeId, anchor: toAnchor }
          selectedShapeId.value = shapeId
        }
      }
    } else {
      // Select shape in any other mode (pan, square, triangle, circle)
      selectShape(shapeId)
    }
  }

  function handleCanvasClick(x: number, y: number) {
    if (currentTool.value === 'square' || currentTool.value === 'triangle' || currentTool.value === 'circle') {
      addShape(currentTool.value, x, y)
      // Stay in shape mode so user can place multiple shapes
    } else if (currentTool.value === 'line' || currentTool.value === 'curved-line') {
      // Cancel line drawing if clicking on empty canvas
      pendingLineStart.value = null
      selectedShapeId.value = null
      selectedConnectionId.value = null
    } else {
      // Deselect when clicking empty canvas in any other mode
      selectedShapeId.value = null
      selectedConnectionId.value = null
    }
  }

  return {
    shapes,
    connections,
    currentTool,
    selectedShapeId,
    selectedConnectionId,
    pendingLineStart,
    selectedColor,
    activeGuides,
    spacingGuides,
    addShape,
    removeShape,
    updateShapePosition,
    updateShapeColor,
    addConnection,
    removeConnection,
    updateConnectionColor,
    updateConnectionAnchor,
    updateConnectionCurveOffset,
    setTool,
    selectShape,
    selectConnection,
    handleShapeClick,
    handleAnchorClick,
    handleConnectionClick,
    handleCanvasClick,
    computeGuidesForDrag,
    clearGuides,
  }
}
