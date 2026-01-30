---
name: Fix Alignment Guide Lines
overview: Modify the alignment guide system to ensure guide lines span the entire canvas width/height rather than just the visible viewport, providing continuous alignment feedback across the full horizontal and vertical planes.
todos:
  - id: extend-guides
    content: Add GUIDE_EXTENSION constant and apply it to guide start/end calculations in useAlignmentGuides.ts
    status: completed
isProject: false
---

# Fix Alignment Guides to Span Full Canvas

## Problem

The alignment guide lines only show partially - from a shape toward one edge - instead of spanning the entire canvas plane. When two shapes align, the guide line should extend across the full horizontal or vertical extent of the canvas.

## Root Cause

In [`useAlignmentGuides.ts`](app/composables/useAlignmentGuides.ts), the guide `start` and `end` values are set to `viewportBounds`, which only covers the visible area. For a seamless alignment experience (like Figma/Sketch), the guides should extend well beyond the visible viewport to ensure they appear to span the entire canvas plane.

```88:106:app/composables/useAlignmentGuides.ts
    // Create vertical guides
    for (const x of verticalPositions) {
      alignmentGuides.push({
        type: 'vertical',
        position: x,
        start: viewportBounds.top,
        end: viewportBounds.bottom,
      })
    }

    // Create horizontal guides
    for (const y of horizontalPositions) {
      alignmentGuides.push({
        type: 'horizontal',
        position: y,
        start: viewportBounds.left,
        end: viewportBounds.right,
      })
    }
```

## Solution

Extend the guide lines by a large buffer (e.g., 10,000 pixels in each direction) beyond the viewport bounds. This ensures the lines always appear to span the full canvas regardless of:

- Current viewport position (panning)
- Shape positions
- Canvas zoom level (if added later)

## Changes Required

### 1. Update `useAlignmentGuides.ts`

Add a buffer constant and extend the guide line coordinates:

```typescript
const GUIDE_EXTENSION = 10000 // Extend guides well beyond viewport

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
```

This change ensures:

- Vertical guides span from far above to far below the viewport
- Horizontal guides span from far left to far right of the viewport
- The guides will always appear as full-canvas lines during shape alignment

No changes needed to `CanvasEditor.vue` - the VLine component will handle the extended coordinates correctly, and Konva will clip the rendering to the visible area automatically.