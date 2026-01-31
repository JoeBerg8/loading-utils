import { ref, onUnmounted, watch } from 'vue'
import type { Connection, BaseShape, AnimationConfig, ColorValue } from '~/types/canvas'
import { getAnchorPosition } from './useCanvasState'

export interface AnimationDot {
  connectionId: string
  x: number
  y: number
  progress: number
}

export interface SnakeSegment {
  points: number[]  // [x1, y1, x2, y2, ...] for the visible line (sampled points)
  stroke: ColorValue  // Color from the connection
}

interface CircuitSegment {
  type: 'connection' | 'transition'
  // For connection segments
  connection?: Connection
  reversed?: boolean  // true if we traverse this connection backward
  // For transition segments
  shape?: BaseShape
  fromAnchor?: number  // normalized 0-1 position along perimeter
  toAnchor?: number    // normalized 0-1 position along perimeter
  // Common
  startDistance: number
  endDistance: number
}

export function usePathAnimation(
  connections: () => Connection[],
  shapes: () => BaseShape[],
  config: () => AnimationConfig
) {
  const isPlaying = ref(false)
  // Use ref for animation state
  const animationDots = ref<AnimationDot[]>([])
  const snakeSegment = ref<SnakeSegment | null>(null)
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

  // Get point on shape perimeter at normalized position (0-1)
  function getPointOnShapePerimeter(shape: BaseShape, anchorPosition: number): { x: number; y: number } {
    // Reuse the anchor position logic from useCanvasState
    return getAnchorPosition(shape, { position: anchorPosition })
  }

  // Calculate transition length - straight line distance between two anchor positions
  function calculateTransitionLength(shape: BaseShape, fromAnchor: number, toAnchor: number): number {
    // Get actual pixel positions and calculate straight line distance
    const fromPoint = getPointOnShapePerimeter(shape, fromAnchor)
    const toPoint = getPointOnShapePerimeter(shape, toAnchor)
    const dx = toPoint.x - fromPoint.x
    const dy = toPoint.y - fromPoint.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Smooth ease-in-out cubic function for transitions
  // Creates smooth acceleration at start and deceleration at end
  function easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2
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

  // Helper to get exit anchor position for a connection segment
  function getExitAnchor(connection: Connection, reversed: boolean): { shapeId: string; anchor: number | null } {
    if (reversed) {
      return {
        shapeId: connection.fromShapeId,
        anchor: connection.fromAnchor ? connection.fromAnchor.position : null,
      }
    } else {
      return {
        shapeId: connection.toShapeId,
        anchor: connection.toAnchor ? connection.toAnchor.position : null,
      }
    }
  }

  // Helper to get entry anchor position for a connection
  function getEntryAnchor(connection: Connection, reversed: boolean): { shapeId: string; anchor: number | null } {
    if (reversed) {
      return {
        shapeId: connection.toShapeId,
        anchor: connection.toAnchor ? connection.toAnchor.position : null,
      }
    } else {
      return {
        shapeId: connection.fromShapeId,
        anchor: connection.fromAnchor ? connection.fromAnchor.position : null,
      }
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
        type: 'connection',
        connection,
        reversed: false,
        startDistance: 0,
        endDistance: length,
      }]
    }

    const segments: CircuitSegment[] = []
    const usedConnections = new Set<string>()
    let currentShapeId: string | null = null
    let currentExitAnchor: number | null = null
    let cumulativeDistance = 0

    // Start with the first connection
    const firstConnection = connectionsList[0]
    usedConnections.add(firstConnection.id)
    const firstLength = calculatePathLength(firstConnection)
    const firstExit = getExitAnchor(firstConnection, false)
    segments.push({
      type: 'connection',
      connection: firstConnection,
      reversed: false,
      startDistance: cumulativeDistance,
      endDistance: cumulativeDistance + firstLength,
    })
    cumulativeDistance += firstLength
    currentShapeId = firstExit.shapeId
    currentExitAnchor = firstExit.anchor

    // Continue building the path by finding connections that share endpoints
    while (usedConnections.size < connectionsList.length) {
      let foundNext = false

      // Try to find a connection that continues from currentShapeId
      for (const connection of connectionsList) {
        if (usedConnections.has(connection.id)) continue

        let nextConnection: Connection | null = null
        let nextReversed = false

        // Check if this connection starts at current shape (forward)
        if (connection.fromShapeId === currentShapeId) {
          nextConnection = connection
          nextReversed = false
        }
        // Check if this connection ends at current shape (reverse)
        else if (connection.toShapeId === currentShapeId) {
          nextConnection = connection
          nextReversed = true
        }

        if (nextConnection) {
          usedConnections.add(nextConnection.id)
          const entryAnchor = getEntryAnchor(nextConnection, nextReversed)

          // Check if we need a transition segment
          if (currentExitAnchor !== null && entryAnchor.anchor !== null && currentExitAnchor !== entryAnchor.anchor) {
            // Need a transition along the shape perimeter
            const shape = shapes().find(s => s.id === currentShapeId!)
            if (shape) {
              // Store anchors in original order - interpolation will choose shorter path
              const fromAnchor = currentExitAnchor
              const toAnchor = entryAnchor.anchor
              
              // Calculate transition length (always uses shorter path)
              const transitionLength = calculateTransitionLength(shape, fromAnchor!, toAnchor!)
              
              segments.push({
                type: 'transition',
                shape,
                fromAnchor: fromAnchor!,
                toAnchor: toAnchor!,
                startDistance: cumulativeDistance,
                endDistance: cumulativeDistance + transitionLength,
              })
              cumulativeDistance += transitionLength
            }
          }

          // Add the connection segment
          const length = calculatePathLength(nextConnection)
          const exitAnchor = getExitAnchor(nextConnection, nextReversed)
          segments.push({
            type: 'connection',
            connection: nextConnection,
            reversed: nextReversed,
            startDistance: cumulativeDistance,
            endDistance: cumulativeDistance + length,
          })
          cumulativeDistance += length
          currentShapeId = exitAnchor.shapeId
          currentExitAnchor = exitAnchor.anchor
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
          const exitAnchor = getExitAnchor(connection, false)
          segments.push({
            type: 'connection',
            connection,
            reversed: false,
            startDistance: cumulativeDistance,
            endDistance: cumulativeDistance + length,
          })
          cumulativeDistance += length
          currentShapeId = exitAnchor.shapeId
          currentExitAnchor = exitAnchor.anchor
          foundNext = true
          break
        }
      }

      // If still nothing found, break (disconnected segments)
      if (!foundNext) break
    }

    return segments
  }

  // Get point on circuit at a specific distance
  function getPointOnCircuit(circuit: CircuitSegment[], distance: number): { x: number; y: number; connectionId: string } | null {
    const totalLength = circuit[circuit.length - 1]?.endDistance || 0
    if (totalLength === 0) return null

    // Normalize distance to handle wrap-around
    const normalizedDistance = ((distance % totalLength) + totalLength) % totalLength

    // Find which segment contains this distance
    const segment = circuit.find(s => 
      normalizedDistance >= s.startDistance && 
      normalizedDistance < s.endDistance
    ) || circuit[circuit.length - 1]

    // Calculate position within that segment
    const segmentLength = segment.endDistance - segment.startDistance
    const segmentProgress = segmentLength > 0
      ? (normalizedDistance - segment.startDistance) / segmentLength
      : 0

    const clampedProgress = Math.max(0, Math.min(1, segmentProgress))

    let point: { x: number; y: number } | null = null
    let connectionId: string | null = null

    if (segment.type === 'connection' && segment.connection) {
      point = getPointOnPath(segment.connection, clampedProgress, segment.reversed || false)
      connectionId = segment.connection.id
    } else if (segment.type === 'transition' && segment.shape && segment.fromAnchor !== undefined && segment.toAnchor !== undefined) {
      const segmentIndex = circuit.indexOf(segment)
      const prevSegment = segmentIndex > 0 ? circuit[segmentIndex - 1] : null
      connectionId = prevSegment?.type === 'connection' && prevSegment.connection ? prevSegment.connection.id : 'transition'
      
      const easedProgress = easeInOutCubic(clampedProgress)
      const fromPoint = getPointOnShapePerimeter(segment.shape, segment.fromAnchor)
      const toPoint = getPointOnShapePerimeter(segment.shape, segment.toAnchor)
      const center = getShapeCenter(segment.shape)
      point = getPointOnCurve(fromPoint, center, toPoint, easedProgress)
    }

    if (point && connectionId) {
      return { x: point.x, y: point.y, connectionId }
    }

    return null
  }

  // Generate snake segment points between tail and head distances
  function generateSnakeSegment(
    circuit: CircuitSegment[],
    tailDistance: number,
    headDistance: number,
    connectionsList: Connection[]
  ): SnakeSegment | null {
    const totalLength = circuit[circuit.length - 1]?.endDistance || 0
    if (totalLength === 0) return null

    const snakeLength = config().snakeLength
    const snakeDistance = snakeLength * totalLength

    // Normalize distances
    const normalizedTail = ((tailDistance % totalLength) + totalLength) % totalLength
    const normalizedHead = ((headDistance % totalLength) + totalLength) % totalLength

    // Sample points along the snake path
    const samples = 30 // Number of points to sample
    const points: number[] = []
    let lastConnectionId: string | null = null

    // Check if snake wraps around
    const wrapsAround = normalizedHead < normalizedTail

    if (wrapsAround) {
      // Snake wraps around - need two segments
      // First segment: from tail to end of circuit
      for (let i = 0; i <= samples / 2; i++) {
        const t = i / (samples / 2)
        const distance = normalizedTail + (totalLength - normalizedTail) * t
        const point = getPointOnCircuit(circuit, distance)
        if (point) {
          points.push(point.x, point.y)
          lastConnectionId = point.connectionId
        }
      }
      // Second segment: from start to head
      for (let i = 0; i <= samples / 2; i++) {
        const t = i / (samples / 2)
        const distance = normalizedHead * t
        const point = getPointOnCircuit(circuit, distance)
        if (point) {
          points.push(point.x, point.y)
          lastConnectionId = point.connectionId
        }
      }
    } else {
      // Normal case: single segment from tail to head
      for (let i = 0; i <= samples; i++) {
        const t = i / samples
        const distance = normalizedTail + (normalizedHead - normalizedTail) * t
        const point = getPointOnCircuit(circuit, distance)
        if (point) {
          points.push(point.x, point.y)
          lastConnectionId = point.connectionId
        }
      }
    }

    if (points.length < 4) return null // Need at least 2 points

    // Get connection for stroke color
    const connection = lastConnectionId ? connectionsList.find(c => c.id === lastConnectionId) : null
    const stroke: ColorValue = connection?.stroke || '#d946ef'

    return {
      points,
      stroke,
    }
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
      snakeSegment.value = null
      animationFrameId = requestAnimationFrame(animate)
      return
    }

    // Build circuit path
    const circuit = buildCircuit(connectionsList)
    if (circuit.length === 0) {
      animationDots.value = []
      snakeSegment.value = null
      animationFrameId = requestAnimationFrame(animate)
      return
    }

    // Calculate total circuit length
    const totalLength = circuit[circuit.length - 1]?.endDistance || 0
    if (totalLength === 0) {
      animationDots.value = []
      snakeSegment.value = null
      animationFrameId = requestAnimationFrame(animate)
      return
    }

    // Calculate duration based on total path length
    const baseDuration = 2000 // 2 seconds base
    const avgPathLength = 200
    const speedMultiplier = config().speed || 1
    const duration = (baseDuration * (totalLength / avgPathLength)) / speedMultiplier

    // Single progress through entire circuit
    const elapsed = now - startTime!
    const progress = (elapsed % duration) / duration
    const distanceAlongCircuit = progress * totalLength

    const animationMode = config().animationMode || 'dot'

    if (animationMode === 'snake') {
      // Snake mode: calculate snake segment
      const snakeLength = config().snakeLength || 0.3
      const snakeDistance = snakeLength * totalLength
      const tailDistance = distanceAlongCircuit - snakeDistance
      const headDistance = distanceAlongCircuit

      const segment = generateSnakeSegment(circuit, tailDistance, headDistance, connectionsList)
      snakeSegment.value = segment
      animationDots.value = [] // Clear dots in snake mode
    } else {
      // Dot mode: calculate dot position
      snakeSegment.value = null // Clear snake in dot mode

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

      // Get point on the segment based on type
      let point: { x: number; y: number } | null = null
      let connectionId: string | null = null

      if (segment.type === 'connection' && segment.connection) {
        // Connection segment - use existing path calculation
        point = getPointOnPath(segment.connection, clampedProgress, segment.reversed || false)
        connectionId = segment.connection.id
      } else if (segment.type === 'transition' && segment.shape && segment.fromAnchor !== undefined && segment.toAnchor !== undefined) {
        // Transition segment - smooth curved path through the shape with easing
        // Find the previous connection segment to get its ID
        const segmentIndex = circuit.indexOf(segment)
        const prevSegment = segmentIndex > 0 ? circuit[segmentIndex - 1] : null
        connectionId = prevSegment?.type === 'connection' && prevSegment.connection ? prevSegment.connection.id : 'transition'
        
        // Apply easing to create smooth acceleration/deceleration
        const easedProgress = easeInOutCubic(clampedProgress)
        
        // Get the actual pixel positions for from and to anchors
        const fromPoint = getPointOnShapePerimeter(segment.shape, segment.fromAnchor)
        const toPoint = getPointOnShapePerimeter(segment.shape, segment.toAnchor)
        
        // Use quadratic bezier curve through shape center for natural arc
        const center = getShapeCenter(segment.shape)
        point = getPointOnCurve(fromPoint, center, toPoint, easedProgress)
      }
      
      const newDots: AnimationDot[] = []
      if (point && connectionId) {
        newDots.push({
          connectionId,
          x: point.x,
          y: point.y,
          progress: clampedProgress,
        })
      }

      // Assign new array to trigger reactivity
      animationDots.value = newDots
    }

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
    snakeSegment.value = null
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
    snakeSegment,
    startAnimation,
    stopAnimation,
    toggleAnimation,
  }
}
