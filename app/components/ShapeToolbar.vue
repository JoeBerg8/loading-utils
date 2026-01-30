<script setup lang="ts">
import { computed } from 'vue'
import type { ToolMode } from '~/types/canvas'
import HandIcon from './icons/HandIcon.vue'
import SquareIcon from './icons/SquareIcon.vue'
import TriangleIcon from './icons/TriangleIcon.vue'
import CircleIcon from './icons/CircleIcon.vue'
import LineIcon from './icons/LineIcon.vue'
import TrashIcon from './icons/TrashIcon.vue'
import PaintIcon from './icons/PaintIcon.vue'

interface Props {
  currentTool: ToolMode
  selectedColor: string
}

interface Emits {
  (e: 'tool-change', tool: ToolMode): void
  (e: 'color-change', color: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const isPanMode = computed(() => props.currentTool === 'pan')
const isSelectMode = computed(() => props.currentTool === 'select')

function handleHandClick() {
  // Toggle between pan and select
  emit('tool-change', isSelectMode.value ? 'pan' : 'select')
}

function handleToolClick(tool: ToolMode) {
  emit('tool-change', tool)
}

function handleColorChange(color: string) {
  emit('color-change', color)
}
</script>

<template>
  <div class="fixed bottom-3 inset-x-0 z-50 flex justify-center pointer-events-none">
    <div class="flex items-center gap-1 px-3 py-2 bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-full shadow-lg pointer-events-auto">
      <!-- Hand/Pan tool -->
      <button
        :class="[
          'p-2 rounded-lg transition-colors',
          (isPanMode || isSelectMode) 
            ? 'bg-blue-900 text-blue-400' 
            : 'hover:bg-gray-800 text-gray-300'
        ]"
        @click="handleHandClick"
        :title="isSelectMode ? 'Select mode (click to pan)' : 'Pan mode (click to select)'"
      >
        <HandIcon />
      </button>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-600 mx-1" />

      <!-- Shape tools -->
      <button
        :class="[
          'p-2 rounded-lg transition-colors',
          currentTool === 'square'
            ? 'bg-blue-900 text-blue-400'
            : 'hover:bg-gray-800 text-gray-300'
        ]"
        @click="handleToolClick('square')"
        title="Square"
      >
        <SquareIcon />
      </button>

      <button
        :class="[
          'p-2 rounded-lg transition-colors',
          currentTool === 'triangle'
            ? 'bg-blue-900 text-blue-400'
            : 'hover:bg-gray-800 text-gray-300'
        ]"
        @click="handleToolClick('triangle')"
        title="Triangle"
      >
        <TriangleIcon />
      </button>

      <button
        :class="[
          'p-2 rounded-lg transition-colors',
          currentTool === 'circle'
            ? 'bg-blue-900 text-blue-400'
            : 'hover:bg-gray-800 text-gray-300'
        ]"
        @click="handleToolClick('circle')"
        title="Circle"
      >
        <CircleIcon />
      </button>

      <button
        :class="[
          'p-2 rounded-lg transition-colors',
          currentTool === 'line'
            ? 'bg-blue-900 text-blue-400'
            : 'hover:bg-gray-800 text-gray-300'
        ]"
        @click="handleToolClick('line')"
        title="Line (connect shapes)"
      >
        <LineIcon />
      </button>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-600 mx-1" />

      <!-- Color Picker -->
      <UPopover>
        <button
          class="p-2 rounded-lg transition-colors hover:bg-gray-800"
          title="Choose color"
        >
          <span
            :style="{ backgroundColor: selectedColor }"
            class="block size-5 rounded-full border-2 border-gray-600"
          />
        </button>

        <template #content>
          <UColorPicker
            :model-value="selectedColor"
            @update:model-value="handleColorChange"
            class="p-2"
          />
        </template>
      </UPopover>

      <!-- Paint tool -->
      <button
        :class="[
          'p-2 rounded-lg transition-colors',
          currentTool === 'paint'
            ? 'bg-blue-900 text-blue-400'
            : 'hover:bg-gray-800 text-gray-300'
        ]"
        @click="handleToolClick('paint')"
        title="Paint (click shapes to change color)"
      >
        <PaintIcon />
      </button>

      <!-- Delete tool -->
      <button
        :class="[
          'p-2 rounded-lg transition-colors',
          currentTool === 'delete'
            ? 'bg-red-900 text-red-400'
            : 'hover:bg-gray-800 text-gray-300'
        ]"
        @click="handleToolClick('delete')"
        title="Delete (click shapes to remove)"
      >
        <TrashIcon />
      </button>
    </div>
  </div>
</template>
