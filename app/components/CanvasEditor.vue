<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import type { BaseShape } from '~/types/canvas'
import type { Context } from 'konva/lib/Context'
import { getAnchorPosition, findNearestAnchor } from '~/composables/useCanvasState'
import type { ConnectionAnchor } from '~/types/canvas'

const canvasState = inject<ReturnType<typeof import('~/composables/useCanvasState').useCanvasState>>('canvasState')

if (!canvasState) {
  throw new Error('CanvasEditor: canvasState not provided')
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

// Helper to get stroke color for selected shapes (darker version of fill)
function getStrokeColor(fillColor: string, isSelected: boolean) {
  if (!isSelected) {
    // For unselected shapes, use a darker shade of the fill color
    // Convert hex to RGB, darken, and convert back
    const hex = fillColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const darkerR = Math.max(0, r - 40).toString(16).padStart(2, '0')
    const darkerG = Math.max(0, g - 40).toString(16).padStart(2, '0')
    const darkerB = Math.max(0, b - 40).toString(16).padStart(2, '0')
    return `#${darkerR}${darkerG}${darkerB}`
  }
  // For selected shapes, use a much darker shade
  const hex = fillColor.replace('#', '')
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
      return {
        id: conn.id,
        points: [from.x, from.y, midX + conn.curveOffset.x, midY + conn.curveOffset.y, to.x, to.y],
        stroke: conn.stroke,
        curved: true,
      }
    }
    
    return {
      id: conn.id,
      points: [from.x, from.y, to.x, to.y],
      stroke: conn.stroke,
      curved: false,
    }
  }).filter(Boolean) as Array<{ id: string; points: number[]; stroke: string; curved: boolean }>
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

onMounted(() => {
  updateStageSize()
  window.addEventListener('resize', updateStageSize)
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateStageSize)
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div 
    class="w-full h-screen overflow-hidden bg-gray-950"
    :class="{ 
      'cursor-grab': currentTool === 'pan' && !isDraggingStage, 
      'cursor-grabbing': currentTool === 'pan' && isDraggingStage,
      'cursor-crosshair': currentTool === 'square' || currentTool === 'triangle' || currentTool === 'circle' || currentTool === 'line' || currentTool === 'curved-line',
      'cursor-delete': currentTool === 'delete',
      'cursor-pointer': currentTool === 'paint'
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
    >
      <!-- Grid Layer - optimized with custom shape and disabled hit detection -->
      <VLayer 
        name="gridLayer" 
        :config="{ 
          listening: false,
          hitGraphEnabled: false,
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

      <!-- Lines Layer -->
      <VLayer name="linesLayer">
        <VLine
          v-for="line in linePositions"
          :key="line.id"
          :config="{
            id: line.id,
            points: line.points,
            stroke: line.stroke,
            strokeWidth: selectedConnectionId === line.id ? 4 : 3,
            tension: line.curved ? 1 : 0,
            lineCap: 'round',
            lineJoin: 'round',
            hitStrokeWidth: 12,
            listening: true,
          }"
          @click="handleConnectionClick(line.id)"
        />
      </VLayer>

      <!-- Shapes Layer -->
      <VLayer name="shapesLayer">
        <VGroup
          v-for="shape in shapes"
          :key="shape.id"
          :config="{
            id: shape.id,
            x: shape.x,
            y: shape.y,
            draggable: currentTool !== 'delete',
          }"
          @click="(e) => {
            const stage = e.target.getStage()
            const pointerPos = stage.getPointerPosition()
            if (pointerPos) {
              const worldX = pointerPos.x - stage.x()
              const worldY = pointerPos.y - stage.y()
              handleShapeClickWithAnchorDetection(shape.id, worldX, worldY)
            } else {
              handleShapeClick(shape.id)
            }
          }"
          @dragmove="handleShapeDragMove"
          @dragend="handleShapeDragEnd"
          @mouseenter="handleShapeMouseEnter"
          @mouseleave="handleShapeMouseLeave"
        >
          <!-- Square -->
          <VRect
            v-if="shape.type === 'square'"
            :config="{
              width: shape.width || 40,
              height: shape.height || 40,
              fill: shape.fill,
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
              fill: shape.fill,
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
              fill: shape.fill,
              stroke: getStrokeColor(shape.fill, selectedShapeId === shape.id),
              strokeWidth: selectedShapeId === shape.id ? 3 : 2,
            }"
          />
        </VGroup>
      </VLayer>

      <!-- Connection Points Layer -->
      <VLayer name="connectionPointsLayer">
        <VCircle
          v-for="(indicator, index) in connectionPointIndicators"
          :key="`anchor-${indicator.shapeId}-${index}`"
          :config="{
            x: indicator.x,
            y: indicator.y,
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
      </VLayer>

      <!-- Endpoint Handles Layer -->
      <VLayer name="endpointHandlesLayer">
        <VCircle
          v-for="(handle, index) in endpointHandles"
          :key="`endpoint-${handle.type}-${index}`"
          :config="{
            x: handle.x,
            y: handle.y,
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
            x: draggingCurveControlPosition ? draggingCurveControlPosition.x : curveControlHandle.x,
            y: draggingCurveControlPosition ? draggingCurveControlPosition.y : curveControlHandle.y,
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
