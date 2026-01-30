<script setup lang="ts">
import { provide, computed } from 'vue'
import { useCanvasState } from '~/composables/useCanvasState'

const canvasState = useCanvasState()
const { currentTool, setTool } = canvasState

// Provide the canvas state to child components
provide('canvasState', canvasState)

// Computed property to expose selectedColor for template
const selectedColor = computed({
  get: () => canvasState.selectedColor.value,
  set: (value: string) => {
    canvasState.selectedColor.value = value
  }
})

function handleToolChange(tool: Parameters<typeof setTool>[0]) {
  setTool(tool)
}

function handleColorChange(color: string) {
  selectedColor.value = color
}
</script>

<template>
  <div class="w-full h-full">
    <CanvasEditor />
    <ShapeToolbar
      :current-tool="currentTool"
      :selected-color="selectedColor"
      @tool-change="handleToolChange"
      @color-change="handleColorChange"
    />
  </div>
</template>
