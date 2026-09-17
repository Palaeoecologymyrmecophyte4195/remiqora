/**
 * Generalized N-lane Web Audio engine for the timeline editor, built on the
 * same per-channel effect chain as mixerEngine.ts (buildChannel/
 * applyChannelSettings, exported from there for reuse here) - the mixer's
 * own buildMixGraph/STEM_NAMES stay fixed at exactly 4 stems and are
 * untouched; this module is the arbitrary-lane-count counterpart.
 */
import { applyChannelSettings, buildChannel, getReverbImpulse } from './mixerEngine'
import type { BuiltChannel, ChannelSettings, MasterSettings } from './mixerEngine'

export interface TimelineGraph {
  ctx: BaseAudioContext
  lanes: BuiltChannel[]
  master: BuiltChannel
}

export function buildTimelineGraph(ctx: BaseAudioContext, laneCount: number, impulse: AudioBuffer): TimelineGraph {
  const master = buildChannel(ctx, true, impulse)
  master.output.connect(ctx.destination)
  const lanes: BuiltChannel[] = []
  for (let i = 0; i < laneCount; i++) {
    const ch = buildChannel(ctx, false, impulse)
    ch.output.connect(master.input)
    lanes.push(ch)
  }
  return { ctx, lanes, master }
}

export function effectiveLaneGain(settings: ChannelSettings, anySolo: boolean): number {
  if (settings.muted) return 0
  if (anySolo && !settings.solo) return 0
  return settings.volume
}

export function applyLaneSettings(graph: TimelineGraph, laneIndex: number, settings: ChannelSettings, effectiveVolume: number): void {
  applyChannelSettings(graph.lanes[laneIndex], settings, effectiveVolume)
}

export function applyMasterSettings(graph: TimelineGraph, settings: MasterSettings): void {
  applyChannelSettings(graph.master, settings, settings.volume)
}

function disconnectChannel(ch: BuiltChannel): void {
  ch.volumeGain.disconnect()
  ch.eqLow.disconnect()
  ch.eqMid.disconnect()
  ch.eqHigh.disconnect()
  ch.comp.disconnect()
  ch.panner?.disconnect()
  ch.dryGain.disconnect()
  ch.wetGain.disconnect()
  ch.convolver.disconnect()
  ch.analyser?.disconnect()
}

/** Must be called when the editor closes/navigates away, same discipline as
 * mixerEngine's disconnectMixGraph - otherwise the processing graph (silent
 * but allocated) stays alive across repeated open/close cycles. */
export function disconnectTimelineGraph(graph: TimelineGraph): void {
  for (const ch of graph.lanes) disconnectChannel(ch)
  disconnectChannel(graph.master)
}

export interface ScheduledClip {
  laneIndex: number
  buffer: AudioBuffer
  timelineStart: number
  trimStart: number
  trimEnd: number
}

export interface TimelinePlaybackHandle {
  stop(): void
}

/** Schedules every clip that hasn't finished by playFromSec, all at once,
 * via AudioBufferSourceNode.start(when, offset, duration) - clips starting
 * in the future and clips already "in progress" at playFromSec are both
 * handled by the same branch below, the only difference being the `offset`
 * (and `when`) passed to start(). */
