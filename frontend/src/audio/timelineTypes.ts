import type { ChannelSettings, MasterSettings } from './mixerEngine'
import type { MidiNote } from './miniMidiPlayer'

export type ClipType = 'audio' | 'midi'

export interface Clip {
  id: string
  type?: ClipType
  sourceUrl?: string
  sourceLabel: string
  /** Position on the global timeline, in seconds. */
  timelineStart: number
  /** Offset into the source audio where playback of this clip begins, in seconds. */
  trimStart: number
  /** Offset into the source audio where playback of this clip ends, in seconds. */
  trimEnd: number
  fadeInDuration?: number
  fadeOutDuration?: number
  warpEnabled?: boolean
  originalBpm?: number
  notes?: MidiNote[]
  instrument?: 'sawtooth' | 'square' | 'sine' | 'triangle'
  muted?: boolean
  solo?: boolean
}

export interface TimelineLane {
  id: string
  name: string
  clips: Clip[]
  settings: ChannelSettings
  colorId?: string
}

export interface TimelineProject {
  version: 1
  lanes: TimelineLane[]
  master: MasterSettings
  pxPerSecond: number
  bpm: number
  snapEnabled: boolean
  loopRegion?: { start: number; end: number; enabled: boolean }
}

export function clipDuration(clip: Clip, projectBpm: number = 120): number {
  let sf = 1.0
  if (clip.warpEnabled && clip.originalBpm) {
    sf = clip.originalBpm / projectBpm
  }
  return (clip.trimEnd - clip.trimStart) * sf
}

export function clipEnd(clip: Clip, projectBpm: number = 120): number {
  return clip.timelineStart + clipDuration(clip, projectBpm)
}

export function projectDuration(project: TimelineProject): number {
  let max = 0
  for (const lane of project.lanes) {
    for (const clip of lane.clips) {
      max = Math.max(max, clipEnd(clip, project.bpm))
    }
  }
  return max
}
