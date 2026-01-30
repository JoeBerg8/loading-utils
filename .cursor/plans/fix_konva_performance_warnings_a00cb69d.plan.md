---
name: Fix Konva Performance Warnings
overview: Remove deprecated hitGraphEnabled property and consolidate Konva layers from 7 down to 4 to eliminate performance warnings.
todos:
  - id: remove-hitgraph
    content: "Remove deprecated `hitGraphEnabled: false` from gridLayer config"
    status: completed
  - id: merge-content-layers
    content: Merge linesLayer, shapesLayer, and animationLayer into a single contentLayer
    status: completed
  - id: merge-interaction-layers
    content: Merge connectionPointsLayer and endpointHandlesLayer into a single interactionLayer
    status: completed
isProject: false
---

# Fix Konva Performance Warnings

## Changes in [app/components/CanvasEditor.vue](app/components/CanvasEditor.vue)

### 1. Remove Deprecated `hitGraphEnabled` Property

Remove `hitGraphEnabled: false` from the gridLayer config (line 743). The `listening: false` property already disables hit detection on modern Konva versions.

```vue
<!-- Before -->
<VLayer name="gridLayer" :config="{ listening: false, hitGraphEnabled: false }">

<!-- After -->
<VLayer name="gridLayer" :config="{ listening: false }">
```

### 2. Consolidate Layers (7 to 4)

Merge layers with similar purposes while preserving z-order and interaction behavior:

**New Layer Structure:**

1. **gridLayer** - Background grid (no interaction)
2. **contentLayer** - Lines, shapes, and animation dots

   - Lines rendered first (behind shapes)
   - Shapes rendered second
   - Animation dots rendered last (on top)

3. **interactionLayer** - UI overlay elements

   - Connection point indicators
   - Endpoint handles
   - Curve control handle

4. **guidesLayer** - Alignment guides (no interaction, always on top)

**Implementation approach:**

- Merge `linesLayer`, `shapesLayer`, and `animationLayer` into a single `contentLayer`
- Merge `connectionPointsLayer` and `endpointHandlesLayer` into a single `interactionLayer`
- Keep `gridLayer` and `guidesLayer` unchanged (they serve distinct purposes and are already optimized)

The rendering order within each layer is controlled by component order in the template, so z-ordering is preserved.