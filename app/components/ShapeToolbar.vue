<script setup lang="ts">
import { computed } from 'vue'
import type { ToolMode, AnimationConfig } from '~/types/canvas'
import HandIcon from './icons/HandIcon.vue'
import SquareIcon from './icons/SquareIcon.vue'
import TriangleIcon from './icons/TriangleIcon.vue'
import CircleIcon from './icons/CircleIcon.vue'
import LineIcon from './icons/LineIcon.vue'
import CurveIcon from './icons/CurveIcon.vue'
import TrashIcon from './icons/TrashIcon.vue'
import PaintIcon from './icons/PaintIcon.vue'
import PlayIcon from './icons/PlayIcon.vue'
import PauseIcon from './icons/PauseIcon.vue'

interface Props {
  currentTool: ToolMode
  selectedColor: string
  animationConfig: AnimationConfig
  hasConnections: boolean
}

interface Emits {
  (e: 'tool-change', tool: ToolMode): void
  (e: 'color-change', color: string): void
  (e: 'animation-config-change', config: Partial<AnimationConfig>): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const isPanMode = computed(() => props.currentTool === 'pan')

function handleHandClick() {
  // Toggle pan mode on/off
  emit('tool-change', isPanMode.value ? 'square' : 'pan')
}

function handleToolClick(tool: ToolMode) {
  emit('tool-change', tool)
}

function handleColorChange(color: string) {
  emit('color-change', color)
}

function toggleAnimation() {
  emit('animation-config-change', { enabled: !props.animationConfig.enabled })
}

function handleSpeedChange(speed: number) {
  emit('animation-config-change', { speed })
}

function handleDotSizeChange(dotSize: number) {
  emit('animation-config-change', { dotSize })
}

function handleDotColorChange(dotColor: string) {
  emit('animation-config-change', { dotColor })
}
</script>

<template>
  <div class="fixed bottom-3 inset-x-0 z-50 flex justify-center pointer-events-none">
    <div class="flex items-center gap-1 px-3 py-2 bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-full shadow-lg pointer-events-auto">
      <!-- Hand/Pan tool -->
      <button
        :class="[
          'p-2 rounded-lg transition-colors',
          isPanMode
            ? 'bg-blue-900 text-blue-400' 
            : 'hover:bg-gray-800 text-gray-300'
        ]"
        @click="handleHandClick"
        :title="isPanMode ? 'Pan mode (click to exit)' : 'Pan mode (click to pan canvas)'"
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

      <button
        :class="[
          'p-2 rounded-lg transition-colors',
          currentTool === 'curved-line'
            ? 'bg-blue-900 text-blue-400'
            : 'hover:bg-gray-800 text-gray-300'
        ]"
        @click="handleToolClick('curved-line')"
        title="Curved line (connect shapes with arc)"
      >
        <CurveIcon />
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

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-600 mx-1" />

      <!-- Animation Control -->
      <UPopover>
        <button
          :class="[
            'p-2 rounded-lg transition-colors',
            animationConfig.enabled
              ? 'bg-green-900 text-green-400'
              : 'hover:bg-gray-800 text-gray-300'
          ]"
          :disabled="!hasConnections"
          @click="toggleAnimation"
          :title="animationConfig.enabled ? 'Pause animation' : 'Play animation'"
        >
          <PlayIcon v-if="!animationConfig.enabled" />
          <PauseIcon v-else />
        </button>

        <template #content>
          <div class="p-3 space-y-4 min-w-[200px]">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                Speed: {{ animationConfig.speed.toFixed(1) }}x
              </label>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                :value="animationConfig.speed"
                @input="(e) => handleSpeedChange(parseFloat((e.target as HTMLInputElement).value))"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                Dot Size: {{ animationConfig.dotSize }}px
              </label>
              <input
                type="range"
                min="4"
                max="16"
                step="1"
                :value="animationConfig.dotSize"
                @input="(e) => handleDotSizeChange(parseInt((e.target as HTMLInputElement).value))"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                Dot Color
              </label>
              <UColorPicker
                :model-value="animationConfig.dotColor"
                @update:model-value="handleDotColorChange"
              />
            </div>
          </div>
        </template>
      </UPopover>
    </div>
  </div>
</template>
