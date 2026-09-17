import { apiFetch, apiJson } from './http'
import { unwrap, type Envelope } from './aceStep'

const BASE = '/api/ace'

export interface DatasetSample {
  index: number
  filename: string
  audio_path: string
  duration: number
  caption: string
  genre: string
  prompt_override: 'caption' | 'genre' | null
  lyrics: string
  bpm: number | null
  keyscale: string
  timesignature: string
  language: string
  is_instrumental: boolean
  labeled: boolean
}

export interface ScanDatasetRequest {
  audio_dir: string
  dataset_name?: string
  custom_tag?: string
  tag_position?: 'prepend' | 'append' | 'replace'
  all_instrumental?: boolean
}

export interface ScanDatasetResponse {
  message: string
  num_samples: number
  samples: DatasetSample[]
}

export interface SaveDatasetRequest {
  save_path: string
  dataset_name?: string
  custom_tag?: string
  tag_position?: 'prepend' | 'append' | 'replace'
  all_instrumental?: boolean
  genre_ratio?: number
}

export interface UpdateSampleRequest {
  caption?: string
  genre?: string
  prompt_override?: 'caption' | 'genre' | null
  lyrics?: string
  bpm?: number
  keyscale?: string
  timesignature?: string
  language?: string
  is_instrumental?: boolean
}

export interface AutoLabelRequest {
  skip_metas?: boolean
  format_lyrics?: boolean
  transcribe_lyrics?: boolean
  only_unlabeled?: boolean
  lm_model_path?: string
  save_path?: string
  chunk_size?: number
  batch_size?: number
}

export interface AsyncTaskStarted {
  task_id: string
  message: string
  total: number
}

export interface AutoLabelStatus {
  task_id: string
  status: 'running' | 'completed' | 'failed'
  progress: string
  current: number
  total: number
  save_path?: string
  last_updated_index?: number
  last_updated_sample?: DatasetSample
  result?: { message: string; labeled_count: number; samples: DatasetSample[] }
  error?: string
}

export interface PreprocessRequest {
  output_dir: string
  skip_existing?: boolean
}

export interface PreprocessStatus {
  task_id: string
  status: 'running' | 'completed' | 'failed'
  progress: string
  current: number
  total: number
  result?: { message: string; output_dir: string; num_tensors: number }
  error?: string
}

export interface StartLoraTrainingRequest {
  tensor_dir: string
  lora_rank?: number
  lora_alpha?: number
  lora_dropout?: number
  learning_rate?: number
  train_epochs?: number
  train_batch_size?: number
  gradient_accumulation?: number
  save_every_n_epochs?: number
  training_seed?: number
  lora_output_dir?: string
  use_fp8?: boolean
  gradient_checkpointing?: boolean
}

export interface StartTrainingResponse {
  message: string
  tensor_dir: string
  output_dir: string
  config: Record<string, unknown>
}

export interface TrainingStatus {
  is_training: boolean
  should_stop: boolean
  current_step: number
  current_loss: number | null
  status: string
  config: Record<string, unknown>
  tensor_dir: string
  loss_history: { step: number; loss: number }[]
  tensorboard_url: string | null
  tensorboard_logdir: string | null
  training_log: string
  start_time: number | null
  current_epoch: number
  steps_per_second: number
  estimated_time_remaining: number
  error: string | null
}

export interface ExportLoraRequest {
  export_path: string
  lora_output_dir: string
}

export interface ExportLoraResponse {
  message: string
  export_path: string
  source: string
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return unwrap(await apiJson<Envelope<T> | T>(`${BASE}${path}`, body))
}

async function get<T>(path: string): Promise<T> {
  return unwrap(await apiFetch<Envelope<T> | T>(`${BASE}${path}`))
}

async function put<T>(path: string, body: unknown): Promise<T> {
  return unwrap(await apiJson<Envelope<T> | T>(`${BASE}${path}`, body, 'PUT'))
}

export const scanDataset = (req: ScanDatasetRequest) => post<ScanDatasetResponse>('/v1/dataset/scan', req)
export const loadDataset = (dataset_path: string) => post<ScanDatasetResponse>('/v1/dataset/load', { dataset_path })
export const saveDataset = (req: SaveDatasetRequest) => post<{ message: string }>('/v1/dataset/save', req)
export const getSamples = () => get<{ samples: DatasetSample[] }>('/v1/dataset/samples')
export const updateSample = (idx: number, req: UpdateSampleRequest) => put<DatasetSample>(`/v1/dataset/sample/${idx}`, req)

export const startAutoLabel = (req: AutoLabelRequest) => post<AsyncTaskStarted>('/v1/dataset/auto_label_async', req)
export const autoLabelStatus = (taskId: string) => get<AutoLabelStatus>(`/v1/dataset/auto_label_status/${taskId}`)

export const startPreprocess = (req: PreprocessRequest) => post<AsyncTaskStarted>('/v1/dataset/preprocess_async', req)
export const preprocessStatus = (taskId: string) => get<PreprocessStatus>(`/v1/dataset/preprocess_status/${taskId}`)

export const startLoraTraining = (req: StartLoraTrainingRequest) => post<StartTrainingResponse>('/v1/training/start', req)
export const trainingStatus = () => get<TrainingStatus>('/v1/training/status')
export const stopTraining = () => post<{ message: string }>('/v1/training/stop', {})
export const exportLora = (req: ExportLoraRequest) => post<ExportLoraResponse>('/v1/training/export', req)
