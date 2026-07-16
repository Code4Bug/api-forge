export type Protocol = 'http' | 'websocket' | 'socket'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface KeyValueItem {
  id: string
  key: string
  value: string
  enabled: boolean
  description?: string
}

export interface EnvironmentVariable {
  id: string
  key: string
  value: string
  type: 'text' | 'secret'
  scope: 'global' | 'environment'
  description?: string
}

export interface Environment {
  id: string
  name: string
  variables: EnvironmentVariable[]
  globalHeaders: KeyValueItem[]
}

export interface ProcessVariable {
  id: string
  key: string
  sourceRequestId: string
  jsonPath: string
  currentValue?: string
  description?: string
  updatedAt?: string
  lastError?: string
}

export interface ApiTreeNode {
  id: string
  type: 'folder' | 'api'
  name: string
  parentId?: string
  method?: HttpMethod
  protocol?: Protocol
  children?: ApiTreeNode[]
}

export interface RequestDefinition {
  id: string
  protocol: Protocol
  name: string
  description?: string
  method?: HttpMethod
  url: string
  params: KeyValueItem[]
  headers: KeyValueItem[]
  body?: string
  bodyType?: 'json' | 'form-urlencoded' | 'multipart' | 'text' | 'xml' | 'html' | 'javascript'
  formFields?: Array<{ id: string; key: string; value: string; kind: 'text' | 'file'; enabled: boolean }>
  folderId?: string
  updatedAt: string
}

export interface RequestHistoryItem {
  id: string
  protocol: Protocol
  method?: string
  url: string
  status?: number
  durationMs?: number
  sizeBytes?: number
  environmentId: string
  createdAt: string
  requestSnapshot: unknown
  responseSnapshot?: unknown
}

export interface UserPreferences {
  activeEnvironmentId: string
  activeProtocol: Protocol
  activeApiId?: string
  openApiIds?: string[]
  theme: 'dark' | 'light' | 'system' | 'dim'
  largeModel?: LargeModelConfig
  lightModel?: LightModelConfig
  largeModels?: LargeModelConfig[]
  lightModels?: LightModelConfig[]
  activeLargeModelId?: string
  activeLightModelId?: string
}

export interface LargeModelConfig {
  id: string
  name: string
  enabled: boolean
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  maxContextTokens: number
  thinkingEnabled?: boolean
}

export interface LightModelConfig {
  id: string
  name: string
  enabled: boolean
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export function getActiveLargeModel(preferences?: UserPreferences): LargeModelConfig | undefined {
  if (!preferences) return undefined
  return preferences.largeModels?.find((item) => item.id === preferences.activeLargeModelId)
    ?? (preferences.largeModel?.enabled ? preferences.largeModel : undefined)
}

export function getActiveLightModel(preferences?: UserPreferences): LightModelConfig | undefined {
  if (!preferences) return undefined
  return preferences.lightModels?.find((item) => item.id === preferences.activeLightModelId)
    ?? (preferences.lightModel?.enabled ? preferences.lightModel : undefined)
}

export interface WorkspaceSnapshot {
  version?: number
  apiTree: ApiTreeNode[]
  environments: Environment[]
  processVariables?: ProcessVariable[]
  requests: RequestDefinition[]
  history: RequestHistoryItem[]
  preferences: UserPreferences
}

export interface AppInfo {
  name: string
  version: string
  platform: string
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  message?: string
}

export interface HttpFieldItem {
  id?: string
  key: string
  value: string
  enabled: boolean
}

export interface HttpSendRequest {
  requestId?: string
  method: HttpMethod
  url: string
  params?: HttpFieldItem[]
  headers?: Record<string, string>
  body?: string
  timeout?: number
}

export interface HttpSendResponse {
  ok: true
  status: number
  headers: Record<string, string>
  body: string
  durationMs: number
  sizeBytes: number
}

export interface HttpSendError {
  ok: false
  error: {
    code: 'NETWORK_ERROR' | 'TIMEOUT' | 'CANCELED' | 'INVALID_REQUEST' | 'UNKNOWN_ERROR'
    message: string
  }
}

export type HttpSendResult = HttpSendResponse | HttpSendError

export interface SocketConnectRequest {
  connectionId: string
  protocol: 'tcp' | 'udp'
  host: string
  port: number
  timeout?: number
}

export interface SocketSendRequest {
  connectionId: string
  data: string
  encoding?: 'utf8' | 'hex'
  port?: number
  host?: string
}

export type SocketResult = { ok: true } | { ok: false; error: string }

export interface DesktopApi {
  getAppInfo: () => Promise<AppInfo>
  checkForUpdates: () => Promise<{ ok: true } | { ok: false; error: string }>
  downloadUpdate: () => Promise<{ ok: true } | { ok: false; error: string }>
  installUpdate: () => Promise<{ ok: true } | { ok: false; error: string }>
  onUpdateStatus?: (listener: (status: UpdateStatus) => void) => () => void
  loadWorkspace: () => Promise<WorkspaceSnapshot>
  saveWorkspace: (workspace: WorkspaceSnapshot) => Promise<{ ok: true }>
  saveHistory: (history: RequestHistoryItem[]) => Promise<{ ok: true }>
  httpSend: (request: HttpSendRequest) => Promise<HttpSendResult>
  httpCancel: (requestId: string) => Promise<{ ok: true }>
  socketConnect: (request: SocketConnectRequest) => Promise<SocketResult>
  socketSend: (request: SocketSendRequest) => Promise<SocketResult>
  socketClose: (connectionId: string) => Promise<SocketResult>
  onSocketEvent?: (listener: (payload: { connectionId: string; type: 'open' | 'data' | 'close' | 'error'; data?: string; hex?: string; error?: string }) => void) => () => void
  onHttpChunk?: (listener: (payload: { requestId: string; chunk: string; done?: boolean; sse?: boolean }) => void) => () => void
}
