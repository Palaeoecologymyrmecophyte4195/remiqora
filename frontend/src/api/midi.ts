import { apiFetch } from './http'

export type MidiSource = 'full' | 'vocals' | 'drums' | 'bass' | 'other'

export interface MidiSourceState {
  status: 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  error: string | null
}

export interface MidiStatus {
  sources: Record<MidiSource, MidiSourceState>
  urls: Partial<Record<MidiSource, string>>
  available: MidiSource[]
}

export function getMidiStatus(trackId: number): Promise<MidiStatus> {
  return apiFetch<MidiStatus>(`/api/tracks/${trackId}/midi/status`)
}

export function startTranscription(trackId: number, source: MidiSource, force = false): Promise<MidiStatus> {
  return apiFetch<MidiStatus>(`/api/tracks/${trackId}/midi/${source}?force=${force}`, { method: 'POST' })
}

export function cancelTranscription(trackId: number, source: MidiSource): Promise<MidiStatus> {
  return apiFetch<MidiStatus>(`/api/tracks/${trackId}/midi/${source}/cancel`, { method: 'POST' })
}

export async function deleteMidi(trackId: number): Promise<void> {
  await apiFetch(`/api/tracks/${trackId}/midi`, { method: 'DELETE' })
}
