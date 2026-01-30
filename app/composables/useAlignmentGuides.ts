import type { BaseShape, AlignmentGuide, SpacingGuide } from '~/types/canvas'

const ALIGNMENT_TOLERANCE = 8 // pixels
const GUIDE_EXTENSION = 10000 // Extend guides well beyond viewport

function getShapeBounds(shape: BaseShape) {
  if (shape.type === 'circle') {
    const r = shape.radius ?? 20
    return {
      left: shape.x - r,
      right: shape.x + r,
      top: shape.y - r,
      bottom: shape.y + r,
      centerX: shape.x,
      centerY: shape.y,
    }
  }
  const w = shape.width ?? 40
  const h = shape.height ?? 40
  return {
    left: shape.x,
    right: shape.x + w,
    top: shape.y,
    bottom: shape.y + h,
    centerX: shape.x + w / 2,
    centerY: shape.y + h / 2,
  }
}

export function useAlignmentGuides() {
  function computeAlignmentGuides(
    draggingShapeId: string,
    draggingShape: BaseShape,
    allShapes: BaseShape[],
    viewportBounds: { left: number; right: number; top: number; bottom: number }
  ): { alignmentGuides: AlignmentGuide[]; spacingGuides: SpacingGuide[] } {
    const alignmentGuides: AlignmentGuide[] = []
    const spacingGuides: SpacingGuide[] = []

    const draggingBounds = getShapeBounds(draggingShape)
    const otherShapes = allShapes.filter(s => s.id !== draggingShapeId)

    // Track edges and centers for alignment detection
    const verticalPositions = new Set<number>()
    const horizontalPositions = new Set<number>()

    // Check center alignment
    for (const shape of otherShapes) {
      const bounds = getShapeBounds(shape)
      
      // Vertical center alignment
      const centerXDiff = Math.abs(draggingBounds.centerX - bounds.centerX)
      if (centerXDiff < ALIGNMENT_TOLERANCE) {
        verticalPositions.add(bounds.centerX)
      }

      // Horizontal center alignment
      const centerYDiff = Math.abs(draggingBounds.centerY - bounds.centerY)
      if (centerYDiff < ALIGNMENT_TOLERANCE) {
        horizontalPositions.add(bounds.centerY)
      }

      // Edge alignments
      // Left edge
      const leftDiff = Math.abs(draggingBounds.left - bounds.left)
      if (leftDiff < ALIGNMENT_TOLERANCE) {
        verticalPositions.add(bounds.left)
      }

      // Right edge
      const rightDiff = Math.abs(draggingBounds.right - bounds.right)
      if (rightDiff < ALIGNMENT_TOLERANCE) {
        verticalPositions.add(bounds.right)
      }

      // Top edge
      const topDiff = Math.abs(draggingBounds.top - bounds.top)
      if (topDiff < ALIGNMENT_TOLERANCE) {
        horizontalPositions.add(bounds.top)
      }

      // Bottom edge
      const bottomDiff = Math.abs(draggingBounds.bottom - bounds.bottom)
      if (bottomDiff < ALIGNMENT_TOLERANCE) {
        horizontalPositions.add(bounds.bottom)
      }
    }

    // Create vertical guides
    for (const x of verticalPositions) {
      alignmentGuides.push({
        type: 'vertical',
        position: x,
        start: viewportBounds.top - GUIDE_EXTENSION,
        end: viewportBounds.bottom + GUIDE_EXTENSION,
      })
    }

    // Create horizontal guides
    for (const y of horizontalPositions) {
      alignmentGuides.push({
        type: 'horizontal',
        position: y,
        start: viewportBounds.left - GUIDE_EXTENSION,
        end: viewportBounds.right + GUIDE_EXTENSION,
      })
    }

    // Equal spacing detection
    // Group shapes by alignment direction
    const horizontallyAligned = otherShapes.filter(shape => {
      const bounds = getShapeBounds(shape)
      return Math.abs(draggingBounds.centerY - bounds.centerY) < ALIGNMENT_TOLERANCE * 2
    })

    const verticallyAligned = otherShapes.filter(shape => {
      const bounds = getShapeBounds(shape)
      return Math.abs(draggingBounds.centerX - bounds.centerX) < ALIGNMENT_TOLERANCE * 2
    })

    // Check horizontal spacing
    if (horizontallyAligned.length >= 1) {
      const allShapesHorizontal = [draggingShape, ...horizontallyAligned]
        .map(s => ({ id: s.id, bounds: getShapeBounds(s) }))
        .sort((a, b) => a.bounds.centerX - b.bounds.centerX)

      for (let i = 0; i < allShapesHorizontal.length - 1; i++) {
        const current = allShapesHorizontal[i]
        const next = allShapesHorizontal[i + 1]
        const gap = next.bounds.left - current.bounds.right

        // Check if this gap matches another gap
        for (let j = i + 1; j < allShapesHorizontal.length - 1; j++) {
          const otherCurrent = allShapesHorizontal[j]
          const otherNext = allShapesHorizontal[j + 1]
          const otherGap = otherNext.bounds.left - otherCurrent.bounds.right

          if (Math.abs(gap - otherGap) < ALIGNMENT_TOLERANCE && gap > 0) {
            // Found equal spacing - add guide at midpoint of first gap
            const midX = current.bounds.right + gap / 2
            const midY = draggingBounds.centerY
            spacingGuides.push({
              type: 'horizontal',
              position: { x: midX, y: midY },
              distance: Math.round(gap),
            })
            break
          }
        }
      }
    }

    // Check vertical spacing
    if (verticallyAligned.length >= 1) {
      const allShapesVertical = [draggingShape, ...verticallyAligned]
        .map(s => ({ id: s.id, bounds: getShapeBounds(s) }))
        .sort((a, b) => a.bounds.centerY - b.bounds.centerY)

      for (let i = 0; i < allShapesVertical.length - 1; i++) {
        const current = allShapesVertical[i]
        const next = allShapesVertical[i + 1]
        const gap = next.bounds.top - current.bounds.bottom

        // Check if this gap matches another gap
        for (let j = i + 1; j < allShapesVertical.length - 1; j++) {
          const otherCurrent = allShapesVertical[j]
          const otherNext = allShapesVertical[j + 1]
          const otherGap = otherNext.bounds.top - otherCurrent.bounds.bottom

          if (Math.abs(gap - otherGap) < ALIGNMENT_TOLERANCE && gap > 0) {
            // Found equal spacing - add guide at midpoint of first gap
            const midX = draggingBounds.centerX
            const midY = current.bounds.bottom + gap / 2
            spacingGuides.push({
              type: 'vertical',
              position: { x: midX, y: midY },
              distance: Math.round(gap),
            })
            break
          }
        }
      }
    }

    return { alignmentGuides, spacingGuides }
  }

  return {
    computeAlignmentGuides,
  }
}
