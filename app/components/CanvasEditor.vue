<script setup lang="ts">
import { ref, computed, onMounted, watch, inject } from 'vue'
import type { BaseShape } from '~/types/canvas'

const canvasState = inject<ReturnType<typeof import('~/composables/useCanvasState').useCanvasState>>('canvasState')

if (!canvasState) {
  throw new Error('CanvasEditor: canvasState not provided')
}

const {
  shapes,
  connections,
  currentTool,
  selectedShapeId,
  pendingLineStart,
  activeGuides,
  spacingGuides,
  updateShapePosition,
  handleShapeClick,
  handleConnectionClick,
  handleCanvasClick,
  computeGuidesForDrag,
  clearGuides,
} = canvasState

const stageWidth = ref(0)
const stageHeight = ref(0)
const stageRef = ref()

// Grid configuration
const gridSpacing = 20
const gridDotRadius = 1
const gridBuffer = 100 // Extra dots beyond visible area for smooth panning

// Compute grid dots based on current pan position
const gridDots = computed(() => {
  const dots: Array<{ x: number; y: number }> = []
  
  // Calculate visible area in world coordinates (accounting for pan)
  const visibleLeft = -stagePosition.value.x - gridBuffer
  const visibleTop = -stagePosition.value.y - gridBuffer
  const visibleRight = -stagePosition.value.x + stageWidth.value + gridBuffer
  const visibleBottom = -stagePosition.value.y + stageHeight.value + gridBuffer
  
  // Snap to grid alignment
  const startX = Math.floor(visibleLeft / gridSpacing) * gridSpacing
  const startY = Math.floor(visibleTop / gridSpacing) * gridSpacing
  
  for (let x = startX; x < visibleRight; x += gridSpacing) {
    for (let y = startY; y < visibleBottom; y += gridSpacing) {
      dots.push({ x, y })
    }
  }
  return dots
})

// Get shape center for line connections
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

// Compute line positions for connections
const linePositions = computed(() => {
  return connections.value.map(conn => {
    const fromShape = shapes.value.find(s => s.id === conn.fromShapeId)
    const toShape = shapes.value.find(s => s.id === conn.toShapeId)
    if (!fromShape || !toShape) return null

    const from = getShapeCenter(fromShape)
    const to = getShapeCenter(toShape)
    return {
      id: conn.id,
      points: [from.x, from.y, to.x, to.y],
      stroke: conn.stroke,
    }
  }).filter(Boolean) as Array<{ id: string; points: number[]; stroke: string }>
})

// Pan state
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const stagePosition = ref({ x: 0, y: 0 })

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
    const worldX = pointerPos.x - stagePosition.value.x
    const worldY = pointerPos.y - stagePosition.value.y
    handleCanvasClick(worldX, worldY)
  }
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

function handleStageMouseDown(e: any) {
  if (currentTool.value === 'pan') {
    isPanning.value = true
    const stage = e.target.getStage()
    const pointerPos = stage.getPointerPosition()
    if (pointerPos) {
      panStart.value = {
        x: pointerPos.x - stagePosition.value.x,
        y: pointerPos.y - stagePosition.value.y,
      }
    }
  }
}

function handleStageMouseMove(e: any) {
  if (isPanning.value && currentTool.value === 'pan') {
    const stage = e.target.getStage()
    const pointerPos = stage.getPointerPosition()
    if (pointerPos) {
      stagePosition.value = {
        x: pointerPos.x - panStart.value.x,
        y: pointerPos.y - panStart.value.y,
      }
    }
  }
}

function handleStageMouseUp() {
  isPanning.value = false
}

onMounted(() => {
  updateStageSize()
  window.addEventListener('resize', updateStageSize)
})

// Watch for tool changes to reset pan state
watch(currentTool, () => {
  isPanning.value = false
})
</script>

<template>
  <div 
    class="w-full h-screen overflow-hidden bg-gray-950"
    :class="{ 
      'cursor-grab': currentTool === 'pan' && !isPanning, 
      'cursor-grabbing': currentTool === 'pan' && isPanning,
      'cursor-crosshair': currentTool === 'square' || currentTool === 'triangle' || currentTool === 'circle',
      'cursor-delete': currentTool === 'delete',
      'cursor-pointer': currentTool === 'paint'
    }"
  >
    <VStage
      ref="stageRef"
      :config="{
        width: stageWidth,
        height: stageHeight,
        x: stagePosition.x,
        y: stagePosition.y,
      }"
      @click="handleStageClick"
      @mousedown="handleStageMouseDown"
      @mousemove="handleStageMouseMove"
      @mouseup="handleStageMouseUp"
      @mouseleave="handleStageMouseUp"
    >
      <!-- Grid Layer -->
      <VLayer name="gridLayer">
        <VCircle
          v-for="(dot, index) in gridDots"
          :key="`grid-${index}`"
          :config="{
            x: dot.x,
            y: dot.y,
            radius: gridDotRadius,
            fill: '#374151',
            listening: false,
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
            strokeWidth: 3,
            lineCap: 'round',
            lineJoin: 'round',
            hitStrokeWidth: 12,
            listening: currentTool === 'paint' || currentTool === 'delete',
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
            draggable: currentTool === 'select' || currentTool === 'pan',
          }"
          @click="handleShapeClick(shape.id)"
          @dragmove="handleShapeDragMove"
          @dragend="handleShapeDragEnd"
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
