<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import type { BaseShape, AnimationConfig, ColorValue } from '~/types/canvas'
import type { Context } from 'konva/lib/Context'
import { getAnchorPosition, findNearestAnchor } from '~/composables/useCanvasState'
import type { ConnectionAnchor } from '~/types/canvas'
import { usePathAnimation } from '~/composables/usePathAnimation'
import { getKonvaFillProps, getKonvaStrokeProps } from '~/composables/useKonvaGradients'

const canvasState = inject<ReturnType<typeof import('~/composables/useCanvasState').useCanvasState>>('canvasState')
const animationConfig = inject<() => AnimationConfig>('animationConfig')

if (!canvasState) {
  throw new Error('CanvasEditor: canvasState not provided')
}

if (!animationConfig) {
  throw new Error('CanvasEditor: animationConfig not provided')
}

const {
  shapes,
  connections,
  currentTool,
  selectedShapeId,
  selectedConnectionId,
  pendingLineStart,
  activeGuides,
  spacingGuides,
  updateShapePosition,
  updateShapeSize,
  scaleAllShapes,
  handleShapeClick,
  handleAnchorClick,
  handleConnectionClick,
  handleCanvasClick,
  computeGuidesForDrag,
  clearGuides,
  removeShape,
  removeConnection,
  updateConnectionAnchor,
  updateConnectionCurveOffset,
} = canvasState

// Set up path animation
const { isPlaying: isAnimating, animationDots, snakeSegment } = usePathAnimation(
  () => connections.value,
  () => shapes.value,
  animationConfig
)

// Computed for animation rendering config
const animDotSize = computed(() => animationConfig().dotSize)
const animDotColor = computed(() => animationConfig().dotColor)
const animationMode = computed(() => animationConfig().animationMode)
const isSnakeMode = computed(() => animationMode.value === 'snake' && isAnimating.value)

// Computed for snake segment to ensure reactivity
const snakePoints = computed(() => {
  const points = snakeSegment.value?.points
  return points ? [...points] : []
})
const snakeStroke = computed(() => snakeSegment.value?.stroke ?? '#d946ef')
const snakeStrokeStart = computed(() => {
  if (!snakeSegment.value || !snakePoints.value.length) return { x: 0, y: 0 }
  return { x: snakePoints.value[0], y: snakePoints.value[1] }
})
const snakeStrokeEnd = computed(() => {
  if (!snakeSegment.value || !snakePoints.value.length) return { x: 0, y: 0 }
  const len = snakePoints.value.length
  return { x: snakePoints.value[len - 2], y: snakePoints.value[len - 1] }
})
const hasSnakeSegment = computed(() => isSnakeMode.value && snakePoints.value.length >= 4)

const stageWidth = ref(0)
const stageHeight = ref(0)
const stageRef = ref()

// Grid configuration
const gridSpacing = 20
const gridDotRadius = 1
const gridBuffer = 100 // Extra dots beyond visible area for smooth panning
const gridColor = '#374151'

// Stage position tracking (for coordinate conversions)
const stagePosition = ref({ x: 0, y: 0 })

// Track if currently dragging the stage (for cursor state)
const isDraggingStage = ref(false)

// Track hovered shape for connection point indicators
const hoveredShapeId = ref<string | null>(null)
const mousePosition = ref<{ x: number; y: number } | null>(null)

// Track endpoint dragging state
const draggingEndpoint = ref<'from' | 'to' | null>(null)
const draggingEndpointPosition = ref<{ x: number; y: number } | null>(null)
const nearestShapeForEndpoint = ref<string | null>(null)

// Track curve control dragging state
const draggingCurveControl = ref(false)
const draggingCurveControlPosition = ref<{ x: number; y: number } | null>(null)

// Track resize handle dragging state
const draggingResizeHandle = ref(false)
const hoveringResizeHandle = ref(false)
const resizeStartPosition = ref<{ x: number; y: number } | null>(null)
const resizeStartSize = ref<{ width: number; height: number; radius?: number } | null>(null)
const resizeStartCenter = ref<{ x: number; y: number } | null>(null)

// Rotation state
const constellationRotation = ref(0)  // Current rotation angle in degrees
let rotationFrameId: number | null = null
let lastRotationTime: number | null = null

// Custom grid drawing function - draws all dots in a single canvas pass
// This is orders of magnitude faster than creating thousands of VCircle components
function drawGrid(context: Context) {
  const ctx = context._context
  const pos = stagePosition.value
  
  // Calculate visible area in world coordinates
  const visibleLeft = -pos.x - gridBuffer
  const visibleTop = -pos.y - gridBuffer
  const visibleRight = -pos.x + stageWidth.value + gridBuffer
  const visibleBottom = -pos.y + stageHeight.value + gridBuffer
  
  // Snap to grid alignment
  const startX = Math.floor(visibleLeft / gridSpacing) * gridSpacing
  const startY = Math.floor(visibleTop / gridSpacing) * gridSpacing
  
  // Draw all dots in one pass using native canvas API
  ctx.fillStyle = gridColor
  ctx.beginPath()
  
  for (let x = startX; x < visibleRight; x += gridSpacing) {
    for (let y = startY; y < visibleBottom; y += gridSpacing) {
      ctx.moveTo(x + gridDotRadius, y)
      ctx.arc(x, y, gridDotRadius, 0, Math.PI * 2)
    }
  }
  
  ctx.fill()
}

// Get shape center (used for fallback/default calculations)
function getShapeCenter(shape: BaseShape) {
  if (shape.type === 'circle') {
    return { x: shape.x, y: shape.y }
  }
  const width = shape.width || 40
  const height = shape.height || 40
  return { x: shape.x + width / 2, y: shape.y + height / 2 }
}

