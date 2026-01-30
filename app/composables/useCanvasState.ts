import { ref, computed } from 'vue'
import type { BaseShape, Connection, ToolMode, AlignmentGuide, SpacingGuide } from '~/types/canvas'
import { useAlignmentGuides } from './useAlignmentGuides'

export function useCanvasState() {
  const shapes = ref<BaseShape[]>([])
  const connections = ref<Connection[]>([])
  const currentTool = ref<ToolMode>('select')
  const selectedShapeId = ref<string | null>(null)
  const pendingLineStart = ref<string | null>(null)
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

  function addConnection(fromShapeId: string, toShapeId: string) {
    // Prevent duplicate connections
    const exists = connections.value.some(
      c => (c.fromShapeId === fromShapeId && c.toShapeId === toShapeId) ||
           (c.fromShapeId === toShapeId && c.toShapeId === fromShapeId)
    )
    if (exists) return

    const id = `connection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    connections.value.push({ id, fromShapeId, toShapeId, stroke: selectedColor.value })
  }

  function removeConnection(id: string) {
    connections.value = connections.value.filter(c => c.id !== id)
  }

  function updateConnectionColor(id: string, color: string) {
    const connection = connections.value.find(c => c.id === id)
    if (connection) {
      connection.stroke = color
    }
  }

  function handleConnectionClick(connectionId: string) {
    if (currentTool.value === 'delete') {
      removeConnection(connectionId)
    } else if (currentTool.value === 'paint') {
      updateConnectionColor(connectionId, selectedColor.value)
    }
  }

  function setTool(tool: ToolMode) {
    currentTool.value = tool
    selectedShapeId.value = null
    pendingLineStart.value = null
  }

  function selectShape(id: string | null) {
    selectedShapeId.value = id
  }

  function handleShapeClick(shapeId: string) {
    if (currentTool.value === 'delete') {
      removeShape(shapeId)
    } else if (currentTool.value === 'paint') {
      updateShapeColor(shapeId, selectedColor.value)
      selectedShapeId.value = shapeId
    } else if (currentTool.value === 'line') {
      if (pendingLineStart.value === null) {
        pendingLineStart.value = shapeId
        selectedShapeId.value = shapeId
      } else if (pendingLineStart.value !== shapeId) {
        addConnection(pendingLineStart.value, shapeId)
        pendingLineStart.value = shapeId
        selectedShapeId.value = shapeId
      }
    } else if (currentTool.value === 'select') {
      selectShape(shapeId)
    }
  }

  function handleCanvasClick(x: number, y: number) {
    if (currentTool.value === 'square' || currentTool.value === 'triangle' || currentTool.value === 'circle') {
      addShape(currentTool.value, x, y)
      // Stay in shape mode so user can place multiple shapes
    } else if (currentTool.value === 'line') {
      // Cancel line drawing if clicking on empty canvas
      pendingLineStart.value = null
      selectedShapeId.value = null
    } else if (currentTool.value === 'select') {
      // Deselect when clicking empty canvas
      selectedShapeId.value = null
    }
  }

  return {
    shapes,
    connections,
    currentTool,
    selectedShapeId,
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
    setTool,
    selectShape,
    handleShapeClick,
    handleConnectionClick,
    handleCanvasClick,
    computeGuidesForDrag,
    clearGuides,
  }
}
