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
}

export interface WorkspaceSnapshot {
  version?: number
  apiTree: ApiTreeNode[]
  environments: Environment[]
  requests: RequestDefinition[]
  history: RequestHistoryItem[]
  preferences: UserPreferences
}

export interface AppInfo {
  name: string
  version: string
  platform: string
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
    code: 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_REQUEST' | 'UNKNOWN_ERROR'
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
  loadWorkspace: () => Promise<WorkspaceSnapshot>
  saveWorkspace: (workspace: WorkspaceSnapshot) => Promise<{ ok: true }>
  saveHistory: (history: RequestHistoryItem[]) => Promise<{ ok: true }>
  httpSend: (request: HttpSendRequest) => Promise<HttpSendResult>
  socketConnect: (request: SocketConnectRequest) => Promise<SocketResult>
  socketSend: (request: SocketSendRequest) => Promise<SocketResult>
  socketClose: (connectionId: string) => Promise<SocketResult>
  onSocketEvent?: (listener: (payload: { connectionId: string; type: 'open' | 'data' | 'close' | 'error'; data?: string; hex?: string; error?: string }) => void) => () => void
  onHttpChunk?: (listener: (payload: { requestId: string; chunk: string; done?: boolean; sse?: boolean }) => void) => () => void
}