// Get all shapes that are part of the connected constellation via lines
function getConnectedShapes(): BaseShape[] {
  if (connections.value.length === 0) return [...shapes.value]
  
  // Build set of shape IDs that appear in at least one connection
  const connectedIds = new Set<string>()
  for (const conn of connections.value) {
    connectedIds.add(conn.fromShapeId)
    connectedIds.add(conn.toShapeId)
  }
  
  // Return only shapes that appear in at least one connection
  return shapes.value.filter(s => connectedIds.has(s.id))
}

// Calculate the center point of the true visual bounding box of all shapes
// This accounts for shape sizes (radius, width, height) to get accurate rotation center
function calculateBoundingBoxCenter(shapesList: BaseShape[]): { x: number; y: number } {
  if (shapesList.length === 0) return { x: 0, y: 0 }
  
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const shape of shapesList) {
    if (shape.type === 'circle') {
      const radius = shape.radius ?? 20
      minX = Math.min(minX, shape.x - radius)
      maxX = Math.max(maxX, shape.x + radius)
      minY = Math.min(minY, shape.y - radius)
      maxY = Math.max(maxY, shape.y + radius)
    } else {
      // Square and triangle - positioned by top-left corner
      const width = shape.width ?? 40
      const height = shape.height ?? 40
      minX = Math.min(minX, shape.x)
      maxX = Math.max(maxX, shape.x + width)
      minY = Math.min(minY, shape.y)
      maxY = Math.max(maxY, shape.y + height)
    }
  }

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  }
}

// Computed constellation center - only uses shapes connected via lines
const constellationCenter = computed(() => {
  const connectedShapes = getConnectedShapes()
  return calculateBoundingBoxCenter(connectedShapes)
})

// Rotation animation loop
function animateRotation(timestamp: number) {
  const config = animationConfig()
  const speed = config.rotationSpeed
  if (speed !== 0 && config.enabled) {
    if (lastRotationTime === null) {
      lastRotationTime = timestamp
    } else {
      const deltaTime = timestamp - lastRotationTime
      // Convert speed (degrees per second) to degrees per frame
      // deltaTime is in milliseconds, so divide by 1000 to get seconds
      constellationRotation.value += (speed * deltaTime) / 1000
      lastRotationTime = timestamp
    }
  } else {
    lastRotationTime = null
  }
  rotationFrameId = requestAnimationFrame(animateRotation)
}

function startRotationAnimation() {
  if (rotationFrameId === null) {
    lastRotationTime = null
    rotationFrameId = requestAnimationFrame(animateRotation)
  }
}

function stopRotationAnimation() {
  if (rotationFrameId !== null) {
    cancelAnimationFrame(rotationFrameId)
    rotationFrameId = null
    lastRotationTime = null
  }
}

// Helper to get stroke color for selected shapes (darker version of fill)
function getStrokeColor(fillColor: ColorValue, isSelected: boolean): string {
  // Extract base color from gradient if needed
  let baseColor: string
  if (typeof fillColor === 'string') {
    baseColor = fillColor
  } else {
    // Use first stop color for gradients
    baseColor = fillColor.stops[0]?.color || '#a855f7'
  }

  if (!isSelected) {
    // For unselected shapes, use a darker shade of the fill color
    // Convert hex to RGB, darken, and convert back
    const hex = baseColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const darkerR = Math.max(0, r - 40).toString(16).padStart(2, '0')
    const darkerG = Math.max(0, g - 40).toString(16).padStart(2, '0')
    const darkerB = Math.max(0, b - 40).toString(16).padStart(2, '0')
    return `#${darkerR}${darkerG}${darkerB}`
  }
  // For selected shapes, use a much darker shade
  const hex = baseColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const darkerR = Math.max(0, r - 80).toString(16).padStart(2, '0')
  const darkerG = Math.max(0, g - 80).toString(16).padStart(2, '0')
  const darkerB = Math.max(0, b - 80).toString(16).padStart(2, '0')
  return `#${darkerR}${darkerG}${darkerB}`
}

// Compute connection point indicators for shapes when line tool is active or dragging endpoint
const connectionPointIndicators = computed(() => {
  const showIndicators = 
    currentTool.value === 'line' || 
    currentTool.value === 'curved-line' ||
    draggingEndpoint.value !== null

  if (!showIndicators) {
    return []
  }

  const indicators: Array<{ shapeId: string; position: number; x: number; y: number; isHighlighted: boolean; isSelected: boolean }> = []
  
  // Show indicators for hovered shape, pending line start shape, or shape near dragging endpoint
  const shapesToShow = shapes.value.filter(s => {
    if (draggingEndpoint.value !== null) {
      return s.id === nearestShapeForEndpoint.value
    }
    return s.id === hoveredShapeId.value || (pendingLineStart.value && s.id === pendingLineStart.value.shapeId)
  })

  for (const shape of shapesToShow) {
    // Show all 10 anchor points
    for (let i = 0; i < 10; i++) {
      const position = i / 10
      const anchor = { position }
      const anchorPos = getAnchorPosition(shape, anchor)
      
      // Highlight nearest anchor when dragging endpoint
      let isHighlighted = false
      if (draggingEndpoint.value !== null && draggingEndpointPosition.value) {
        const dx = anchorPos.x - draggingEndpointPosition.value.x
        const dy = anchorPos.y - draggingEndpointPosition.value.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        // Highlight if within 20px
        isHighlighted = distance < 20
      }
      
      // Check if this is the selected anchor for pending line start
      const isSelected = pendingLineStart.value !== null && 
        pendingLineStart.value.shapeId === shape.id &&
        Math.abs(pendingLineStart.value.anchor.position - position) < 0.05
      
      // Also highlight anchor when mouse is near it (for better UX)
      if (!isHighlighted && mousePosition.value && (currentTool.value === 'line' || currentTool.value === 'curved-line')) {
        const dx = anchorPos.x - mousePosition.value.x
        const dy = anchorPos.y - mousePosition.value.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        // Highlight if within 15px
        if (distance < 15) {
          isHighlighted = true
        }
      }
      
      indicators.push({
        shapeId: shape.id,
        position,
        x: anchorPos.x,
        y: anchorPos.y,
        isHighlighted,
        isSelected,
      })
    }
  }

  return indicators
})

