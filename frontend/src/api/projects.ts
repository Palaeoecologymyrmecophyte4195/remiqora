import { apiFetch, apiJson } from './http'
import type { TimelineProject } from '../audio/timelineTypes'

export interface ProjectSummary {
  id: number
  created_at: string
  updated_at: string
  name: string
}

export interface ProjectFull extends ProjectSummary {
  data: TimelineProject
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const json = await apiFetch<{ data: ProjectSummary[] }>('/api/projects')
  return json.data
}

export function createProject(name: string, data: TimelineProject): Promise<ProjectFull> {
  return apiJson<ProjectFull>('/api/projects', { name, data }, 'POST')
}

export function getProject(id: number): Promise<ProjectFull> {
  return apiFetch<ProjectFull>(`/api/projects/${id}`)
}

export function updateProject(id: number, patch: { name?: string; data?: TimelineProject }): Promise<ProjectFull> {
  return apiJson<ProjectFull>(`/api/projects/${id}`, patch, 'PUT')
}

export async function deleteProject(id: number): Promise<void> {
  await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
}
