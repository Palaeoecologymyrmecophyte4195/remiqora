<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Clip } from '../../audio/timelineTypes'

const MIN_CLIP_SEC = 0.05
const SNAP_PX = 8

const props = defineProps<{
  clip: Clip
  pxPerSecond: number
  buffer: AudioBuffer | null
  snapCandidates: number[]
  selected: boolean
}>()

const emit = defineEmits<{
  move: [timelineStart: number]
  trim: [payload: { trimStart: number; trimEnd: number; timelineStart: number }]
  dragEnd: []
  select: []
  remove: []
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)

const duration = computed(() => props.clip.trimEnd - props.clip.trimStart)
const left = computed(() => props.clip.timelineStart * props.pxPerSecond)
const width = computed(() => Math.max(4, duration.value * props.pxPerSecond))

type DragMode = 'move' | 'trim-left' | 'trim-right'
let dragMode: DragMode | null = null
let dragStartClientX = 0
let dragStartTimelineStart = 0
let dragStartTrimStart = 0
let dragStartTrimEnd = 0
let dragCandidates: number[] = []

function snap(value: number): number {
  const thresholdSec = SNAP_PX / props.pxPerSecond
  let best = value
  let bestDist = thresholdSec
  for (const c of dragCandidates) {
    const d = Math.abs(c - value)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best
}

function onPointerDown(mode: DragMode, evt: PointerEvent): void {
  evt.stopPropagation()
  emit('select')
  dragMode = mode
  dragStartClientX = evt.clientX
  dragStartTimelineStart = props.clip.timelineStart
  dragStartTrimStart = props.clip.trimStart
  dragStartTrimEnd = props.clip.trimEnd
  const ownStart = props.clip.timelineStart
  const ownEnd = props.clip.timelineStart + duration.value
  dragCandidates = props.snapCandidates.filter((c) => Math.abs(c - ownStart) > 1e-6 && Math.abs(c - ownEnd) > 1e-6)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(evt: PointerEvent): void {
  if (!dragMode) return
  const deltaSec = (evt.clientX - dragStartClientX) / props.pxPerSecond

  if (dragMode === 'move') {
    const raw = Math.max(0, dragStartTimelineStart + deltaSec)
    emit('move', snap(raw))
  } else if (dragMode === 'trim-left') {
    const maxStart = dragStartTrimEnd - MIN_CLIP_SEC
    const rawTrimStart = Math.max(0, Math.min(dragStartTrimStart + deltaSec, maxStart))
    const rawTimelineStart = dragStartTimelineStart + (rawTrimStart - dragStartTrimStart)
    const snappedTimelineStart = snap(rawTimelineStart)
    const appliedDelta = snappedTimelineStart - dragStartTimelineStart
    emit('trim', {
      trimStart: dragStartTrimStart + appliedDelta,
      trimEnd: dragStartTrimEnd,
      timelineStart: snappedTimelineStart,
    })
  } else {
    const minEnd = dragStartTrimStart + MIN_CLIP_SEC
    const maxEnd = props.buffer ? props.buffer.duration : Infinity
    const rawTrimEnd = Math.max(minEnd, Math.min(dragStartTrimEnd + deltaSec, maxEnd))
    const rawEndOnTimeline = dragStartTimelineStart + (rawTrimEnd - dragStartTrimStart)
    const snappedEndOnTimeline = snap(rawEndOnTimeline)
    emit('trim', {
      trimStart: dragStartTrimStart,
      trimEnd: dragStartTrimStart + (snappedEndOnTimeline - dragStartTimelineStart),
      timelineStart: dragStartTimelineStart,
    })
  }
}

function onPointerUp(): void {
  dragMode = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  drawPeaks()
  emit('dragEnd')
}

// Deliberately only recomputed on buffer load and drag-end (pointerup), not
// on every pointermove - recomputing RMS peaks continuously while dragging a
// long clip would visibly stutter. During a drag the existing bitmap just
// stretches with the container (a stale-but-cheap visual, sharp again once
// the drag ends and this redraws at the final size).
function drawPeaks(): void {
  const canvas = canvasEl.value
  const buffer = props.buffer
  if (!canvas || !buffer) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height || 28)
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const sampleRate = buffer.sampleRate
  const startSample = Math.max(0, Math.floor(props.clip.trimStart * sampleRate))
  const endSample = Math.min(buffer.length, Math.floor(props.clip.trimEnd * sampleRate))
  const totalSamples = Math.max(1, endSample - startSample)
  const barCount = Math.max(1, Math.min(300, Math.round(w / 2)))
  const blockSize = Math.max(1, Math.floor(totalSamples / barCount))
  const channel = buffer.getChannelData(0)

  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  for (let i = 0; i < barCount; i++) {
    const start = startSample + i * blockSize
    let sum = 0
    let count = 0
    for (let j = 0; j < blockSize && start + j < endSample; j++) {
      const v = channel[start + j]
      sum += v * v
      count++
    }
    const rms = count > 0 ? Math.sqrt(sum / count) : 0
    const barHeight = Math.max(1, rms * h)
    const x = (i / barCount) * w
    const barWidth = Math.max(1, w / barCount - 1)
    ctx.fillRect(x, (h - barHeight) / 2, barWidth, barHeight)
  }
}

watch(() => props.buffer, drawPeaks)
onMounted(drawPeaks)
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div
    class="absolute top-2 h-16 overflow-hidden rounded-md border select-none"
    :class="selected ? 'border-accent1 bg-panel' : 'border-border bg-panel-2'"
    :style="{ left: left + 'px', width: width + 'px' }"
  >
    <div class="flex h-full cursor-grab flex-col" @pointerdown="onPointerDown('move', $event)">
      <div class="flex items-center justify-between px-1 text-[10px] text-text-dim">
        <span class="truncate">{{ clip.sourceLabel }}</span>
        <button type="button" class="shrink-0 text-text-dim hover:text-status-failed" @pointerdown.stop @click="emit('remove')">✕</button>
      </div>
      <canvas ref="canvasEl" class="w-full min-h-0 flex-1"></canvas>
    </div>
    <div class="absolute top-0 left-0 h-full w-1.5 cursor-ew-resize bg-white/10" @pointerdown="onPointerDown('trim-left', $event)"></div>
    <div class="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize bg-white/10" @pointerdown="onPointerDown('trim-right', $event)"></div>
  </div>
</template>