// Compute endpoint handles for selected connection
const endpointHandles = computed(() => {
  if (!selectedConnectionId.value) return []
  
  const connection = connections.value.find(c => c.id === selectedConnectionId.value)
  if (!connection) return []
  
  const fromShape = shapes.value.find(s => s.id === connection.fromShapeId)
  const toShape = shapes.value.find(s => s.id === connection.toShapeId)
  if (!fromShape || !toShape) return []
  
  // Use dragging position if currently dragging this endpoint
  let from = connection.fromAnchor 
    ? getAnchorPosition(fromShape, connection.fromAnchor)
    : getShapeCenter(fromShape)
  let to = connection.toAnchor
    ? getAnchorPosition(toShape, connection.toAnchor)
    : getShapeCenter(toShape)
  
  // Override with drag position if dragging
  if (draggingEndpoint.value === 'from' && draggingEndpointPosition.value) {
    from = draggingEndpointPosition.value
  }
  if (draggingEndpoint.value === 'to' && draggingEndpointPosition.value) {
    to = draggingEndpointPosition.value
  }
  
  return [
    { type: 'from' as const, x: from.x, y: from.y },
    { type: 'to' as const, x: to.x, y: to.y },
  ]
})

// Compute curve control handle for selected curved connection
const curveControlHandle = computed(() => {
  if (!selectedConnectionId.value) return null
  
  const connection = connections.value.find(c => c.id === selectedConnectionId.value)
  if (!connection || connection.curveOffset === null) return null
  
  const fromShape = shapes.value.find(s => s.id === connection.fromShapeId)
  const toShape = shapes.value.find(s => s.id === connection.toShapeId)
  if (!fromShape || !toShape) return null
  
  const from = connection.fromAnchor 
    ? getAnchorPosition(fromShape, connection.fromAnchor)
    : getShapeCenter(fromShape)
  const to = connection.toAnchor
    ? getAnchorPosition(toShape, connection.toAnchor)
    : getShapeCenter(toShape)
  
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  
  return {
    x: midX + connection.curveOffset.x,
    y: midY + connection.curveOffset.y,
  }
})

// Compute resize handle for selected shape (bottom-right corner)
const resizeHandle = computed(() => {
  if (!selectedShapeId.value) return null
  
  const shape = shapes.value.find(s => s.id === selectedShapeId.value)
  if (!shape) return null
  
  if (shape.type === 'circle') {
    const radius = shape.radius ?? 20
    // Bottom-right corner of bounding box
    return {
      x: shape.x + radius,
      y: shape.y + radius,
    }
  } else {
    const width = shape.width ?? 40
    const height = shape.height ?? 40
    // Bottom-right corner
    return {
      x: shape.x + width,
      y: shape.y + height,
    }
  }
})

// Compute line positions for connections using anchor points
const linePositions = computed(() => {
  return connections.value.map(conn => {
    const fromShape = shapes.value.find(s => s.id === conn.fromShapeId)
    const toShape = shapes.value.find(s => s.id === conn.toShapeId)
    if (!fromShape || !toShape) return null

    // Use anchor positions if available, otherwise fall back to centers
    const from = conn.fromAnchor 
      ? getAnchorPosition(fromShape, conn.fromAnchor)
      : getShapeCenter(fromShape)
    const to = conn.toAnchor
      ? getAnchorPosition(toShape, conn.toAnchor)
      : getShapeCenter(toShape)
    
    if (conn.curveOffset !== null) {
      // Use stored curve offset for control point
      const midX = (from.x + to.x) / 2
      const midY = (from.y + to.y) / 2
      const controlX = midX + conn.curveOffset.x
      const controlY = midY + conn.curveOffset.y
      // Use SVG quadratic bezier path for accurate curve rendering
      // M = move to start, Q = quadratic bezier (control point, end point)
      const pathData = `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`
      return {
        id: conn.id,
        points: [from.x, from.y, controlX, controlY, to.x, to.y],
        pathData,
        stroke: conn.stroke,
        curved: true,
      }
    }
    
    return {
      id: conn.id,
      points: [from.x, from.y, to.x, to.y],
      pathData: null,
      stroke: conn.stroke,
      curved: false,
    }
  }).filter(Boolean) as Array<{ id: string; points: number[]; pathData: string | null; stroke: string; curved: boolean }>
})

function updateStageSize() {
  if (typeof window !== 'undefined') {
    stageWidth.value = window.innerWidth
    stageHeight.value = window.innerHeight
  }
}

function handleStageClick(e: any) {
  const stage = e.target.getStage()
  const pointerPos = stage.getPointerPosition()
  
  if (currentTool.value === 'pan') {
    return // Pan is handled by drag
  }

  // Check if clicking on empty space (not a shape)
  const clickedOnEmpty = e.target === stage || e.target.getLayer()?.name() === 'gridLayer'
  
  if (clickedOnEmpty && pointerPos) {
    // Convert screen position to world position (accounting for pan)
    const worldX = pointerPos.x - stage.x()
    const worldY = pointerPos.y - stage.y()
    handleCanvasClick(worldX, worldY)
  }
}

