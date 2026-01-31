<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ColorValue, GradientConfig } from '~/types/canvas'
import { getCSSGradient } from '~/composables/useKonvaGradients'

interface Props {
  modelValue: ColorValue
}

interface Emits {
  (e: 'update:modelValue', value: ColorValue): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const isGradientMode = computed(() => typeof props.modelValue !== 'string')
const colorMode = ref<'solid' | 'gradient'>(isGradientMode.value ? 'gradient' : 'solid')

// Preset gradients
const presetGradients: GradientConfig[] = [
  {
    type: 'linear',
    angle: 135,
    stops: [
      { offset: 0, color: '#a855f7' },    // Purple-500
      { offset: 1, color: '#ec4899' }     // Pink-500
    ]
  },
  {
    type: 'linear',
    angle: 135,
    stops: [
      { offset: 0, color: '#3b82f6' },    // Blue-500
      { offset: 1, color: '#8b5cf6' }     // Violet-500
    ]
  },
  {
    type: 'linear',
    angle: 135,
    stops: [
      { offset: 0, color: '#f472b6' },    // Pink-400
      { offset: 1, color: '#fb923c' }     // Orange-400
    ]
  },
  {
    type: 'linear',
    angle: 135,
    stops: [
      { offset: 0, color: '#22d3ee' },    // Cyan-400
      { offset: 1, color: '#6366f1' }     // Indigo-500
    ]
  },
  {
    type: 'linear',
    angle: 135,
    stops: [
      { offset: 0, color: '#10b981' },    // Emerald-500
      { offset: 1, color: '#06b6d4' }     // Cyan-500
    ]
  },
]

// Preset solid colors
const presetColors = [
  '#a855f7',  // Purple
  '#d946ef',  // Fuchsia
  '#ec4899',  // Pink
  '#f472b6',  // Light Pink
  '#8b5cf6',  // Violet
]

const currentSolidColor = computed({
  get: () => typeof props.modelValue === 'string' ? props.modelValue : '#a855f7',
  set: (value: string) => {
    emit('update:modelValue', value)
    colorMode.value = 'solid'
  }
})

const currentGradient = computed({
  get: () => typeof props.modelValue === 'string' 
    ? presetGradients[0] 
    : props.modelValue as GradientConfig,
  set: (value: GradientConfig) => {
    emit('update:modelValue', value)
    colorMode.value = 'gradient'
  }
})

function handleModeChange(mode: 'solid' | 'gradient') {
  colorMode.value = mode
  if (mode === 'solid') {
    // Convert gradient to solid (use first stop color)
    if (typeof props.modelValue !== 'string') {
      const gradient = props.modelValue as GradientConfig
      emit('update:modelValue', gradient.stops[0]?.color || '#a855f7')
    }
  } else {
    // Convert solid to gradient
    if (typeof props.modelValue === 'string') {
      emit('update:modelValue', presetGradients[0])
    }
  }
}

function selectPresetGradient(gradient: GradientConfig) {
  emit('update:modelValue', gradient)
  colorMode.value = 'gradient'
}

function selectPresetColor(color: string) {
  emit('update:modelValue', color)
  colorMode.value = 'solid'
}

function handleGradientAngleChange(angle: number) {
  if (typeof props.modelValue !== 'string') {
    const gradient = { ...props.modelValue as GradientConfig, angle }
    emit('update:modelValue', gradient)
  }
}

function handleGradientStopChange(stopIndex: number, color: string) {
  if (typeof props.modelValue !== 'string') {
    const gradient = { ...props.modelValue as GradientConfig }
    gradient.stops[stopIndex] = { ...gradient.stops[stopIndex], color }
    emit('update:modelValue', gradient)
  }
}
</script>

<template>
  <div class="p-3 space-y-4 min-w-[280px]">
    <!-- Mode Toggle -->
    <div>
      <label class="block text-sm font-medium text-gray-300 mb-2">
        Color Mode
      </label>
      <div class="flex gap-2">
        <button
          :class="[
            'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            colorMode === 'solid'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          ]"
          @click="handleModeChange('solid')"
        >
          Solid
        </button>
        <button
          :class="[
            'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            colorMode === 'gradient'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          ]"
          @click="handleModeChange('gradient')"
        >
          Gradient
        </button>
      </div>
    </div>

    <!-- Solid Color Mode -->
    <template v-if="colorMode === 'solid'">
      <!-- Preset Solid Colors -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Preset Colors
        </label>
        <div class="flex gap-2 flex-wrap">
          <button
            v-for="color in presetColors"
            :key="color"
            :class="[
              'w-8 h-8 rounded-full border-2 transition-all',
              currentSolidColor === color
                ? 'border-white scale-110'
                : 'border-gray-600 hover:border-gray-400'
            ]"
            :style="{ backgroundColor: color }"
            @click="selectPresetColor(color)"
          />
        </div>
      </div>

      <!-- Color Picker -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Custom Color
        </label>
        <UColorPicker
          :model-value="currentSolidColor"
          @update:model-value="currentSolidColor = $event"
        />
      </div>
    </template>

    <!-- Gradient Mode -->
    <template v-else>
      <!-- Preset Gradients -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Preset Gradients
        </label>
        <div class="grid grid-cols-5 gap-2">
          <button
            v-for="(gradient, index) in presetGradients"
            :key="index"
            :class="[
              'h-8 rounded border-2 transition-all relative overflow-hidden',
              JSON.stringify(currentGradient) === JSON.stringify(gradient)
                ? 'border-white scale-105'
                : 'border-gray-600 hover:border-gray-400'
            ]"
            :style="{ background: getCSSGradient(gradient) }"
            @click="selectPresetGradient(gradient)"
          />
        </div>
      </div>

      <!-- Current Gradient Preview -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Preview
        </label>
        <div
          class="h-12 rounded border border-gray-600"
          :style="{ background: getCSSGradient(currentGradient) }"
        />
      </div>

      <!-- Gradient Angle Control -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Angle: {{ currentGradient.angle ?? 135 }}°
        </label>
        <input
          type="range"
          min="0"
          max="360"
          step="15"
          :value="currentGradient.angle ?? 135"
          @input="(e) => handleGradientAngleChange(parseInt((e.target as HTMLInputElement).value))"
          class="w-full"
        />
      </div>

      <!-- Gradient Stops -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Color Stops
        </label>
        <div class="space-y-2">
          <div
            v-for="(stop, index) in currentGradient.stops"
            :key="index"
            class="flex items-center gap-2"
          >
            <div class="flex-1">
              <UColorPicker
                :model-value="stop.color"
                @update:model-value="handleGradientStopChange(index, $event)"
              />
            </div>
            <span class="text-xs text-gray-400 w-12 text-right">
              {{ Math.round(stop.offset * 100) }}%
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
