import type { ChannelSettings, MasterSettings } from './mixerEngine'

export interface Clip {
  id: string
  sourceUrl: string
  sourceLabel: string
  /** Position on the global timeline, in seconds. */
  timelineStart: number
  /** Offset into the source audio where playback of this clip begins, in seconds. */
  trimStart: number
  /** Offset into the source audio where playback of this clip ends, in seconds. */
  trimEnd: number
}

export interface TimelineLane {
  id: string
  name: string
  clips: Clip[]
  settings: ChannelSettings
}

export interface TimelineProject {
  version: 1
  lanes: TimelineLane[]
  master: MasterSettings
  pxPerSecond: number
}

export function clipDuration(clip: Clip): number {
  return clip.trimEnd - clip.trimStart
}

export function clipEnd(clip: Clip): number {
  return clip.timelineStart + clipDuration(clip)
}

export function projectDuration(project: TimelineProject): number {
  let max = 0
  for (const lane of project.lanes) {
    for (const clip of lane.clips) {
      max = Math.max(max, clipEnd(clip))
    }
  }
  return max
}