function handleStageMouseMove(e: any) {
  const stage = e.target.getStage()
  const pointerPos = stage.getPointerPosition()
  
  if (!pointerPos) return
  
  // Convert screen position to world position
  const worldX = pointerPos.x - stage.x()
  const worldY = pointerPos.y - stage.y()
  mousePosition.value = { x: worldX, y: worldY }
  
  // Update dragging endpoint position
  if (draggingEndpoint.value !== null) {
    draggingEndpointPosition.value = { x: worldX, y: worldY }
    
    // Find nearest shape for snapping
    let nearestShape: BaseShape | null = null
    let minDistance = Infinity
    
    for (const shape of shapes.value) {
      const center = getShapeCenter(shape)
      const dx = center.x - worldX
      const dy = center.y - worldY
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      // Check if within reasonable snapping distance (100px)
      if (distance < 100 && distance < minDistance) {
        minDistance = distance
        nearestShape = shape
      }
    }
    
    nearestShapeForEndpoint.value = nearestShape?.id || null
  }
  
  if (currentTool.value === 'line' || currentTool.value === 'curved-line') {
    // Find shape under cursor using Konva's shape detection
    const shapeNode = stage.getIntersection(pointerPos)
    if (shapeNode) {
      // Find the parent group (shape container)
      let node = shapeNode
      while (node && node.getType() !== 'Group') {
        node = node.getParent()
      }
      if (node && shapes.value.some(s => s.id === node.id())) {
        hoveredShapeId.value = node.id()
        return
      }
    }
  }
  
  if (draggingEndpoint.value === null) {
    hoveredShapeId.value = null
  }
}

function handleStageMouseLeave() {
  if (draggingEndpoint.value === null) {
    hoveredShapeId.value = null
  }
  // Keep mousePosition during endpoint drag
  if (!draggingEndpoint.value) {
    mousePosition.value = null
  }
}

function handleEndpointDragStart(e: any, endpointType: 'from' | 'to') {
  e.cancelBubble = true
  draggingEndpoint.value = endpointType
  const stage = e.target.getStage()
  const pointerPos = stage.getPointerPosition()
  if (pointerPos) {
    const worldX = pointerPos.x - stage.x()
    const worldY = pointerPos.y - stage.y()
    draggingEndpointPosition.value = { x: worldX, y: worldY }
  }
}

function handleEndpointDragMove(e: any) {
  const stage = e.target.getStage()
  const pointerPos = stage.getPointerPosition()
  if (pointerPos && draggingEndpoint.value && selectedConnectionId.value) {
    const worldX = pointerPos.x - stage.x()
    const worldY = pointerPos.y - stage.y()
    draggingEndpointPosition.value = { x: worldX, y: worldY }
    
    // Find nearest shape for snapping
    let nearestShape: BaseShape | null = null
    let minDistance = Infinity
    
    for (const shape of shapes.value) {
      const center = getShapeCenter(shape)
      const dx = center.x - worldX
      const dy = center.y - worldY
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance < 100 && distance < minDistance) {
        minDistance = distance
        nearestShape = shape
      }
    }
    
    nearestShapeForEndpoint.value = nearestShape?.id || null
    
    // Update anchor in real-time if near a shape (for smooth preview)
    // This updates the line position during drag to show snapping
    if (nearestShape) {
      const anchor = findNearestAnchor(nearestShape, { x: worldX, y: worldY }, getShapeCenter)
      updateConnectionAnchor(selectedConnectionId.value, draggingEndpoint.value, anchor)
    }
  }
}

function handleEndpointDragEnd(e: any) {
  if (!draggingEndpoint.value || !selectedConnectionId.value) {
    draggingEndpoint.value = null
    draggingEndpointPosition.value = null
    nearestShapeForEndpoint.value = null
    return
  }
  
  const stage = e.target.getStage()
  const pointerPos = stage.getPointerPosition()
  
  if (pointerPos) {
    const worldX = pointerPos.x - stage.x()
    const worldY = pointerPos.y - stage.y()
    
    // Final snap to nearest shape if not already snapped
    if (!nearestShapeForEndpoint.value) {
      let nearestShape: BaseShape | null = null
      let minDistance = Infinity
      
      for (const shape of shapes.value) {
        const center = getShapeCenter(shape)
        const dx = center.x - worldX
        const dy = center.y - worldY
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < minDistance) {
          minDistance = distance
          nearestShape = shape
        }
      }
      
      if (nearestShape && minDistance < 150) {
        // Snap to nearest anchor if within reasonable distance
        const anchor = findNearestAnchor(nearestShape, { x: worldX, y: worldY }, getShapeCenter)
        updateConnectionAnchor(selectedConnectionId.value, draggingEndpoint.value, anchor)
      }
    }
    // If already snapped, the anchor was updated during drag
  }
  
  draggingEndpoint.value = null
  draggingEndpointPosition.value = null
  nearestShapeForEndpoint.value = null
}

function handleEndpointClick(e: any) {
  e.cancelBubble = true
  // Prevent line click when clicking endpoint handle
}

function handleCurveControlDragStart(e: any) {
  e.cancelBubble = true
  draggingCurveControl.value = true
  const stage = e.target.getStage()
  const pointerPos = stage.getPointerPosition()
  if (pointerPos) {
    const worldX = pointerPos.x - stage.x()
    const worldY = pointerPos.y - stage.y()
    draggingCurveControlPosition.value = { x: worldX, y: worldY }
  }
}

function handleCurveControlDrag(e: any) {
  if (!selectedConnectionId.value || !draggingCurveControl.value) return
  
  const stage = e.target.getStage()
  const pointerPos = stage.getPointerPosition()
  if (!pointerPos) return
  
  const worldX = pointerPos.x - stage.x()
  const worldY = pointerPos.y - stage.y()
  draggingCurveControlPosition.value = { x: worldX, y: worldY }
  
  const connection = connections.value.find(c => c.id === selectedConnectionId.value)
  if (!connection || connection.curveOffset === null) return
  
  const fromShape = shapes.value.find(s => s.id === connection.fromShapeId)
  const toShape = shapes.value.find(s => s.id === connection.toShapeId)
  if (!fromShape || !toShape) return
  
  const from = connection.fromAnchor 
    ? getAnchorPosition(fromShape, connection.fromAnchor)
    : getShapeCenter(fromShape)
  const to = connection.toAnchor
    ? getAnchorPosition(toShape, connection.toAnchor)
    : getShapeCenter(toShape)
  
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  
  // Calculate offset from midpoint
  const offset = {
    x: worldX - midX,
    y: worldY - midY
  }
  
  // Update in real-time
  updateConnectionCurveOffset(selectedConnectionId.value, offset)
}

