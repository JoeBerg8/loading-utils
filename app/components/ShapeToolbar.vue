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
import SymmetryIcon from './icons/SymmetryIcon.vue'
import PlayIcon from './icons/PlayIcon.vue'
import PauseIcon from './icons/PauseIcon.vue'
import GradientColorPicker from './GradientColorPicker.vue'
import { getCSSGradient } from '~/composables/useKonvaGradients'
import type { ColorValue } from '~/types/canvas'

interface Props {
  currentTool: ToolMode
  selectedColor: ColorValue
  animationConfig: AnimationConfig
  hasConnections: boolean
}

interface Emits {
  (e: 'tool-change', tool: ToolMode): void
  (e: 'color-change', color: ColorValue): void
  (e: 'animation-config-change', config: Partial<AnimationConfig>): void
  (e: 'apply-symmetry'): void
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

function handleColorChange(color: ColorValue) {
  emit('color-change', color)
}

const colorPreviewStyle = computed(() => {
  if (typeof props.selectedColor === 'string') {
    return { backgroundColor: props.selectedColor }
  }
  return { background: getCSSGradient(props.selectedColor) }
})

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

function handleAnimationModeChange(mode: 'dot' | 'snake') {
  emit('animation-config-change', { animationMode: mode })
}

function handleSnakeLengthChange(snakeLength: number) {
  emit('animation-config-change', { snakeLength })
}

function setRotation(direction: 'cw' | 'ccw' | 'off') {
  if (direction === 'off') {
    emit('animation-config-change', { rotationSpeed: 0 })
  } else if (direction === 'cw') {
    // Use current speed if already rotating clockwise, otherwise default to 60 deg/s
    const currentSpeed = props.animationConfig.rotationSpeed
    const newSpeed = currentSpeed > 0 ? currentSpeed : 60
    emit('animation-config-change', { rotationSpeed: newSpeed })
  } else {
    // Counter-clockwise - use negative speed
    const currentSpeed = props.animationConfig.rotationSpeed
    const newSpeed = currentSpeed < 0 ? currentSpeed : -60
    emit('animation-config-change', { rotationSpeed: newSpeed })
  }
}

function handleRotationSpeedChange(speed: number) {
  // Preserve direction (sign) when adjusting speed
  const currentSpeed = props.animationConfig.rotationSpeed
  const direction = currentSpeed < 0 ? -1 : 1
  emit('animation-config-change', { rotationSpeed: speed * direction })
}
</script>

<template>
  <div class="fixed bottom-3 inset-x-0 z-50 flex justify-center pointer-events-none">
    <div class="flex items-center gap-1 px-3 py-2 bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-full shadow-lg pointer-events-auto">
      <!-- Hand/Pan tool -->
      <UTooltip text="Pan" :ui="{ content: 'bg-black text-white' }">
        <button
          :class="[
            'p-2 rounded-lg transition-colors',
            isPanMode
              ? 'bg-blue-900 text-blue-400' 
              : 'hover:bg-gray-800 text-gray-300'
          ]"
          @click="handleHandClick"
        >
          <HandIcon />
        </button>
      </UTooltip>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-600 mx-1" />

      <!-- Shape tools -->
      <UTooltip text="Square" :ui="{ content: 'bg-black text-white' }">
        <button
          :class="[
            'p-2 rounded-lg transition-colors',
            currentTool === 'square'
              ? 'bg-blue-900 text-blue-400'
              : 'hover:bg-gray-800 text-gray-300'
          ]"
          @click="handleToolClick('square')"
        >
          <SquareIcon />
        </button>
      </UTooltip>

      <UTooltip text="Triangle" :ui="{ content: 'bg-black text-white' }">
        <button
          :class="[
            'p-2 rounded-lg transition-colors',
            currentTool === 'triangle'
              ? 'bg-blue-900 text-blue-400'
              : 'hover:bg-gray-800 text-gray-300'
          ]"
          @click="handleToolClick('triangle')"
        >
          <TriangleIcon />
        </button>
      </UTooltip>

      <UTooltip text="Circle" :ui="{ content: 'bg-black text-white' }">
        <button
          :class="[
            'p-2 rounded-lg transition-colors',
            currentTool === 'circle'
              ? 'bg-blue-900 text-blue-400'
              : 'hover:bg-gray-800 text-gray-300'
          ]"
          @click="handleToolClick('circle')"
        >
          <CircleIcon />
        </button>
      </UTooltip>

      <UTooltip text="Line" :ui="{ content: 'bg-black text-white' }">
        <button
          :class="[
            'p-2 rounded-lg transition-colors',
            currentTool === 'line'
              ? 'bg-blue-900 text-blue-400'
              : 'hover:bg-gray-800 text-gray-300'
          ]"
          @click="handleToolClick('line')"
        >
          <LineIcon />
        </button>
      </UTooltip>

      <UTooltip text="Curve" :ui="{ content: 'bg-black text-white' }">
        <button
          :class="[
            'p-2 rounded-lg transition-colors',
            currentTool === 'curved-line'
              ? 'bg-blue-900 text-blue-400'
              : 'hover:bg-gray-800 text-gray-300'
          ]"
          @click="handleToolClick('curved-line')"
        >
          <CurveIcon />
        </button>
      </UTooltip>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-600 mx-1" />

      <!-- Color Picker -->
      <UTooltip text="Color" :ui="{ content: 'bg-black text-white' }">
        <UPopover>
          <button
            class="p-2 rounded-lg transition-colors hover:bg-gray-800"
          >
            <span
              :style="colorPreviewStyle"
              class="block size-5 rounded-full border-2 border-gray-600"
            />
          </button>

          <template #content>
            <GradientColorPicker
              :model-value="selectedColor"
              @update:model-value="handleColorChange"
            />
          </template>
        </UPopover>
      </UTooltip>

      <!-- Paint tool -->
      <UTooltip text="Paint" :ui="{ content: 'bg-black text-white' }">
        <button
          :class="[
            'p-2 rounded-lg transition-colors',
            currentTool === 'paint'
              ? 'bg-blue-900 text-blue-400'
              : 'hover:bg-gray-800 text-gray-300'
          ]"
          @click="handleToolClick('paint')"
        >
          <PaintIcon />
        </button>
      </UTooltip>

      <!-- Delete tool -->
      <UTooltip text="Delete" :ui="{ content: 'bg-black text-white' }">
        <button
          :class="[
            'p-2 rounded-lg transition-colors',
            currentTool === 'delete'
              ? 'bg-red-900 text-red-400'
              : 'hover:bg-gray-800 text-gray-300'
          ]"
          @click="handleToolClick('delete')"
        >
          <TrashIcon />
        </button>
      </UTooltip>

      <!-- Symmetry tool -->
      <UTooltip text="Make Symmetric" :ui="{ content: 'bg-black text-white' }">
        <button
          class="p-2 rounded-lg transition-colors hover:bg-gray-800 text-gray-300"
          @click="$emit('apply-symmetry')"
        >
          <SymmetryIcon />
        </button>
      </UTooltip>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-600 mx-1" />

      <!-- Animation Control -->
      <UTooltip :text="animationConfig.enabled ? 'Pause' : 'Play'" :ui="{ content: 'bg-black text-white' }">
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
          >
            <PlayIcon v-if="!animationConfig.enabled" />
            <PauseIcon v-else />
          </button>

        <template #content>
          <div class="p-3 space-y-4 min-w-[200px]">
            <!-- Animation Mode Toggle -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                Animation Mode
              </label>
              <div class="flex gap-2">
                <button
                  :class="[
                    'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    animationConfig.animationMode === 'dot'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  ]"
                  @click="handleAnimationModeChange('dot')"
                >
                  Dot
                </button>
                <button
                  :class="[
                    'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    animationConfig.animationMode === 'snake'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  ]"
                  @click="handleAnimationModeChange('snake')"
                >
                  Snake
                </button>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                Speed: {{ animationConfig.speed.toFixed(1) }}x
              </label>
              <input
                type="range"
                min="0.25"
                max="6"
                step="0.25"
                :value="animationConfig.speed"
                @input="(e) => handleSpeedChange(parseFloat((e.target as HTMLInputElement).value))"
                class="w-full"
              />
            </div>

            <!-- Dot-specific controls (only show in dot mode) -->
            <template v-if="animationConfig.animationMode === 'dot'">
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
            </template>

            <!-- Snake-specific controls (only show in snake mode) -->
            <template v-if="animationConfig.animationMode === 'snake'">
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">
                  Snake Length: {{ Math.round(animationConfig.snakeLength * 100) }}%
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="0.8"
                  step="0.05"
                  :value="animationConfig.snakeLength"
                  @input="(e) => handleSnakeLengthChange(parseFloat((e.target as HTMLInputElement).value))"
                  class="w-full"
                />
              </div>
            </template>

            <!-- Constellation Rotation Controls -->
            <div class="pt-2 border-t border-gray-700">
              <label class="block text-sm font-medium text-gray-300 mb-2">
                Constellation Rotation
              </label>
              <div class="flex gap-1 mb-2">
                <button
                  :class="[
                    'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    animationConfig.rotationSpeed < 0
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  ]"
                  @click="setRotation('ccw')"
                >
                  CCW
                </button>
                <button
                  :class="[
                    'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    animationConfig.rotationSpeed === 0
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  ]"
                  @click="setRotation('off')"
                >
                  Off
                </button>
                <button
                  :class="[
                    'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    animationConfig.rotationSpeed > 0
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  ]"
                  @click="setRotation('cw')"
                >
                  CW
                </button>
              </div>
              <div v-if="animationConfig.rotationSpeed !== 0">
                <label class="block text-sm font-medium text-gray-300 mb-2">
                  Rotation Speed: {{ Math.abs(animationConfig.rotationSpeed).toFixed(1) }}
                </label>
                <input
                  type="range"
                  min="1"
                  max="180"
                  step="1"
                  :value="Math.abs(animationConfig.rotationSpeed)"
                  @input="(e) => handleRotationSpeedChange(parseFloat((e.target as HTMLInputElement).value))"
                  class="w-full"
                />
              </div>
            </div>
          </div>
        </template>
        </UPopover>
      </UTooltip>
    </div>
  </div>
</template>
