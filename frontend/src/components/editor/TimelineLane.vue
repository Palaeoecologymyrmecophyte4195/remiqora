<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { defaultChannelSettings } from '../../audio/mixerEngine'
import type { ChannelSettings } from '../../audio/mixerEngine'
import type { Clip, TimelineLane } from '../../audio/timelineTypes'
import ChannelStrip from '../shared/ChannelStrip.vue'
import TimelineClip from './TimelineClip.vue'

const props = defineProps<{
  lane: TimelineLane
  pxPerSecond: number
  buffers: Map<string, AudioBuffer>
  snapCandidates: number[]
  selectedClipId: string | null
  widthPx: number
  level?: { peak: number; clipping: boolean }
}>()

const emit = defineEmits<{
  'update:settings': [settings: ChannelSettings]
  rename: [name: string]
  moveClip: [payload: { clipId: string; timelineStart: number }]
  trimClip: [payload: { clipId: string; trimStart: number; trimEnd: number; timelineStart: number }]
  dragEnd: []
  selectClip: [clipId: string]
  removeClip: [clipId: string]
  removeLane: []
  dropAudio: [payload: { file: File; timelineStart: number }]
}>()

const { t } = useI18n()

const isDragOver = ref(false)

function onDrop(e: DragEvent) {
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = Math.max(0, e.clientX - rect.left)
  const timelineStart = Math.max(0, x / props.pxPerSecond)
  emit('dropAudio', { file, timelineStart })
}

function bufferFor(clip: Clip): AudioBuffer | null {
  return props.buffers.get(clip.sourceUrl) ?? null
}
</script>

<template>
  <div class="flex border-b border-border/60">
    <div class="w-56 min-w-0 shrink-0 space-y-1 overflow-hidden border-r border-border/60 p-2">
      <input
        :value="lane.name"
        :placeholder="t('timeline.trackNamePlaceholder')"
        class="w-full rounded border border-border bg-panel px-1.5 py-1 text-xs font-medium text-text"
        @input="emit('rename', ($event.target as HTMLInputElement).value)"
      />
      <ChannelStrip
        :model-value="lane.settings"
        label=""
        show-pan-mute-solo
        :level="level?.peak || 0"
        :clipping="level?.clipping || false"
        @update:model-value="(v) => emit('update:settings', v)"
        @reset="emit('update:settings', defaultChannelSettings())"
      />
      <button type="button" class="w-full rounded-lg border border-status-failed/40 py-1 text-[11px] text-status-failed hover:bg-status-failed/10" @click="emit('removeLane')">
        {{ t('timeline.removeTrack') }}
      </button>
    </div>

    <div
      class="relative min-h-20 flex-1 overflow-hidden transition-colors"
      :class="isDragOver ? 'bg-accent1/10 ring-2 ring-inset ring-accent1' : ''"
      :style="{ minWidth: widthPx + 'px' }"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop.prevent="onDrop"
    >
      <!-- Drop hint overlay -->
      <div v-if="isDragOver" class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <span class="rounded-lg bg-accent1/80 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {{ t('timeline.dropHint') }}
        </span>
      </div>
      <TimelineClip
        v-for="clip in lane.clips"
        :key="clip.id"
        :clip="clip"
        :px-per-second="pxPerSecond"
        :buffer="bufferFor(clip)"
        :snap-candidates="snapCandidates"
        :selected="clip.id === selectedClipId"
        @move="(timelineStart) => emit('moveClip', { clipId: clip.id, timelineStart })"
        @trim="(payload) => emit('trimClip', { clipId: clip.id, ...payload })"
        @drag-end="emit('dragEnd')"
        @select="emit('selectClip', clip.id)"
        @remove="emit('removeClip', clip.id)"
      />
    </div>
  </div>
</template>
