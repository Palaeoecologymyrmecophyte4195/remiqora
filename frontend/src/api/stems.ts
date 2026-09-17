import { apiFetch } from './http'

export interface StemsStatus {
  status: 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  error: string | null
  stems: Record<string, string> | null
}

export function startSeparation(trackId: number, force = false): Promise<StemsStatus> {
  return apiFetch<StemsStatus>(`/api/tracks/${trackId}/stems?force=${force}`, { method: 'POST' })
}

export function cancelSeparation(trackId: number): Promise<StemsStatus> {
  return apiFetch<StemsStatus>(`/api/tracks/${trackId}/stems/cancel`, { method: 'POST' })
}

export function getSeparationStatus(trackId: number): Promise<StemsStatus> {
  return apiFetch<StemsStatus>(`/api/tracks/${trackId}/stems/status`)
}

export async function deleteStems(trackId: number): Promise<void> {
  await apiFetch(`/api/tracks/${trackId}/stems`, { method: 'DELETE' })
}
