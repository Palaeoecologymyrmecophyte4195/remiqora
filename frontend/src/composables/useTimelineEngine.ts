/**
 * Thin orchestration layer around audio/timelineEngine.ts. Deliberately a
 * plain factory function (not a module-level singleton, not Pinia state) -
 * each call creates its own closures over the live Web Audio graph/playback
 * handle, so this must be instantiated once per EditorPage mount and torn
 * down in onBeforeUnmount, exactly mirroring MixerModal.vue's local
 * `let graph`/`let playback` pattern. Keeping this out of the Pinia store
 * (stores/editor.ts) is deliberate: a store update via HMR would otherwise
 * silently orphan connected AudioNodes with no disconnect() ever firing.
 */
import { getSharedAudioCtx } from './audioPlayback'
import { decodeStem, getChannelLevel, getReverbImpulse } from '../audio/mixerEngine'
import {
  applyLaneSettings,
  applyMasterSettings,
  buildTimelineGraph,
  disconnectTimelineGraph,
  effectiveLaneGain,
  renderTimeline,
  scheduleTimeline,
} from '../audio/timelineEngine'
import type { ScheduledClip, TimelineGraph, TimelinePlaybackHandle } from '../audio/timelineEngine'
import type { TimelineProject } from '../audio/timelineTypes'

export function useTimelineEngine() {
  let graph: TimelineGraph | null = null
  let playback: TimelinePlaybackHandle | null = null
  let seekToken = 0

  function ensureGraph(laneCount: number): TimelineGraph {
    const ctx = getSharedAudioCtx()
    if (!graph || graph.lanes.length !== laneCount) {
      if (graph) disconnectTimelineGraph(graph)
      graph = buildTimelineGraph(ctx, laneCount, getReverbImpulse(ctx.sampleRate))
    }
    return graph
  }

  function applySettings(project: TimelineProject): void {
    if (!graph) return
    const anySolo = project.lanes.some((l) => l.settings.solo)
    project.lanes.forEach((lane, i) => applyLaneSettings(graph!, i, lane.settings, effectiveLaneGain(lane.settings, anySolo)))
    applyMasterSettings(graph, project.master)
  }

  async function decodeAll(project: TimelineProject): Promise<Map<string, AudioBuffer>> {
    const urls = new Set<string>()
    for (const lane of project.lanes) for (const clip of lane.clips) urls.add(clip.sourceUrl)
    const entries = await Promise.all([...urls].map(async (u) => [u, await decodeStem(u)] as const))
    return new Map(entries)
  }

  function toScheduledClips(project: TimelineProject, buffers: Map<string, AudioBuffer>): ScheduledClip[] {
    const clips: ScheduledClip[] = []
    project.lanes.forEach((lane, laneIndex) => {
      for (const clip of lane.clips) {
        const buffer = buffers.get(clip.sourceUrl)
        if (buffer) clips.push({ laneIndex, buffer, timelineStart: clip.timelineStart, trimStart: clip.trimStart, trimEnd: clip.trimEnd })
      }
    })
    return clips
  }

  async function play(project: TimelineProject, buffers: Map<string, AudioBuffer>, fromSec: number, onEnded: () => void): Promise<void> {
    const g = ensureGraph(project.lanes.length)
    const token = ++seekToken
    await (g.ctx as AudioContext).resume()
    if (token !== seekToken || !graph) return // superseded by a newer play/seek, or torn down meanwhile
    playback?.stop()
    applySettings(project)
    playback = scheduleTimeline(graph, toScheduledClips(project, buffers), fromSec, (graph.ctx as AudioContext).currentTime, onEnded)
  }

  function stop(): void {
    seekToken++ // invalidate any in-flight play()
    playback?.stop()
    playback = null
  }

  function teardown(): void {
    stop()
    if (graph) disconnectTimelineGraph(graph)
    graph = null
  }

  async function render(project: TimelineProject, buffers: Map<string, AudioBuffer>, totalDurationSec: number): Promise<AudioBuffer> {
    const sampleRate = getSharedAudioCtx().sampleRate
    const clips = toScheduledClips(project, buffers)
    const laneSettings = project.lanes.map((l) => l.settings)
    return renderTimeline(clips, laneSettings, project.master, totalDurationSec, sampleRate)
  }

  function getLaneLevel(laneIndex: number): { peak: number; clipping: boolean } {
    if (!graph || !graph.lanes[laneIndex]) return { peak: 0, clipping: false }
    return getChannelLevel(graph.lanes[laneIndex])
  }

  function getMasterLevel(): { peak: number; clipping: boolean } {
    if (!graph) return { peak: 0, clipping: false }
    return getChannelLevel(graph.master)
  }

  return { ensureGraph, applySettings, decodeAll, toScheduledClips, play, stop, teardown, render, getLaneLevel, getMasterLevel }
}