function handleCurveControlDragEnd(e: any) {
  if (!selectedConnectionId.value || !draggingCurveControl.value) {
    draggingCurveControl.value = false
    draggingCurveControlPosition.value = null
    return
  }
  
  const stage = e.target.getStage()
  const pointerPos = stage.getPointerPosition()
  if (pointerPos) {
    const worldX = pointerPos.x - stage.x()
    const worldY = pointerPos.y - stage.y()
    
    const connection = connections.value.find(c => c.id === selectedConnectionId.value)
    if (connection && connection.curveOffset !== null) {
      const fromShape = shapes.value.find(s => s.id === connection.fromShapeId)
      const toShape = shapes.value.find(s => s.id === connection.toShapeId)
      if (fromShape && toShape) {
        const from = connection.fromAnchor 
          ? getAnchorPosition(fromShape, connection.fromAnchor)
          : getShapeCenter(fromShape)
        const to = connection.toAnchor
          ? getAnchorPosition(toShape, connection.toAnchor)
          : getShapeCenter(toShape)
        
        const midX = (from.x + to.x) / 2
        const midY = (from.y + to.y) / 2
        
        // Calculate final offset from midpoint
        const offset = {
          x: worldX - midX,
          y: worldY - midY
        }
        
        updateConnectionCurveOffset(selectedConnectionId.value, offset)
      }
    }
  }
  
  draggingCurveControl.value = false
  draggingCurveControlPosition.value = null
}

function handleCurveControlClick(e: any) {
  e.cancelBubble = true
  // Prevent line click when clicking curve control handle
}

function handleResizeHandleDragStart(e: any) {
  e.cancelBubble = true
  if (!selectedShapeId.value) return
  
  const shape = shapes.value.find(s => s.id === selectedShapeId.value)
  if (!shape) return
  
  draggingResizeHandle.value = true
  
  const stage = e.target.getStage()
  const pointerPos = stage.getPointerPosition()
  if (pointerPos) {
    const worldX = pointerPos.x - stage.x()
    const worldY = pointerPos.y - stage.y()
    resizeStartPosition.value = { x: worldX, y: worldY }
    
    // Store initial size and center
    if (shape.type === 'circle') {
      const radius = shape.radius ?? 20
      resizeStartSize.value = { radius }
      resizeStartCenter.value = { x: shape.x, y: shape.y }
    } else {
      const width = shape.width ?? 40
      const height = shape.height ?? 40
      resizeStartSize.value = { width, height }
      resizeStartCenter.value = { x: shape.x + width / 2, y: shape.y + height / 2 }
    }
  }
}

function handleResizeHandleDragMove(e: any) {
  if (!draggingResizeHandle.value || !selectedShapeId.value || !resizeStartPosition.value || !resizeStartSize.value || !resizeStartCenter.value) return
  
  const stage = e.target.getStage()
  const pointerPos = stage.getPointerPosition()
  if (!pointerPos) return
  
  const worldX = pointerPos.x - stage.x()
  const worldY = pointerPos.y - stage.y()
  
  const shape = shapes.value.find(s => s.id === selectedShapeId.value)
  if (!shape) return
  
  // Calculate distance from center to current position and initial position
  const dx = worldX - resizeStartCenter.value.x
  const dy = worldY - resizeStartCenter.value.y
  const currentDistance = Math.sqrt(dx * dx + dy * dy)
  
  const startDx = resizeStartPosition.value.x - resizeStartCenter.value.x
  const startDy = resizeStartPosition.value.y - resizeStartCenter.value.y
  const startDistance = Math.sqrt(startDx * startDx + startDy * startDy)
  
  // Calculate scale factor (preserving aspect ratio)
  const scale = startDistance > 0 ? currentDistance / startDistance : 1
  
  // Apply scale to shape
  if (shape.type === 'circle') {
    const newRadius = Math.max(10, (resizeStartSize.value.radius ?? 20) * scale)
    shape.radius = newRadius
  } else {
    const newWidth = Math.max(20, (resizeStartSize.value.width ?? 40) * scale)
    const newHeight = Math.max(20, (resizeStartSize.value.height ?? 40) * scale)
    shape.width = newWidth
    shape.height = newHeight
    
    // Adjust position to keep center fixed
    const centerX = resizeStartCenter.value.x
    const centerY = resizeStartCenter.value.y
    shape.x = centerX - newWidth / 2
    shape.y = centerY - newHeight / 2
  }
}

function handleResizeHandleDragEnd(e: any) {
  draggingResizeHandle.value = false
  hoveringResizeHandle.value = false
  resizeStartPosition.value = null
  resizeStartSize.value = null
  resizeStartCenter.value = null
}

function handleResizeHandleClick(e: any) {
  e.cancelBubble = true
  // Prevent shape click when clicking resize handle
}

function handleResizeHandleMouseEnter() {
  hoveringResizeHandle.value = true
}

function handleResizeHandleMouseLeave() {
  hoveringResizeHandle.value = false
}

function handleAnchorIndicatorClick(e: any, shapeId: string, position: number) {
  e.cancelBubble = true
  if (currentTool.value === 'line' || currentTool.value === 'curved-line') {
    handleAnchorClick(shapeId, { position })
  }
}

