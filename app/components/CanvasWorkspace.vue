<script setup lang="ts">
import { provide, computed, ref } from 'vue'
import { useCanvasState } from '~/composables/useCanvasState'
import type { AnimationConfig, ColorValue } from '~/types/canvas'

const canvasState = useCanvasState()
const { currentTool, setTool, connections } = canvasState

// Provide the canvas state to child components
provide('canvasState', canvasState)

// Computed property to expose selectedColor for template
const selectedColor = computed({
  get: () => canvasState.selectedColor.value,
  set: (value: ColorValue) => {
    canvasState.selectedColor.value = value
  }
})

// Animation configuration
const animationConfig = ref<AnimationConfig>({
  enabled: false,
  speed: 1.0,
  animationMode: 'dot',
  dotSize: 8,
  dotColor: '#d946ef',  // Fuchsia-500
  snakeLength: 0.3,
  rotationSpeed: 0,  // Default: no rotation
})

// Provide animation config as a getter function for reactivity
provide('animationConfig', () => animationConfig.value)

// Computed to check if connections exist
const hasConnections = computed(() => connections.value.length > 0)

function handleToolChange(tool: Parameters<typeof setTool>[0]) {
  setTool(tool)
}

function handleColorChange(color: ColorValue) {
  selectedColor.value = color
}

function handleAnimationConfigChange(config: Partial<AnimationConfig>) {
  Object.assign(animationConfig.value, config)
}

function handleApplySymmetry() {
  canvasState.applySymmetry()
}
</script>

<template>
  <div class="w-full h-full">
    <CanvasEditor />
    <ShapeToolbar
      :current-tool="currentTool"
      :selected-color="selectedColor"
      :animation-config="animationConfig"
      :has-connections="hasConnections"
      @tool-change="handleToolChange"
      @color-change="handleColorChange"
      @animation-config-change="handleAnimationConfigChange"
      @apply-symmetry="handleApplySymmetry"
    />
  </div>
</template>
