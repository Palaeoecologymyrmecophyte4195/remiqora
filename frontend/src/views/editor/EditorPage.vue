<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '../../stores/editor'
import { useTimelineEngine } from '../../composables/useTimelineEngine'
import { getSharedAudioCtx } from '../../composables/audioPlayback'
import { decodeStem, defaultMasterSettings } from '../../audio/mixerEngine'
import type { ChannelSettings } from '../../audio/mixerEngine'
import type { Clip } from '../../audio/timelineTypes'
import { encodeWav } from '../../audio/wavEncoder'
import { encodeMp3 } from '../../audio/mp3Encoder'
import * as tracksApi from '../../api/tracks'
import ChannelStrip from '../../components/shared/ChannelStrip.vue'
import TimelineLane from '../../components/editor/TimelineLane.vue'
import LibraryPicker from '../../components/editor/LibraryPicker.vue'
import PlayIcon from '../../components/shared/icons/PlayIcon.vue'
import PauseIcon from '../../components/shared/icons/PauseIcon.vue'

const props = defineProps<{ id: string }>()

const store = useEditorStore()
const engine = useTimelineEngine()
const router = useRouter()
const { t } = useI18n()

const buffers = ref<Map<string, AudioBuffer>>(new Map())
const loadingAudio = ref(true)
const pickerOpenForNewLane = ref(false)
const exportFormat = ref<'wav' | 'mp3'>('wav')
const exporting = ref(false)
const exportError = ref<string | null>(null)
const exportedOk = ref(false)

const laneLevels = ref<{ peak: number; clipping: boolean }[]>([])
const masterLevel = ref<{ peak: number; clipping: boolean }>({ peak: 0, clipping: false })

let rafId: number | null = null
let playStartCtxTime = 0
let playStartOffset = 0

function stopTicking(): void {
  if (rafId != null) cancelAnimationFrame(rafId)
  rafId = null
  laneLevels.value = store.project.lanes.map(() => ({ peak: 0, clipping: false }))
  masterLevel.value = { peak: 0, clipping: false }
}
function tick(): void {
  const ctx = getSharedAudioCtx()
  store.playheadSec = Math.min(store.totalDuration, ctx.currentTime - playStartCtxTime + playStartOffset)
  laneLevels.value = store.project.lanes.map((_, i) => engine.getLaneLevel(i))
  masterLevel.value = engine.getMasterLevel()
  rafId = requestAnimationFrame(tick)
}
function startTicking(): void {
  stopTicking()
  rafId = requestAnimationFrame(tick)
}

function onEnded(): void {
  store.playing = false
  store.playheadSec = store.totalDuration
  stopTicking()
}

async function play(): Promise<void> {
  if (store.playing) return
  const from = store.playheadSec >= store.totalDuration ? 0 : store.playheadSec
  playStartOffset = from
  playStartCtxTime = getSharedAudioCtx().currentTime
  store.playing = true
  await engine.play(store.project, buffers.value, from, onEnded)
  startTicking()
}

function pause(): void {
  engine.stop()
  store.playing = false
  stopTicking()
}

function seek(value: number): void {
  store.playheadSec = value
  if (store.playing) {
    playStartOffset = value
    playStartCtxTime = getSharedAudioCtx().currentTime
    void engine.play(store.project, buffers.value, value, onEnded)
  }
}

const timelineWidthPx = computed(() => Math.max(400, (store.totalDuration + 10) * store.project.pxPerSecond))

const rulerMarks = computed<number[]>(() => {
  const step = store.project.pxPerSecond < 20 ? 10 : store.project.pxPerSecond < 60 ? 5 : 1
  const maxT = timelineWidthPx.value / store.project.pxPerSecond
  const marks: number[] = []
  for (let t = 0; t <= maxT; t += step) marks.push(t)
  return marks
})

function onRulerClick(evt: MouseEvent): void {
  const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect()
  const x = evt.clientX - rect.left
  seek(Math.max(0, x / store.project.pxPerSecond))
}