function handleShapeClickWithAnchorDetection(shapeId: string, clickX: number, clickY: number) {
  // If in line/curved-line mode, check if click is near an anchor point
  if (currentTool.value === 'line' || currentTool.value === 'curved-line') {
    const shape = shapes.value.find(s => s.id === shapeId)
    if (shape) {
      // Check if click is near any anchor point
      for (let i = 0; i < 10; i++) {
        const position = i / 10
        const anchor = { position }
        const anchorPos = getAnchorPosition(shape, anchor)
        const dx = anchorPos.x - clickX
        const dy = anchorPos.y - clickY
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        // If within 20px of an anchor, use anchor click handler
        if (distance < 20) {
          handleAnchorClick(shapeId, anchor)
          return
        }
      }
    }
  }
  
  // Otherwise, use regular shape click handler
  handleShapeClick(shapeId)
}

function handleShapeMouseEnter(e: any) {
  if (currentTool.value === 'line' || currentTool.value === 'curved-line') {
    const shapeId = e.target.getParent().id()
    hoveredShapeId.value = shapeId
  }
}

function handleShapeMouseLeave() {
  // Only clear if not hovering over another shape
  // The stage mousemove will handle updating
}

function handleShapeDragMove(e: any) {
  const node = e.target
  const shapeId = node.id()
  
  // Update shape position in real-time so lines follow
  updateShapePosition(shapeId, node.x(), node.y())
  
  // Calculate viewport bounds in world coordinates
  const viewportBounds = {
    left: -stagePosition.value.x,
    right: -stagePosition.value.x + stageWidth.value,
    top: -stagePosition.value.y,
    bottom: -stagePosition.value.y + stageHeight.value,
  }

  // Compute guides with temporary position
  computeGuidesForDrag(shapeId, viewportBounds, { x: node.x(), y: node.y() })
}

function handleShapeDragEnd(e: any) {
  const node = e.target
  updateShapePosition(node.id(), node.x(), node.y())
  clearGuides()
}

// Handle stage drag for panning - uses Konva's optimized native dragging
function handleStageDragStart() {
  isDraggingStage.value = true
}

function handleStageDragMove(e: any) {
  const stage = e.target
  // Update our tracked position for coordinate conversions and grid rendering
  stagePosition.value = {
    x: stage.x(),
    y: stage.y(),
  }
}

function handleStageDragEnd(e: any) {
  isDraggingStage.value = false
  const stage = e.target
  stagePosition.value = {
    x: stage.x(),
    y: stage.y(),
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedShapeId.value) {
      e.preventDefault()
      removeShape(selectedShapeId.value)
    } else if (selectedConnectionId.value) {
      e.preventDefault()
      removeConnection(selectedConnectionId.value)
    }
  }
}

function handleStageWheel(e: any) {
  // Early return if no shapes exist
  if (shapes.value.length === 0) {
    return
  }
  
  // Get the native wheel event from Konva
  const nativeEvent = e.evt as WheelEvent
  
  if (!nativeEvent) {
    return
  }
  
  nativeEvent.preventDefault()
  
  // Calculate scale factor from wheel delta
  // Negative deltaY = scroll up = zoom in = scale up
  // Positive deltaY = scroll down = zoom out = scale down
  const scaleFactor = 1 + (nativeEvent.deltaY * -0.001)
  
  // Apply scaling to all shapes
  scaleAllShapes(scaleFactor)
}

onMounted(() => {
  updateStageSize()
  window.addEventListener('resize', updateStageSize)
  window.addEventListener('keydown', handleKeyDown)
  startRotationAnimation()
})

onUnmounted(() => {
  window.removeEventListener('resize', updateStageSize)
  window.removeEventListener('keydown', handleKeyDown)
  stopRotationAnimation()
})
</script>

