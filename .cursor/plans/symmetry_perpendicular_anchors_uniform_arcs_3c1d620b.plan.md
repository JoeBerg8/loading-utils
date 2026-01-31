---
name: Symmetry Perpendicular Anchors Uniform Arcs
overview: Update symmetry to place anchors at perpendicular intersection points on shapes and normalize all curve arc magnitudes to be uniform.
todos:
  - id: perpendicular-anchors
    content: Update anchor logic to use perpendicular intersection with other shape
    status: completed
  - id: uniform-arcs
    content: Add curve offset normalization for uniform arc magnitude
    status: completed
isProject: false
---

# Symmetry: Perpendicular Anchors and Uniform Arcs

## Overview

Two changes to `applySymmetry()` in [app/composables/useCanvasState.ts](app/composables/useCanvasState.ts):

1. **Perpendicular anchor points**: Anchors attach where a horizontal or vertical line from the OTHER connected shape intersects the current shape's edge
2. **Uniform arc magnitude**: All curved lines get the same arc distance from the straight line

## 1. Perpendicular Anchor Logic

For a connection between shapes A and B:

- A's anchor: where a horizontal/vertical line from B's center hits A's perimeter
- B's anchor: where a horizontal/vertical line from A's center hits B's perimeter
```
Example: A is left of B (horizontal alignment dominates)

    Shape A          Shape B
    [   ]------>----[   ]
       ^               ^
   right edge      left edge
    (0.25)          (0.75)
```


Replace `getInteriorAnchor` with:

```typescript
// Get anchor position based on perpendicular line from other shape
const getPerpendicularAnchor = (shape: BaseShape, otherShape: BaseShape): number => {
  const shapeCenter = getShapeCenter(shape)
  const otherCenter = getShapeCenter(otherShape)
  const dx = otherCenter.x - shapeCenter.x
  const dy = otherCenter.y - shapeCenter.y
  
  // Use horizontal or vertical line based on dominant direction
  if (Math.abs(dx) > Math.abs(dy)) {
    // Other shape is more horizontal: use left or right edge
    return dx > 0 ? 0.25 : 0.75  // right if other is to right, left if to left
  } else {
    // Other shape is more vertical: use top or bottom edge
    return dy > 0 ? 0.5 : 0      // bottom if other is below, top if above
  }
}

connection.fromAnchor = { position: getPerpendicularAnchor(fromShape, toShape) }
connection.toAnchor = { position: getPerpendicularAnchor(toShape, fromShape) }
```

## 2. Uniform Arc Magnitude

After anchor recalculation, normalize all curved connections to have the same arc magnitude:

```typescript
// 6. Normalize curve offsets to uniform magnitude
const UNIFORM_ARC_DISTANCE = 40  // pixels from the straight line

for (const connection of connections.value) {
  if (connection.curveOffset !== null) {
    const magnitude = Math.sqrt(
      connection.curveOffset.x ** 2 + connection.curveOffset.y ** 2
    )
    if (magnitude > 0) {
      // Normalize to uniform distance while preserving direction
      connection.curveOffset = {
        x: (connection.curveOffset.x / magnitude) * UNIFORM_ARC_DISTANCE,
        y: (connection.curveOffset.y / magnitude) * UNIFORM_ARC_DISTANCE,
      }
    }
  }
}
```

## Files to Modify

- [app/composables/useCanvasState.ts](app/composables/useCanvasState.ts): Update `applySymmetry()` function