const snapCandidates = computed<number[]>(() => {
  const edges = [0]
  for (const lane of store.project.lanes) {
    for (const clip of lane.clips) {
      edges.push(clip.timelineStart, clip.timelineStart + (clip.trimEnd - clip.trimStart))
    }
  }
  return edges
})

const masterAsChannel = computed<ChannelSettings>({
  get: () => ({ ...store.project.master, pan: 0, muted: false, solo: false }),
  set: (v) => {
    const { pan: _pan, muted: _muted, solo: _solo, ...rest } = v
    store.updateMasterSettings(rest)
  },
})

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function onAddLaneClick(): void {
  pickerOpenForNewLane.value = true
}

async function onPickForNewLane(payload: { sourceUrl: string; sourceLabel: string }): Promise<void> {
  pickerOpenForNewLane.value = false
  let buffer = buffers.value.get(payload.sourceUrl)
  if (!buffer) {
    buffer = await decodeStem(payload.sourceUrl)
    buffers.value.set(payload.sourceUrl, buffer)
  }
  const lane = store.addLane()
  store.renameLane(lane.id, payload.sourceLabel)
  const clip: Clip = {
    id: crypto.randomUUID(),
    sourceUrl: payload.sourceUrl,
    sourceLabel: payload.sourceLabel,
    timelineStart: 0,
    trimStart: 0,
    trimEnd: buffer.duration,
  }
  store.addClip(lane.id, clip)
}

async function doSave(): Promise<void> {
  const wasNew = store.projectId == null
  await store.save()
  if (wasNew && store.projectId != null) {
    await router.replace(`/editor/${store.projectId}`)
  }
}

async function doExport(): Promise<void> {
  exporting.value = true
  exportError.value = null
  exportedOk.value = false
  try {
    const rendered = await engine.render(store.project, buffers.value, store.totalDuration)
    const blob = exportFormat.value === 'wav' ? encodeWav(rendered) : encodeMp3(rendered)
    await tracksApi.saveTrack(
      { model: 'editor', title: store.projectName, lyrics: '', params: { project_export: true, project_id: store.projectId } },
      blob,
      exportFormat.value,
    )
    exportedOk.value = true
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : String(e)
  } finally {
    exporting.value = false
  }
}

async function load(): Promise<void> {
  pause()
  engine.teardown()
  loadingAudio.value = true
  if (props.id === 'new') {
    store.newProject()
  } else {
    await store.loadProject(Number(props.id))
  }
  buffers.value = await engine.decodeAll(store.project)
  engine.ensureGraph(store.project.lanes.length)
  engine.applySettings(store.project)
  loadingAudio.value = false
}

async function onDropAudio(laneId: string, payload: { file: File; timelineStart: number }): Promise<void> {
  try {
    const uploaded = await tracksApi.uploadTrack(payload.file)
    let buffer = buffers.value.get(uploaded.audio_url)
    if (!buffer) {
      buffer = await decodeStem(uploaded.audio_url)
      buffers.value.set(uploaded.audio_url, buffer)
    }
    const clip: Clip = {
      id: crypto.randomUUID(),
      sourceUrl: uploaded.audio_url,
      sourceLabel: uploaded.title || payload.file.name,
      timelineStart: payload.timelineStart,
      trimStart: 0,
      trimEnd: buffer.duration,
    }
    store.addClip(laneId, clip)
  } catch (e) {
    store.error = e instanceof Error ? e.message : String(e)
  }
}