<template>
  <div 
    class="w-full h-screen overflow-hidden bg-gray-950"
    :class="{ 
      'cursor-nwse-resize': hoveringResizeHandle || draggingResizeHandle,
      'cursor-grab': currentTool === 'pan' && !isDraggingStage && !hoveringResizeHandle && !draggingResizeHandle, 
      'cursor-grabbing': currentTool === 'pan' && isDraggingStage,
      'cursor-crosshair': (currentTool === 'square' || currentTool === 'triangle' || currentTool === 'circle' || currentTool === 'line' || currentTool === 'curved-line') && !hoveringResizeHandle && !draggingResizeHandle,
      'cursor-delete': currentTool === 'delete' && !hoveringResizeHandle && !draggingResizeHandle,
      'cursor-pointer': currentTool === 'paint' && !hoveringResizeHandle && !draggingResizeHandle
    }"
  >
    <VStage
      ref="stageRef"
      :config="{
        width: stageWidth,
        height: stageHeight,
        draggable: currentTool === 'pan',
      }"
      @click="handleStageClick"
      @dragstart="handleStageDragStart"
      @dragmove="handleStageDragMove"
      @dragend="handleStageDragEnd"
      @mousemove="handleStageMouseMove"
      @mouseleave="handleStageMouseLeave"
      @wheel="handleStageWheel"
    >
      <!-- Grid Layer - optimized with custom shape and disabled hit detection -->
      <VLayer 
        name="gridLayer" 
        :config="{ 
          listening: false,
        }"
      >
        <VShape
          :config="{
            sceneFunc: drawGrid,
            listening: false,
            perfectDrawEnabled: false,
          }"
        />
      </VLayer>

      <!-- Content Layer - Lines, Shapes, and Animation Dots -->
      <VLayer name="contentLayer">
        <VGroup
          :config="{
            x: constellationCenter.x,
            y: constellationCenter.y,
            rotation: constellationRotation,
            offsetX: 0,
            offsetY: 0,
          }"
        >
          <!-- Straight lines (reduced opacity in snake mode) -->
          <VLine
            v-for="line in linePositions.filter(l => !l.curved)"
            :key="line.id"
            :config="{
              id: line.id,
              points: line.points.map((p, i) => i % 2 === 0 ? p - constellationCenter.x : p - constellationCenter.y),
              ...getKonvaStrokeProps(
                line.stroke,
                { x: line.points[0] - constellationCenter.x, y: line.points[1] - constellationCenter.y },
                { x: line.points[2] - constellationCenter.x, y: line.points[3] - constellationCenter.y }
              ),
              strokeWidth: selectedConnectionId === line.id ? 4 : 3,
              lineCap: 'round',
              lineJoin: 'round',
              hitStrokeWidth: 12,
              listening: true,
              opacity: isSnakeMode ? 0.3 : 1,
            }"
            @click="handleConnectionClick(line.id)"
          />
          <!-- Curved lines using SVG quadratic bezier path (reduced opacity in snake mode) -->
          <VPath
            v-for="line in linePositions.filter(l => l.curved)"
            :key="line.id"
            :config="{
              id: line.id,
              data: (() => {
                // Transform path data to be relative to constellation center
                const points = line.points
                const transformedPoints: number[] = []
                for (let i = 0; i < points.length; i += 2) {
                  transformedPoints.push(points[i] - constellationCenter.x)
                  transformedPoints.push(points[i + 1] - constellationCenter.y)
                }
                // Reconstruct SVG path: M start Q control end
                return `M ${transformedPoints[0]} ${transformedPoints[1]} Q ${transformedPoints[2]} ${transformedPoints[3]} ${transformedPoints[4]} ${transformedPoints[5]}`
              })(),
              ...getKonvaStrokeProps(
                line.stroke,
                { x: line.points[0] - constellationCenter.x, y: line.points[1] - constellationCenter.y },
                { x: line.points[4] - constellationCenter.x, y: line.points[5] - constellationCenter.y }
              ),
              strokeWidth: selectedConnectionId === line.id ? 4 : 3,
              lineCap: 'round',
              lineJoin: 'round',
              listening: true,
              opacity: isSnakeMode ? 0.3 : 1,
            }"
            @click="handleConnectionClick(line.id)"
          />

          <!-- Animation dots rendered before shapes (behind shapes) -->
          <VCircle
            v-for="(dot, index) in animationDots"
            :key="`anim-dot-${index}`"
            :config="{
              x: dot.x - constellationCenter.x,
              y: dot.y - constellationCenter.y,
              radius: animDotSize,
              fill: animDotColor,
              shadowBlur: 10,
              shadowColor: animDotColor,
              shadowOpacity: 0.8,
              listening: false,
            }"
          />

          <!-- Snake segment rendered before shapes (behind shapes) -->
          <VLine
            v-if="hasSnakeSegment"
            :config="{
              points: snakePoints.map((p, i) => i % 2 === 0 ? p - constellationCenter.x : p - constellationCenter.y),
              ...getKonvaStrokeProps(
                snakeStroke,
                { x: snakeStrokeStart.x - constellationCenter.x, y: snakeStrokeStart.y - constellationCenter.y },
                { x: snakeStrokeEnd.x - constellationCenter.x, y: snakeStrokeEnd.y - constellationCenter.y }
              ),
              strokeWidth: 5,
              lineCap: 'round',
              lineJoin: 'round',
              tension: 0.3,
              listening: false,
            }"
          />

          <!-- Shapes rendered last (on top of animations) -->
          <VGroup
            v-for="shape in shapes"
            :key="shape.id"
            :config="{
              id: shape.id,
              x: shape.x - constellationCenter.x,
              y: shape.y - constellationCenter.y,
              draggable: currentTool !== 'delete',
            }"
            @click="(e) => {
              const stage = e.target.getStage()
              const pointerPos = stage.getPointerPosition()
              if (pointerPos) {
                // Convert screen position to world position
                // Note: For rotated shapes, we need to account for rotation in coordinate conversion
                // But Konva's hit detection handles this, and we use stored shape positions for anchor detection
                const worldX = pointerPos.x - stage.x()
                const worldY = pointerPos.y - stage.y()
                handleShapeClickWithAnchorDetection(shape.id, worldX, worldY)
              } else {
                handleShapeClick(shape.id)
              }
            }"
            @dragmove="(e) => {
              const node = e.target
              const shapeId = node.id()
              // Transform dragged position back to world coordinates
              const groupX = node.x()
              const groupY = node.y()
              const worldX = groupX + constellationCenter.x
              const worldY = groupY + constellationCenter.y
              updateShapePosition(shapeId, worldX, worldY)
              
              // Calculate viewport bounds in world coordinates
              const viewportBounds = {
                left: -stagePosition.value.x,
                right: -stagePosition.value.x + stageWidth.value,
                top: -stagePosition.value.y,
                bottom: -stagePosition.value.y + stageHeight.value,
              }
              
              // Compute guides with temporary position
              computeGuidesForDrag(shapeId, viewportBounds, { x: worldX, y: worldY })
            }"
            @dragend="(e) => {
              const node = e.target
              const shapeId = node.id()
              // Transform dragged position back to world coordinates
              const groupX = node.x()
              const groupY = node.y()
              const worldX = groupX + constellationCenter.x
              const worldY = groupY + constellationCenter.y
              updateShapePosition(shapeId, worldX, worldY)
              clearGuides()
            }"
            @mouseenter="handleShapeMouseEnter"
            @mouseleave="handleShapeMouseLeave"
          >
            <!-- Square -->
            <VRect
              v-if="shape.type === 'square'"
              :config="{
                width: shape.width || 40,
                height: shape.height || 40,
                ...getKonvaFillProps(shape.fill, { width: shape.width || 40, height: shape.height || 40 }),
                stroke: getStrokeColor(shape.fill, selectedShapeId === shape.id),
                strokeWidth: selectedShapeId === shape.id ? 3 : 2,
                cornerRadius: 4,
              }"
            />

            <!-- Circle -->
            <VCircle
              v-if="shape.type === 'circle'"
              :config="{
                radius: shape.radius || 20,
                ...getKonvaFillProps(shape.fill, { width: (shape.radius || 20) * 2, height: (shape.radius || 20) * 2 }),
                stroke: getStrokeColor(shape.fill, selectedShapeId === shape.id),
                strokeWidth: selectedShapeId === shape.id ? 3 : 2,
              }"
            />

            <!-- Triangle -->
            <VLine
              v-if="shape.type === 'triangle'"
              :config="{
                points: [
                  0, shape.height || 40, // bottom left
                  (shape.width || 40) / 2, 0, // top center
                  shape.width || 40, shape.height || 40, // bottom right
                ],
                closed: true,
                ...getKonvaFillProps(shape.fill, { width: shape.width || 40, height: shape.height || 40 }),
                stroke: getStrokeColor(shape.fill, selectedShapeId === shape.id),
                strokeWidth: selectedShapeId === shape.id ? 3 : 2,
              }"
            />
          </VGroup>
        </VGroup>
      </VLayer>

      <!-- Interaction Layer - Connection Points and Endpoint Handles -->
      <VLayer name="interactionLayer">
        <VGroup
          :config="{
            x: constellationCenter.x,
            y: constellationCenter.y,
            rotation: constellationRotation,
            offsetX: 0,
            offsetY: 0,
          }"
        >
          <!-- Connection Point Indicators -->
          <VCircle
            v-for="(indicator, index) in connectionPointIndicators"
            :key="`anchor-${indicator.shapeId}-${index}`"
            :config="{
              x: indicator.x - constellationCenter.x,
              y: indicator.y - constellationCenter.y,
              radius: indicator.isSelected ? 7 : (indicator.isHighlighted ? 6 : 4),
              fill: indicator.isSelected ? '#10b981' : (indicator.isHighlighted ? '#ffffff' : '#60a5fa'),
              stroke: indicator.isSelected ? '#059669' : (indicator.isHighlighted ? '#60a5fa' : '#ffffff'),
              strokeWidth: indicator.isSelected ? 2 : (indicator.isHighlighted ? 2 : 1),
              opacity: indicator.isSelected ? 1 : (indicator.isHighlighted ? 1 : 0.8),
              listening: true,
              hitStrokeWidth: 15,
            }"
            @click="(e) => handleAnchorIndicatorClick(e, indicator.shapeId, indicator.position)"
          />

          <!-- Endpoint Handles -->
          <VCircle
            v-for="(handle, index) in endpointHandles"
            :key="`endpoint-${handle.type}-${index}`"
            :config="{
              x: handle.x - constellationCenter.x,
              y: handle.y - constellationCenter.y,
              radius: 6,
              fill: '#ffffff',
              stroke: '#60a5fa',
              strokeWidth: 2,
              draggable: true,
              listening: true,
            }"
            @click="handleEndpointClick"
            @dragstart="(e) => handleEndpointDragStart(e, handle.type)"
            @dragmove="handleEndpointDragMove"
            @dragend="handleEndpointDragEnd"
          />
          
          <!-- Curve Control Handle (when curved line is selected) -->
          <VCircle
            v-if="curveControlHandle"
            :config="{
              x: (draggingCurveControlPosition ? draggingCurveControlPosition.x : curveControlHandle.x) - constellationCenter.x,
              y: (draggingCurveControlPosition ? draggingCurveControlPosition.y : curveControlHandle.y) - constellationCenter.y,
              radius: 6,
              fill: '#3b82f6',
              stroke: '#1d4ed8',
              strokeWidth: 2,
              draggable: true,
              listening: true,
            }"
            @click="handleCurveControlClick"
            @dragstart="handleCurveControlDragStart"
            @dragmove="handleCurveControlDrag"
            @dragend="handleCurveControlDragEnd"
          />
          
          <!-- Resize Handle (when shape is selected) -->
          <VCircle
            v-if="resizeHandle && currentTool !== 'delete'"
            :config="{
              x: resizeHandle.x - constellationCenter.x,
              y: resizeHandle.y - constellationCenter.y,
              radius: 6,
              fill: '#ffffff',
              stroke: '#10b981',
              strokeWidth: 2,
              draggable: true,
              listening: true,
            }"
            @click="handleResizeHandleClick"
            @dragstart="handleResizeHandleDragStart"
            @dragmove="handleResizeHandleDragMove"
            @dragend="handleResizeHandleDragEnd"
            @mouseenter="handleResizeHandleMouseEnter"
            @mouseleave="handleResizeHandleMouseLeave"
          />
        </VGroup>
      </VLayer>

      <!-- Guides Layer -->
      <VLayer name="guidesLayer" :config="{ listening: false }">
        <!-- Alignment Guides -->
        <VLine
          v-for="(guide, index) in activeGuides"
          :key="`guide-${index}`"
          :config="{
            points: guide.type === 'vertical'
              ? [guide.position, guide.start, guide.position, guide.end]
              : [guide.start, guide.position, guide.end, guide.position],
            stroke: '#991B1B',
            strokeWidth: 1,
            dash: [4, 4],
            listening: false,
          }"
        />
        
        <!-- Spacing Guides -->
        <VGroup
          v-for="(spacingGuide, index) in spacingGuides"
          :key="`spacing-${index}`"
          :config="{
            x: spacingGuide.position.x,
            y: spacingGuide.position.y,
            listening: false,
          }"
        >
          <VRect
            :config="{
              x: -20,
              y: -10,
              width: 40,
              height: 20,
              fill: '#991B1B',
              cornerRadius: 4,
              listening: false,
            }"
          />
          <VText
            :config="{
              text: `${spacingGuide.distance}px`,
              fontSize: 10,
              fill: '#ffffff',
              align: 'center',
              x: 0,
              y: 0,
              offsetY: 5,
              listening: false,
            }"
          />
        </VGroup>
      </VLayer>
    </VStage>
  </div>
</template>
