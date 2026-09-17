import { apiFetch, apiJson } from './http'
import type { MixSettings } from '../audio/mixerEngine'

export function getMixSettings(trackId: number): Promise<{ settings: MixSettings | null }> {
  return apiFetch<{ settings: MixSettings | null }>(`/api/tracks/${trackId}/mix`)
}

export function saveMixSettings(trackId: number, settings: MixSettings): Promise<{ settings: MixSettings }> {
  return apiJson<{ settings: MixSettings }>(`/api/tracks/${trackId}/mix`, settings, 'PUT')
}
