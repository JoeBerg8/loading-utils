---
name: Single Circuit Animation Dot
overview: Modify the path animation to trace a single dot through the entire connected circuit instead of animating one dot per connection.
todos:
  - id: build-circuit
    content: Add buildCircuit() function to order connections into a traversable path
    status: completed
  - id: calc-distances
    content: Calculate cumulative distances for each segment in the circuit
    status: completed
  - id: single-dot
    content: Update animate() to render one dot traversing the entire circuit
    status: completed
  - id: handle-reverse
    content: Handle reversed direction when dot enters a connection from the 'to' end
    status: completed
isProject: false
---

# Single Circuit Animation Dot

## Problem

The current implementation in [`usePathAnimation.ts`](app/composables/usePathAnimation.ts) iterates over each connection independently and creates a separate animated dot for each:

```128:163:app/composables/usePathAnimation.ts
  function animate() {
    // ...
    connectionsList.forEach((connection) => {
      // Each connection gets its own dot with independent progress
      const progress = (elapsed % duration) / duration
      newDots.push({
        connectionId: connection.id,
        x: point.x,
        y: point.y,
        progress,
      })
    })
  }
```

This results in 3 separate dots (one per line segment) instead of 1 dot completing the circuit.

## Solution

Refactor the animation logic to:

1. **Build a circuit path** - Order connections to form a continuous path by following which shape connects to which
2. **Calculate cumulative lengths** - Track the total path length and each segment's start/end position within it
3. **Single dot progression** - Use one progress value for the entire circuit and determine which segment the dot is on

## Implementation

### Step 1: Add circuit building function

Add a helper function that orders connections into a traversable circuit:

- Start from any connection
- Find the next connection that shares a shape endpoint
- Continue until circuit closes or no more connections
```typescript
interface CircuitSegment {
  connection: Connection
  reversed: boolean  // true if we traverse this connection backward
  startDistance: number
  endDistance: number
}

function buildCircuit(connectionsList: Connection[]): CircuitSegment[]
```


### Step 2: Update animate() function

Replace the per-connection loop with circuit-based logic:

```typescript
function animate() {
  const circuit = buildCircuit(connectionsList)
  const totalLength = circuit[circuit.length - 1]?.endDistance || 0
  
  // Single progress through entire circuit
  const duration = (baseDuration * (totalLength / avgPathLength)) / speedMultiplier
  const elapsed = now - startTime!
  const progress = (elapsed % duration) / duration
  const distanceAlongCircuit = progress * totalLength
  
  // Find which segment contains this distance
  const segment = circuit.find(s => 
    distanceAlongCircuit >= s.startDistance && 
    distanceAlongCircuit < s.endDistance
  )
  
  // Calculate position within that segment
  // Account for reversed direction if needed
  const segmentProgress = (distanceAlongCircuit - segment.startDistance) / 
    (segment.endDistance - segment.startDistance)
  
  // Return single dot
  animationDots.value = [{ /* single dot */ }]
}
```

### Step 3: Handle direction

When traversing a connection in reverse (the "from" shape is actually where we're going to), flip the progress (use `1 - t` instead of `t`).

## Files to Modify

- [`app/composables/usePathAnimation.ts`](app/composables/usePathAnimation.ts) - Main animation logic changes

## Edge Cases

- **Disconnected segments**: If connections don't form a complete circuit, animate through as many connected segments as possible, then loop back
- **Single connection**: Works as before with one dot on one line
- **No connections**: No dots rendered (existing behavior)