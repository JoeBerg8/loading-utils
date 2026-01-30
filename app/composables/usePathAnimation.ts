import { ref, shallowRef, onUnmounted, watch } from 'vue'
import type { Connection, BaseShape, AnimationConfig } from '~/types/canvas'
import { getAnchorPosition } from './useCanvasState'

export interface AnimationDot {
  connectionId: string
  x: number
  y: number
  progress: number
}

interface CircuitSegment {
  connection: Connection
  reversed: boolean  // true if we traverse this connection backward
  startDistance: number
  endDistance: number
}

export function usePathAnimation(
  connections: () => Connection[],
  shapes: () => BaseShape[],
  config: () => AnimationConfig
) {
  const isPlaying = ref(false)
  // Use shallowRef for the dots array to avoid deep reactivity issues
  const animationDots = shallowRef<AnimationDot[]>([])
  let animationFrameId: number | null = null
  let startTime: number | null = null

  // Helper to get shape center
  function getShapeCenter(shape: BaseShape): { x: number; y: number } {
    if (shape.type === 'circle') {
      return { x: shape.x, y: shape.y }
    }
    const width = shape.width || 40
    const height = shape.height || 40
    return { x: shape.x + width / 2, y: shape.y + height / 2 }
  }

  // Calculate point on straight line at progress t (0-1)
  function getPointOnStraightLine(
    from: { x: number; y: number },
    to: { x: number; y: number },
    t: number
  ): { x: number; y: number } {
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    }
  }

  // Calculate point on quadratic bezier curve at progress t (0-1)
  function getPointOnCurve(
    from: { x: number; y: number },
    control: { x: number; y: number },
    to: { x: number; y: number },
    t: number
  ): { x: number; y: number } {
    const mt = 1 - t
    return {
      x: mt * mt * from.x + 2 * mt * t * control.x + t * t * to.x,
      y: mt * mt * from.y + 2 * mt * t * control.y + t * t * to.y,
    }
  }

  // Calculate approximate path length for consistent speed
  function calculatePathLength(connection: Connection): number {
    const fromShape = shapes().find(s => s.id === connection.fromShapeId)
    const toShape = shapes().find(s => s.id === connection.toShapeId)
    if (!fromShape || !toShape) return 0

    const from = connection.fromAnchor
      ? getAnchorPosition(fromShape, connection.fromAnchor)
      : getShapeCenter(fromShape)
    const to = connection.toAnchor
      ? getAnchorPosition(toShape, connection.toAnchor)
      : getShapeCenter(toShape)

    if (connection.curveOffset === null) {
      // Straight line - simple distance
      const dx = to.x - from.x
      const dy = to.y - from.y
      return Math.sqrt(dx * dx + dy * dy)
    } else {
      // Curved line - approximate length by sampling points
      const midX = (from.x + to.x) / 2
      const midY = (from.y + to.y) / 2
      const control = {
        x: midX + connection.curveOffset.x,
        y: midY + connection.curveOffset.y,
      }

      let length = 0
      let prevPoint = from
      const samples = 20
      for (let i = 1; i <= samples; i++) {
        const t = i / samples
        const point = getPointOnCurve(from, control, to, t)
        const dx = point.x - prevPoint.x
        const dy = point.y - prevPoint.y
        length += Math.sqrt(dx * dx + dy * dy)
        prevPoint = point
      }
      return length
    }
  }

  // Get point on path at progress t (0-1)
  function getPointOnPath(connection: Connection, t: number, reversed: boolean = false): { x: number; y: number } | null {
    const fromShape = shapes().find(s => s.id === connection.fromShapeId)
    const toShape = shapes().find(s => s.id === connection.toShapeId)
    if (!fromShape || !toShape) return null

    const from = connection.fromAnchor
      ? getAnchorPosition(fromShape, connection.fromAnchor)
      : getShapeCenter(fromShape)
    const to = connection.toAnchor
      ? getAnchorPosition(toShape, connection.toAnchor)
      : getShapeCenter(toShape)

    // For reversed traversal, use (1-t) to go backwards along the same path
    const actualT = reversed ? 1 - t : t

    if (connection.curveOffset === null) {
      // Straight line: use original from/to with adjusted t
      return getPointOnStraightLine(from, to, actualT)
    } else {
      // Curved line: use original from/control/to with adjusted t
      // The control point defines the curve shape - it stays the same regardless of direction
      const midX = (from.x + to.x) / 2
      const midY = (from.y + to.y) / 2
      const control = {
        x: midX + connection.curveOffset.x,
        y: midY + connection.curveOffset.y,
      }
      
      return getPointOnCurve(from, control, to, actualT)
    }
  }

  // Build a circuit path from connections by linking them end-to-end
  function buildCircuit(connectionsList: Connection[]): CircuitSegment[] {
    if (connectionsList.length === 0) return []
    if (connectionsList.length === 1) {
      // Single connection - just return it
      const connection = connectionsList[0]
      const length = calculatePathLength(connection)
      return [{
        connection,
        reversed: false,
        startDistance: 0,
        endDistance: length,
      }]
    }

    const segments: CircuitSegment[] = []
    const usedConnections = new Set<string>()
    let currentShapeId: string | null = null
    let cumulativeDistance = 0

    // Start with the first connection
    const firstConnection = connectionsList[0]
    usedConnections.add(firstConnection.id)
    const firstLength = calculatePathLength(firstConnection)
    segments.push({
      connection: firstConnection,
      reversed: false,
      startDistance: cumulativeDistance,
      endDistance: cumulativeDistance + firstLength,
    })
    cumulativeDistance += firstLength
    currentShapeId = firstConnection.toShapeId

    // Continue building the path by finding connections that share endpoints
    while (usedConnections.size < connectionsList.length) {
      let foundNext = false

      // Try to find a connection that continues from currentShapeId
      for (const connection of connectionsList) {
        if (usedConnections.has(connection.id)) continue

        // Check if this connection starts at current shape (forward)
        if (connection.fromShapeId === currentShapeId) {
          usedConnections.add(connection.id)
          const length = calculatePathLength(connection)
          segments.push({
            connection,
            reversed: false,
            startDistance: cumulativeDistance,
            endDistance: cumulativeDistance + length,
          })
          cumulativeDistance += length
          currentShapeId = connection.toShapeId
          foundNext = true
          break
        }

        // Check if this connection ends at current shape (reverse)
        if (connection.toShapeId === currentShapeId) {
          usedConnections.add(connection.id)
          const length = calculatePathLength(connection)
          segments.push({
            connection,
            reversed: true,
            startDistance: cumulativeDistance,
            endDistance: cumulativeDistance + length,
          })
          cumulativeDistance += length
          currentShapeId = connection.fromShapeId
          foundNext = true
          break
        }
      }

      // If we can't find a next connection, try to start a new path from an unused connection
      if (!foundNext) {
        for (const connection of connectionsList) {
          if (usedConnections.has(connection.id)) continue

          // Start a new path segment (doesn't connect, but we'll animate through it)
          usedConnections.add(connection.id)
          const length = calculatePathLength(connection)
          segments.push({
            connection,
            reversed: false,
            startDistance: cumulativeDistance,
            endDistance: cumulativeDistance + length,
          })
          cumulativeDistance += length
          currentShapeId = connection.toShapeId
          foundNext = true
          break
        }
      }

      // If still nothing found, break (disconnected segments)
      if (!foundNext) break
    }

    return segments
  }

  // Animation loop
  function animate() {
    if (!isPlaying.value) return

    const now = performance.now()
    if (startTime === null) {
      startTime = now
    }

    const connectionsList = connections()
    if (connectionsList.length === 0) {
      animationDots.value = []
      animationFrameId = requestAnimationFrame(animate)
      return
    }

    // Build circuit path
    const circuit = buildCircuit(connectionsList)
    if (circuit.length === 0) {
      animationDots.value = []
      animationFrameId = requestAnimationFrame(animate)
      return
    }

    // Calculate total circuit length
    const totalLength = circuit[circuit.length - 1]?.endDistance || 0
    if (totalLength === 0) {
      animationDots.value = []
      animationFrameId = requestAnimationFrame(animate)
      return
    }

    // Calculate duration based on total path length
    const baseDuration = 2000 // 2 seconds base
    const avgPathLength = 200
    const speedMultiplier = config().speed
    const duration = (baseDuration * (totalLength / avgPathLength)) / speedMultiplier

    // Single progress through entire circuit
    const elapsed = now - startTime!
    const progress = (elapsed % duration) / duration
    const distanceAlongCircuit = progress * totalLength

    // Find which segment contains this distance
    const segment = circuit.find(s => 
      distanceAlongCircuit >= s.startDistance && 
      distanceAlongCircuit < s.endDistance
    ) || circuit[circuit.length - 1] // Fallback to last segment if at the end

    // Calculate position within that segment
    const segmentLength = segment.endDistance - segment.startDistance
    const segmentProgress = segmentLength > 0
      ? (distanceAlongCircuit - segment.startDistance) / segmentLength
      : 0

    // Clamp segmentProgress to [0, 1] to handle edge cases
    const clampedProgress = Math.max(0, Math.min(1, segmentProgress))

    // Get point on the segment (handling reversed direction)
    const point = getPointOnPath(segment.connection, clampedProgress, segment.reversed)
    
    const newDots: AnimationDot[] = []
    if (point) {
      newDots.push({
        connectionId: segment.connection.id,
        x: point.x,
        y: point.y,
        progress: clampedProgress,
      })
    }

    // Assign new array to trigger reactivity
    animationDots.value = newDots

    animationFrameId = requestAnimationFrame(animate)
  }

  function startAnimation() {
    if (isPlaying.value) return
    isPlaying.value = true
    startTime = null
    animationDots.value = []
    animate()
  }

  function stopAnimation() {
    isPlaying.value = false
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    startTime = null
    animationDots.value = []
  }

  function toggleAnimation() {
    if (isPlaying.value) {
      stopAnimation()
    } else {
      startAnimation()
    }
  }

  // Watch for config.enabled changes
  watch(
    () => config().enabled,
    (enabled) => {
      if (enabled && !isPlaying.value) {
        startAnimation()
      } else if (!enabled && isPlaying.value) {
        stopAnimation()
      }
    },
    { immediate: true }
  )

  // Cleanup on unmount
  onUnmounted(() => {
    stopAnimation()
  })

  return {
    isPlaying,
    animationDots,
    startAnimation,
    stopAnimation,
    toggleAnimation,
  }
}