watch(() => props.id, load, { immediate: true })
watch(
  () => store.project,
  async () => {
    engine.ensureGraph(store.project.lanes.length)
    engine.applySettings(store.project)
    for (const lane of store.project.lanes) {
      for (const clip of lane.clips) {
        if (!buffers.value.has(clip.sourceUrl)) {
          try {
            const buf = await decodeStem(clip.sourceUrl)
            buffers.value.set(clip.sourceUrl, buf)
          } catch {}
        }
      }
    }
  },
  { deep: true },
)

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName?.toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  // ────── DAW Hotkeys ──────
  if (e.key === ' ') {
    e.preventDefault()
    store.playing ? pause() : play()
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (store.selectedClipId) {
      e.preventDefault()
      store.removeClip(store.selectedClipId)
    }
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    if (store.selectedClipId) {
      e.preventDefault()
      for (const lane of store.project.lanes) {
        const clip = lane.clips.find(c => c.id === store.selectedClipId)
        if (clip) {
          const dur = clip.trimEnd - clip.trimStart
          const newClip: Clip = {
            id: crypto.randomUUID(),
            sourceUrl: clip.sourceUrl,
            sourceLabel: clip.sourceLabel,
            timelineStart: clip.timelineStart + dur,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd,
          }
          store.addClip(lane.id, newClip)
          store.selectedClipId = newClip.id
          break
        }
      }
    }
    return
  }
  // ─────────────────────────

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    store.undo()
  } else if (
    ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
    ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
  ) {
    e.preventDefault()
    store.redo()
  }
}

function onTimelineWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -5 : 5
    store.setZoom(store.project.pxPerSecond + delta)
  }
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (store.dirty) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  stopTicking()
  engine.teardown()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