export function scheduleTimeline(
  graph: TimelineGraph,
  clips: ScheduledClip[],
  playFromSec: number,
  ctxStartTime: number,
  onEnded: () => void,
): TimelinePlaybackHandle {
  const ctx = graph.ctx as AudioContext
  const sources: AudioBufferSourceNode[] = []
  const fadeGains: GainNode[] = []
  let lastEnd = -Infinity
  let lastSrc: AudioBufferSourceNode | null = null

  for (const clip of clips) {
    const clipDuration = clip.trimEnd - clip.trimStart
    const clipTimelineEnd = clip.timelineStart + clipDuration
    if (clipDuration <= 0 || clipTimelineEnd <= playFromSec) continue // finished or empty

    let when: number
    let offset: number
    let duration: number
    if (clip.timelineStart >= playFromSec) {
      when = ctxStartTime + (clip.timelineStart - playFromSec)
      offset = clip.trimStart
      duration = clipDuration
    } else {
      when = ctxStartTime
      offset = clip.trimStart + (playFromSec - clip.timelineStart)
      duration = clipTimelineEnd - playFromSec
    }
    // Defensive clamp against the actual decoded buffer, mirroring the
    // clamp style already used in mixerEngine's playFrom().
    offset = Math.min(offset, Math.max(0, clip.buffer.duration - 0.001))
    duration = Math.max(0, Math.min(duration, clip.buffer.duration - offset))
    if (duration <= 0) continue

    const src = ctx.createBufferSource()
    src.buffer = clip.buffer

    // 15ms micro-fade linear ramps to eliminate cut clicks / non-zero crossings
    const fadeGain = ctx.createGain()
    const fadeTime = Math.min(0.015, duration / 2)
    if (fadeTime > 0.001) {
      fadeGain.gain.setValueAtTime(0, when)
      fadeGain.gain.linearRampToValueAtTime(1, when + fadeTime)
      fadeGain.gain.setValueAtTime(1, Math.max(when + fadeTime, when + duration - fadeTime))
      fadeGain.gain.linearRampToValueAtTime(0, when + duration)
    } else {
      fadeGain.gain.setValueAtTime(1, when)
    }

    src.connect(fadeGain)
    fadeGain.connect(graph.lanes[clip.laneIndex].input)
    src.start(when, offset, duration)
    sources.push(src)
    fadeGains.push(fadeGain)

    if (clipTimelineEnd > lastEnd) {
      lastEnd = clipTimelineEnd
      lastSrc = src
    }
  }

  if (lastSrc) lastSrc.onended = () => onEnded()

  return {
    stop() {
      for (const src of sources) {
        src.onended = null
        try {
          // Legal even for a source scheduled to start in the future but
          // that hasn't started yet - cancels it before it ever plays.
          src.stop()
        } catch {
          // already stopped/ended - fine
        }
        src.disconnect()
      }
      for (const g of fadeGains) {
        try {
          g.disconnect()
        } catch {
          // already disconnected - fine
        }
      }
    },
  }
}

/** Offline render for export - same graph-building/settings-applying code
 * path as the live preview, at t=0 (no playhead concept needed for a render
 * that always starts from the beginning). */
export async function renderTimeline(
  clips: ScheduledClip[],
  laneSettings: ChannelSettings[],
  masterSettings: MasterSettings,
  totalDurationSec: number,
  sampleRate: number,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(totalDurationSec * sampleRate)), sampleRate)
  const graph = buildTimelineGraph(ctx, laneSettings.length, getReverbImpulse(sampleRate))
  const anySolo = laneSettings.some((s) => s.solo)
  laneSettings.forEach((s, i) => applyLaneSettings(graph, i, s, effectiveLaneGain(s, anySolo)))
  applyMasterSettings(graph, masterSettings)
  for (const clip of clips) {
    const duration = clip.trimEnd - clip.trimStart
    if (duration <= 0) continue
    const src = ctx.createBufferSource()
    src.buffer = clip.buffer
    const fadeGain = ctx.createGain()
    const fadeTime = Math.min(0.015, duration / 2)
    const when = clip.timelineStart
    if (fadeTime > 0.001) {
      fadeGain.gain.setValueAtTime(0, when)
      fadeGain.gain.linearRampToValueAtTime(1, when + fadeTime)
      fadeGain.gain.setValueAtTime(1, Math.max(when + fadeTime, when + duration - fadeTime))
      fadeGain.gain.linearRampToValueAtTime(0, when + duration)
    } else {
      fadeGain.gain.setValueAtTime(1, when)
    }
    src.connect(fadeGain)
    fadeGain.connect(graph.lanes[clip.laneIndex].input)
    src.start(when, clip.trimStart, duration)
  }
  return ctx.startRendering()
}
