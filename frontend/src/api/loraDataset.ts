import { apiFetch } from './http'

export interface UploadDatasetFilesResponse {
  audio_dir: string
  saved: string[]
  skipped: string[]
}

export async function uploadDatasetFiles(datasetName: string, files: File[]): Promise<UploadDatasetFilesResponse> {
  const form = new FormData()
  form.append('dataset_name', datasetName)
  for (const f of files) form.append('files', f, f.name)
  return apiFetch<UploadDatasetFilesResponse>('/api/lora-dataset/upload', {
    method: 'POST',
    body: form,
  })
}
