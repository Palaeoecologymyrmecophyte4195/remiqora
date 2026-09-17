<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChannelSettings } from '../../audio/mixerEngine'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    modelValue: ChannelSettings
    label: string
    showPanMuteSolo?: boolean
    level?: number
    clipping?: boolean
  }>(),
  {
    showPanMuteSolo: false,
    level: 0,
    clipping: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: ChannelSettings]
  reset: []
}>()

function field<K extends keyof ChannelSettings>(key: K) {
  return computed<ChannelSettings[K]>({
    get: () => props.modelValue[key],
    set: (v) => emit('update:modelValue', { ...props.modelValue, [key]: v }),
  })
}

const volume = field('volume')
const pan = field('pan')
const muted = field('muted')
const solo = field('solo')

const eqLow = computed({
  get: () => props.modelValue.eq.low,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, eq: { ...props.modelValue.eq, low: v } }),
})
const eqMid = computed({
  get: () => props.modelValue.eq.mid,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, eq: { ...props.modelValue.eq, mid: v } }),
})
const eqHigh = computed({
  get: () => props.modelValue.eq.high,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, eq: { ...props.modelValue.eq, high: v } }),
})
const compThreshold = computed({
  get: () => props.modelValue.comp.threshold,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, comp: { ...props.modelValue.comp, threshold: v } }),
})
const compRatio = computed({
  get: () => props.modelValue.comp.ratio,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, comp: { ...props.modelValue.comp, ratio: v } }),
})
const reverbMix = computed({
  get: () => props.modelValue.reverb.mix,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, reverb: { ...props.modelValue.reverb, mix: v } }),
})

const effectsExpanded = ref(false)
</script>

<template>
  <div class="space-y-2 rounded-lg border border-border bg-panel-2 p-2.5">
    <div class="flex items-center justify-between">
      <p class="text-xs font-medium text-text">{{ label }}</p>
      <div class="flex items-center gap-1.5">
        <template v-if="showPanMuteSolo">
          <button
            type="button"
            class="rounded px-1.5 py-0.5 text-[10px] font-medium"
            :class="muted ? 'bg-status-failed text-white' : 'bg-panel text-text-dim'"
            @click="muted = !muted"
          >
            M
          </button>
          <button
            type="button"
            class="rounded px-1.5 py-0.5 text-[10px] font-medium"
            :class="solo ? 'accent-gradient text-white' : 'bg-panel text-text-dim'"
            @click="solo = !solo"
          >
            S
          </button>
        </template>
        <button type="button" class="text-[10px] text-text-dim hover:underline" @click="emit('reset')">{{ t('common.reset') }}</button>
      </div>
    </div>

    <div class="space-y-1">
      <div class="flex items-center justify-between text-[10px] text-text-dim">
        <span>{{ t('channelStrip.volume', { value: Math.round(volume * 100) }) }}</span>
        <span
          v-if="clipping"
          class="rounded bg-status-failed px-1 py-0.2 text-[9px] font-bold text-white uppercase tracking-wider animate-pulse"
        >
          CLIP
        </span>
      </div>
      <input v-model.number="volume" type="range" min="0" max="1.5" step="0.01" class="w-full accent-current" />
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-panel">
        <div
          class="h-full transition-all duration-75 ease-out"
          :class="clipping ? 'bg-status-failed' : (level ?? 0) > 0.85 ? 'bg-amber-400' : 'bg-accent'"
          :style="{ width: `${Math.min(100, Math.round((level ?? 0) * 100))}%` }"
        />
      </div>
    </div>

    <label v-if="showPanMuteSolo" class="block text-[10px] text-text-dim">
      {{ t('channelStrip.pan', { value: pan.toFixed(2) }) }}
      <input v-model.number="pan" type="range" min="-1" max="1" step="0.01" class="w-full accent-current" />
    </label>

    <button
      type="button"
      class="flex w-full items-center justify-between text-[10px] text-text-dim hover:text-text"
      @click="effectsExpanded = !effectsExpanded"
    >
      <span>{{ t('channelStrip.effects') }}</span>
      <span aria-hidden="true">{{ effectsExpanded ? '▾' : '▸' }}</span>
    </button>

    <Transition name="slide">
      <div v-if="effectsExpanded" class="space-y-2">
        <div class="grid grid-cols-3 gap-1.5">
          <label class="block text-[10px] text-text-dim">
            {{ t('channelStrip.low', { value: eqLow.toFixed(1) }) }}
            <input v-model.number="eqLow" type="range" min="-12" max="12" step="0.5" class="w-full accent-current" />
          </label>
          <label class="block text-[10px] text-text-dim">
            {{ t('channelStrip.mid', { value: eqMid.toFixed(1) }) }}
            <input v-model.number="eqMid" type="range" min="-12" max="12" step="0.5" class="w-full accent-current" />
          </label>
          <label class="block text-[10px] text-text-dim">
            {{ t('channelStrip.high', { value: eqHigh.toFixed(1) }) }}
            <input v-model.number="eqHigh" type="range" min="-12" max="12" step="0.5" class="w-full accent-current" />
          </label>
        </div>

        <div class="grid grid-cols-2 gap-1.5">
          <label class="block text-[10px] text-text-dim">
            {{ t('channelStrip.compThreshold', { value: compThreshold.toFixed(0) }) }}
            <input v-model.number="compThreshold" type="range" min="-60" max="0" step="1" class="w-full accent-current" />
          </label>
          <label class="block text-[10px] text-text-dim">
            {{ t('channelStrip.compRatio', { value: compRatio.toFixed(1) }) }}
            <input v-model.number="compRatio" type="range" min="1" max="20" step="0.5" class="w-full accent-current" />
          </label>
        </div>

        <label class="block text-[10px] text-text-dim">
          {{ t('channelStrip.reverb', { value: Math.round(reverbMix * 100) }) }}
          <input v-model.number="reverbMix" type="range" min="0" max="1" step="0.01" class="w-full accent-current" />
        </label>
      </div>
    </Transition>
  </div>
</template>
