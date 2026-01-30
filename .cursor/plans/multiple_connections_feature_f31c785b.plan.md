---
name: Multiple Connections Feature
overview: Enable multiple line connections between the same two shapes by allowing users to click on specific anchor points when drawing lines, and removing the duplicate connection restriction.
todos:
  - id: update-state-model
    content: Update pendingLineStart to store both shapeId and anchor position
    status: completed
  - id: remove-duplicate-check
    content: Remove duplicate connection prevention in addConnection()
    status: completed
  - id: modify-addConnection
    content: Update addConnection() to accept optional anchor overrides
    status: completed
  - id: add-anchor-click-handler
    content: Add handleAnchorClick() function in useCanvasState for anchor-specific line starts/ends
    status: completed
  - id: make-anchors-clickable
    content: Make anchor point indicators clickable in CanvasEditor.vue
    status: completed
  - id: update-shape-click
    content: Update handleShapeClick to detect nearby anchors and route to anchor handler
    status: completed
isProject: false
---

# Multiple Connections Between Shapes

## Problem

Currently, the `addConnection()` function in [`useCanvasState.ts`](app/composables/useCanvasState.ts) blocks any new connection between shapes that already have one, due to a duplicate prevention check at lines 273-277.

## Solution Overview

Allow users to click on specific anchor points when in line/curved-line mode, giving precise control over connection endpoints. Remove the blanket duplicate prevention.

## Key Changes

### 1. Update State Model

In [`useCanvasState.ts`](app/composables/useCanvasState.ts):

- Change `pendingLineStart` from `string | null` to store both shape ID and anchor:
```typescript
interface PendingLineStart {
  shapeId: string
  anchor: ConnectionAnchor
}
const pendingLineStart = ref<PendingLineStart | null>(null)
```


### 2. Remove Duplicate Prevention

In `addConnection()` function, remove lines 273-277 that prevent connections between already-connected shapes.

### 3. Modify Connection Creation

Update `addConnection()` to accept optional anchor parameters:

```typescript
function addConnection(
  fromShapeId: string,
  toShapeId: string,
  fromAnchorOverride?: ConnectionAnchor,
  toAnchorOverride?: ConnectionAnchor
)
```

Use overrides when provided, fall back to auto-calculation otherwise.

### 4. Update Click Handling

In [`CanvasEditor.vue`](app/components/CanvasEditor.vue):

- When clicking to start a line, detect if near an anchor point and store that anchor
- Make anchor point indicators clickable (not just visual)
- Add new handler `handleAnchorClick(shapeId, anchor)` for starting/ending lines from specific anchors

### 5. Visual Feedback

- Show anchor points on hovered shape (already implemented)
- Highlight the specific anchor being targeted when cursor is near
- Keep anchor points visible on pending line start shape

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant CanvasEditor
    participant useCanvasState
    
    User->>CanvasEditor: Click anchor on Shape A
    CanvasEditor->>useCanvasState: handleAnchorClick(shapeA, anchor1)
    useCanvasState->>useCanvasState: Set pendingLineStart = {shapeId: A, anchor: anchor1}
    
    User->>CanvasEditor: Click anchor on Shape B
    CanvasEditor->>useCanvasState: handleAnchorClick(shapeB, anchor2)
    useCanvasState->>useCanvasState: addConnection(A, B, anchor1, anchor2)
    useCanvasState->>useCanvasState: Set pendingLineStart = {shapeId: B, anchor: anchor2}
```

## Files to Modify

- [`app/composables/useCanvasState.ts`](app/composables/useCanvasState.ts) - State management and connection logic
- [`app/components/CanvasEditor.vue`](app/components/CanvasEditor.vue) - Click handling and anchor interaction
- [`app/types/canvas.ts`](app/types/canvas.ts) - Add `PendingLineStart` interface (optional, can be inline)