onBeforeRouteLeave((_to, _from, next) => {
  if (store.dirty) {
    const confirmLeave = window.confirm(t('editor.confirmLeave'))
    if (!confirmLeave) {
      next(false)
      return
    }
  }
  next()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-4 p-4">
    <div class="flex flex-wrap items-center gap-3">
      <router-link to="/editor" class="text-xs text-text-dim hover:underline">{{ t('editor.backToProjects') }}</router-link>
      <div class="flex items-center gap-1.5">
        <input v-model="store.projectName" class="rounded-lg border border-border bg-panel-2 px-2 py-1 text-sm text-text" />
        <span v-if="store.dirty" class="text-xs font-bold text-accent" :title="t('editor.unsavedTitle')">●</span>
      </div>
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        :class="store.dirty ? 'accent-gradient text-white' : 'border border-border text-text'"
        :disabled="store.saving"
        @click="doSave"
      >
        {{ store.saving ? t('editor.saving') : t('common.save') }}
      </button>

      <!-- Undo / Redo controls -->
      <div class="flex items-center gap-1 border-l border-border/60 pl-2">
        <button
          type="button"
          class="rounded border border-border px-2 py-1 text-xs text-text hover:bg-panel disabled:opacity-40"
          :disabled="!store.canUndo"
          :title="t('editor.undoTitle')"
          @click="store.undo()"
        >
          {{ t('editor.undoBtn') }}
        </button>
        <button
          type="button"
          class="rounded border border-border px-2 py-1 text-xs text-text hover:bg-panel disabled:opacity-40"
          :disabled="!store.canRedo"
          :title="t('editor.redoTitle')"
          @click="store.redo()"
        >
          {{ t('editor.redoBtn') }}
        </button>
      </div>
    </div>

    <p v-if="store.loading || loadingAudio" class="text-xs text-text-dim">{{ t('common.loading') }}</p>
    <p v-if="store.error" class="rounded-lg bg-status-failed/10 p-2 text-xs text-status-failed">{{ store.error }}</p>

    <template v-if="!store.loading && !loadingAudio">
      <div class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel-2 p-2">
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full accent-gradient text-white"
          @click="store.playing ? pause() : play()"
        >
          <PlayIcon v-if="!store.playing" class="w-[13px] h-[13px]" />
          <PauseIcon v-else class="w-[13px] h-[13px]" />
        </button>
        <span class="w-24 shrink-0 text-xs tabular-nums text-text-dim">{{ formatTime(store.playheadSec) }} / {{ formatTime(store.totalDuration) }}</span>
        <label class="flex items-center gap-2 text-xs text-text-dim">
          {{ t('editor.zoom') }}
          <input
            type="range"
            min="10"
            max="200"
            :value="store.project.pxPerSecond"
            @input="store.setZoom(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <button type="button" class="ml-auto rounded-lg border border-border px-2 py-1 text-xs text-text hover:bg-panel" @click="onAddLaneClick">
          {{ t('editor.addTrack') }}
        </button>
      </div>

      <div class="overflow-x-auto rounded-lg border border-border" @wheel="onTimelineWheel">
        <div>
          <div class="flex border-b border-border/60 bg-panel-2">
            <div class="w-56 shrink-0 border-r border-border/60"></div>
            <div
              class="relative h-6 flex-1 cursor-pointer"
              :style="{ minWidth: timelineWidthPx + 'px' }"
              @click="onRulerClick"
            >
              <div
                v-for="mark in rulerMarks"
                :key="mark"
                class="absolute top-0 bottom-0 border-l border-border/40 pl-1 text-[10px] text-text-dim"
                :style="{ left: mark * store.project.pxPerSecond + 'px' }"
              >
                {{ formatTime(mark) }}
              </div>
              <div
                class="absolute top-0 bottom-0 w-0.5 bg-status-failed shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                :style="{ left: store.playheadSec * store.project.pxPerSecond + 'px' }"
              >
                <div class="absolute -top-1 -left-1 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-status-failed"></div>
              </div>
            </div>
          </div>

          <TimelineLane
            v-for="(lane, idx) in store.project.lanes"
            :key="lane.id"
            :lane="lane"
            :px-per-second="store.project.pxPerSecond"
            :buffers="buffers"
            :snap-candidates="snapCandidates"
            :selected-clip-id="store.selectedClipId"
            :width-px="timelineWidthPx"
            :level="laneLevels[idx]"
            @update:settings="(v) => store.updateLaneSettings(lane.id, v)"
            @rename="(name) => store.renameLane(lane.id, name)"
            @move-clip="(p) => store.updateClip(p.clipId, { timelineStart: p.timelineStart })"
            @trim-clip="(p) => store.updateClip(p.clipId, { trimStart: p.trimStart, trimEnd: p.trimEnd, timelineStart: p.timelineStart })"
            @drag-end="store.commitSnapshot()"
            @drop-audio="(p) => onDropAudio(lane.id, p)"
            @select-clip="(id) => (store.selectedClipId = id)"
            @remove-clip="(id) => store.removeClip(id)"
            @remove-lane="store.removeLane(lane.id)"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel-2 p-3">
        <ChannelStrip
          :model-value="masterAsChannel"
          :label="t('editor.master')"
          :level="masterLevel.peak"
          :clipping="masterLevel.clipping"
          @update:model-value="(v) => (masterAsChannel = v)"
          @reset="store.updateMasterSettings(defaultMasterSettings())"
        />
        <div class="flex items-center gap-2">
          <select v-model="exportFormat" class="rounded-lg border border-border bg-panel-2 px-2 py-1 text-xs text-text">
            <option value="wav">WAV</option>
            <option value="mp3">MP3</option>
          </select>
          <button
            type="button"
            class="accent-gradient rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            :disabled="exporting"
            @click="doExport"
          >
            {{ exporting ? t('editor.exporting') : t('editor.export') }}
          </button>
        </div>
      </div>
      <p v-if="exportError" class="rounded-lg bg-status-failed/10 p-2 text-xs text-status-failed">{{ exportError }}</p>
      <p v-if="exportedOk" class="rounded-lg bg-panel-2 p-2 text-xs text-text-dim">{{ t('editor.exportedAsNewTrack') }}</p>
    </template>

    <LibraryPicker v-if="pickerOpenForNewLane" @pick="onPickForNewLane" @close="pickerOpenForNewLane = false" />
  </div>
</template>
