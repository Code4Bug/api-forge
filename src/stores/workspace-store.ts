import { create } from 'zustand'
import type { ApiTreeNode, Environment, EnvironmentVariable, HttpMethod, KeyValueItem, LargeModelConfig, LightModelConfig, ProcessVariable, Protocol, RequestDefinition, RequestHistoryItem, WorkspaceSnapshot } from '@/shared/ipc-contracts'
import { extractJsonPath, stringifyProcessVariableValue } from '@/utils/json-path'

export function replaceEnvironmentVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{([^{}]+)\}\}/g, (match, key: string) => variables[key] ?? match)
}

export function getWorkspaceVariables(workspace: WorkspaceSnapshot | undefined, environmentId: string): Record<string, string> {
  const environmentVariables = workspace?.environments.find((item) => item.id === environmentId)?.variables ?? []
  const processVariables = workspace?.processVariables?.filter((item) => item.currentValue !== undefined) ?? []
  return Object.fromEntries([
    ...environmentVariables.map((item) => [item.key, item.value] as const),
    ...processVariables.map((item) => [item.key, item.currentValue!] as const),
  ])
}

export type WorkspaceSaveStatus = 'unsaved' | 'saving' | 'saved' | 'error'
export type ThemeMode = 'dark' | 'light' | 'system' | 'dim'

export interface ApiDefinitionInput {
  name: string
  protocol: Protocol
  method?: HttpMethod
  url?: string
  headers?: KeyValueItem[]
  body?: string
}

interface WorkspaceState {
  workspace?: WorkspaceSnapshot
  activeProtocol: Protocol
  activeEnvironmentId: string
  activeApiId?: string
  saveStatus: WorkspaceSaveStatus
  autoSaveEnabled: boolean
  autoSaveInterval: number
  loadWorkspace: () => Promise<void>
  setActiveProtocol: (protocol: Protocol) => void
  setActiveEnvironmentId: (environmentId: string) => void
  createEnvironment: (name: string) => string | undefined
  updateEnvironment: (environment: Environment) => void
  deleteEnvironment: (environmentId: string) => void
  updateEnvironmentVariable: (environmentId: string, variable: EnvironmentVariable) => void
  deleteEnvironmentVariable: (environmentId: string, variableId: string) => void
  updateProcessVariable: (variable: ProcessVariable) => void
  deleteProcessVariable: (variableId: string) => void
  captureProcessVariables: (sourceRequestId: string, responseBody: string) => void
  setActiveApiId: (apiId?: string) => void
  setOpenApiIds: (apiIds: string[]) => void
  updateRequest: (request: RequestDefinition) => void
  addHistory: (item: RequestHistoryItem) => void
  clearHistory: () => void
  createFolder: (parentId?: string, name?: string) => string | undefined
  createApi: (parentId: string | undefined, input: ApiDefinitionInput) => string | undefined
  moveApi: (apiId: string, parentId?: string, index?: number) => void
  renameNode: (nodeId: string, name: string) => void
  deleteNode: (nodeId: string) => void
  saveNow: () => void
  markUnsaved: () => void
  setAutoSaveSettings: (enabled: boolean, interval: number) => void
  updateLargeModelConfig: (config: LargeModelConfig) => void
  updateLightModelConfig: (config: LightModelConfig) => void
  deleteLargeModelConfig: (configId: string) => void
  deleteLightModelConfig: (configId: string) => void
  activateLargeModelConfig: (configId: string) => void
  activateLightModelConfig: (configId: string) => void
}

const fallbackWorkspace: WorkspaceSnapshot = {
  version: 2,
  apiTree: [
    { id: 'folder-core', type: 'folder', name: '核心接口', children: [
      { id: 'api-orders', type: 'api', name: '订单列表', method: 'GET', protocol: 'http', parentId: 'folder-core' },
      { id: 'api-order-detail', type: 'api', name: '订单详情', method: 'GET', protocol: 'http', parentId: 'folder-core' },
      { id: 'api-order-create', type: 'api', name: '创建订单', method: 'POST', protocol: 'http', parentId: 'folder-core' },
    ] },
    { id: 'folder-realtime', type: 'folder', name: '实时连接', children: [
      { id: 'api-ws-market', type: 'api', name: '行情 WebSocket', protocol: 'websocket', parentId: 'folder-realtime' },
      { id: 'api-socket-health', type: 'api', name: '服务健康检查', protocol: 'socket', parentId: 'folder-realtime' },
    ] },
    { id: 'folder-users', type: 'folder', name: '用户中心', children: [
      { id: 'api-user-profile', type: 'api', name: '用户资料', method: 'GET', protocol: 'http', parentId: 'folder-users' },
      { id: 'api-user-logout', type: 'api', name: '注销账户', method: 'DELETE', protocol: 'http', parentId: 'folder-users' },
    ] },
  ],
  environments: [{
    id: 'dev',
    name: 'Dev',
    variables: [
      { id: 'base-url', key: 'base_url', value: 'http://127.0.0.1:8787', type: 'text', scope: 'environment' },
      { id: 'token', key: 'token', value: 'dev-token-********', type: 'secret', scope: 'environment' },
    ],
    globalHeaders: [],
  }],
  processVariables: [],
  requests: [
    { id: 'api-orders', protocol: 'http', name: '订单列表', method: 'GET', url: '{{base_url}}/api/orders', params: [{ id: 'page', key: 'page', value: '1', enabled: true }, { id: 'size', key: 'size', value: '20', enabled: true }], headers: [{ id: 'content-type', key: 'Content-Type', value: 'application/json', enabled: true }], updatedAt: new Date().toISOString() },
    { id: 'api-order-detail', protocol: 'http', name: '订单详情', method: 'GET', url: '{{base_url}}/api/orders/1001', params: [], headers: [], updatedAt: new Date().toISOString() },
    { id: 'api-order-create', protocol: 'http', name: '创建订单', method: 'POST', url: '{{base_url}}/api/orders', params: [], headers: [{ id: 'content-type', key: 'Content-Type', value: 'application/json', enabled: true }], body: '{\n  "sku": "demo",\n  "quantity": 1\n}', updatedAt: new Date().toISOString() },
  ],
  history: [],
  preferences: {
    activeEnvironmentId: 'dev',
    activeProtocol: 'http',
    activeApiId: undefined,
    openApiIds: [],
    theme: 'dark',
    largeModels: [{ id: 'large-default', name: '默认大模型', enabled: false, provider: 'OpenAI 兼容', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 2048, maxContextTokens: 128000, thinkingEnabled: false }],
    lightModels: [{ id: 'light-default', name: '默认小模型', enabled: false, provider: 'OpenAI 兼容', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 512 }],
  },
}

function createModelId(prefix: 'large' | 'light'): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function normalizeModelPreferences(preferences: WorkspaceSnapshot['preferences']): WorkspaceSnapshot['preferences'] {
  const largeModels = (preferences.largeModels?.length ? preferences.largeModels : preferences.largeModel ? [preferences.largeModel] : []).map((item, index) => ({
    ...item,
    id: item.id || createModelId('large'),
    name: item.name || item.model || `大模型 ${index + 1}`,
    maxContextTokens: Number.isFinite(item.maxContextTokens) ? item.maxContextTokens : 128000,
    thinkingEnabled: item.thinkingEnabled === true,
  }))
  const lightModels = (preferences.lightModels?.length ? preferences.lightModels : preferences.lightModel ? [preferences.lightModel] : []).map((item, index) => ({
    ...item,
    id: item.id || createModelId('light'),
    name: item.name || item.model || `小模型 ${index + 1}`,
    maxTokens: Math.max(1, item.maxTokens),
  }))
  const activeLargeModelId = largeModels.some((item) => item.id === preferences.activeLargeModelId)
    ? preferences.activeLargeModelId
    : preferences.largeModel?.enabled ? largeModels[0]?.id : undefined
  const activeLightModelId = lightModels.some((item) => item.id === preferences.activeLightModelId)
    ? preferences.activeLightModelId
    : preferences.lightModel?.enabled ? lightModels[0]?.id : undefined
  return { ...preferences, largeModel: undefined, lightModel: undefined, largeModels, lightModels, activeLargeModelId, activeLightModelId }
}

let saveQueue = Promise.resolve()
let saveRevision = 0

function persistWorkspace(workspace: WorkspaceSnapshot, set: (state: Partial<WorkspaceState>) => void) {
  const desktopApi = window.desktopApi
  if (!desktopApi) {
    set({ saveStatus: 'saved' })
    return
  }

  const revision = ++saveRevision
  set({ saveStatus: 'saving' })
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => desktopApi.saveWorkspace(workspace))
    .then(() => {
      if (revision === saveRevision) set({ saveStatus: 'saved' })
    })
    .catch(() => {
      if (revision === saveRevision) set({ saveStatus: 'error' })
    })
}

function saveWorkspace(_workspace: WorkspaceSnapshot, set: (state: Partial<WorkspaceState>) => void) {
  set({ saveStatus: 'unsaved' })
}

function saveHistory(history: RequestHistoryItem[], set: (state: Partial<WorkspaceState>) => void) {
  const desktopApi = window.desktopApi
  if (!desktopApi) {
    set({ saveStatus: 'saved' })
    return
  }
  set({ saveStatus: 'saving' })
  saveQueue = saveQueue.catch(() => undefined).then(() => desktopApi.saveHistory(history)).then(() => set({ saveStatus: 'saved' })).catch(() => set({ saveStatus: 'error' }))
}

function updateTree(nodes: ApiTreeNode[], updater: (node: ApiTreeNode) => ApiTreeNode): ApiTreeNode[] {
  return nodes.map((node) => updater({ ...node, children: node.children ? updateTree(node.children, updater) : undefined }))
}

function appendTree(nodes: ApiTreeNode[], parentId: string | undefined, child: ApiTreeNode): ApiTreeNode[] {
  if (!parentId) return [...nodes, child]
  return nodes.map((node) => node.id === parentId
    ? { ...node, children: [...(node.children ?? []), child] }
    : { ...node, children: node.children ? appendTree(node.children, parentId, child) : node.children })
}

function insertTree(nodes: ApiTreeNode[], parentId: string | undefined, child: ApiTreeNode, index?: number): ApiTreeNode[] {
  if (!parentId) {
    const next = [...nodes]
    next.splice(index === undefined ? next.length : Math.max(0, Math.min(index, next.length)), 0, child)
    return next
  }
  return nodes.map((node) => node.id === parentId
    ? { ...node, children: (() => { const next = [...(node.children ?? [])]; next.splice(index === undefined ? next.length : Math.max(0, Math.min(index, next.length)), 0, child); return next })() }
    : { ...node, children: node.children ? insertTree(node.children, parentId, child, index) : node.children })
}

function removeTree(nodes: ApiTreeNode[], nodeId: string): ApiTreeNode[] {
  return nodes.filter((node) => node.id !== nodeId).map((node) => ({ ...node, children: node.children ? removeTree(node.children, nodeId) : node.children }))
}

function treeContains(nodes: ApiTreeNode[], nodeId?: string): boolean {
  if (!nodeId) return false
  return nodes.some((node) => node.id === nodeId || (node.children ? treeContains(node.children, nodeId) : false))
}

function findTreeNode(nodes: ApiTreeNode[], nodeId: string): ApiTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const child = node.children ? findTreeNode(node.children, nodeId) : undefined
    if (child) return child
  }
  return undefined
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: undefined,
  activeProtocol: 'http',
  activeEnvironmentId: 'dev',
  saveStatus: 'saved',
  autoSaveEnabled: localStorage.getItem('autoSaveEnabled') !== 'false',
  autoSaveInterval: Number(localStorage.getItem('autoSaveInterval') ?? 60),
  loadWorkspace: async () => {
    let workspace = window.desktopApi ? await window.desktopApi.loadWorkspace() : fallbackWorkspace
    const originalPreferences = workspace.preferences
    const normalizedPreferences = normalizeModelPreferences(originalPreferences)
    workspace = { ...workspace, processVariables: workspace.processVariables ?? [], preferences: normalizedPreferences }
    set({
      workspace,
      activeProtocol: workspace.preferences.activeProtocol,
      activeEnvironmentId: workspace.preferences.activeEnvironmentId,
      activeApiId: workspace.preferences.activeApiId,
      saveStatus: 'saved',
    })
    if (JSON.stringify(normalizedPreferences) !== JSON.stringify(originalPreferences)) persistWorkspace(workspace, set)
  },
  setActiveProtocol: (protocol) => {
    const { activeProtocol, workspace } = get()
    if (!workspace || protocol === activeProtocol) return

    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, activeProtocol: protocol } }
    set({ activeProtocol: protocol, workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  setActiveEnvironmentId: (environmentId) => {
    const { activeEnvironmentId, workspace } = get()
    if (!workspace || environmentId === activeEnvironmentId) return

    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, activeEnvironmentId: environmentId } }
    set({ activeEnvironmentId: environmentId, workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  createEnvironment: (name) => {
    const { workspace } = get()
    if (!workspace || !name.trim()) return undefined
    const id = `env-${crypto.randomUUID()}`
    const environment: Environment = { id, name: name.trim(), variables: [], globalHeaders: [] }
    const nextWorkspace = { ...workspace, environments: [...workspace.environments, environment] }
    set({ workspace: nextWorkspace, activeEnvironmentId: id })
    saveWorkspace(nextWorkspace, set)
    return id
  },
  updateEnvironment: (environment) => {
    const { workspace } = get()
    if (!workspace || !environment.name.trim()) return
    const normalized = { ...environment, name: environment.name.trim() }
    const nextWorkspace = { ...workspace, environments: workspace.environments.some((item) => item.id === environment.id) ? workspace.environments.map((item) => item.id === environment.id ? normalized : item) : [...workspace.environments, normalized] }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  deleteEnvironment: (environmentId) => {
    const { workspace, activeEnvironmentId } = get()
    if (!workspace || workspace.environments.length <= 1) return
    const environments = workspace.environments.filter((item) => item.id !== environmentId)
    const nextActiveId = activeEnvironmentId === environmentId ? environments[0].id : activeEnvironmentId
    const nextWorkspace = { ...workspace, environments, preferences: { ...workspace.preferences, activeEnvironmentId: nextActiveId } }
    set({ workspace: nextWorkspace, activeEnvironmentId: nextActiveId })
    saveWorkspace(nextWorkspace, set)
  },
  updateEnvironmentVariable: (environmentId, variable) => {
    const { workspace } = get()
    if (!workspace || !variable.key.trim()) return
    const nextWorkspace = { ...workspace, environments: workspace.environments.map((env) => env.id !== environmentId ? env : { ...env, variables: env.variables.some((item) => item.id === variable.id) ? env.variables.map((item) => item.id === variable.id ? { ...variable, key: variable.key.trim() } : item) : [...env.variables, { ...variable, key: variable.key.trim() }] }) }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  deleteEnvironmentVariable: (environmentId, variableId) => {
    const { workspace } = get()
    if (!workspace) return
    const nextWorkspace = { ...workspace, environments: workspace.environments.map((env) => env.id === environmentId ? { ...env, variables: env.variables.filter((item) => item.id !== variableId) } : env) }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  updateProcessVariable: (variable) => {
    const { workspace } = get()
    if (!workspace || !variable.key.trim() || !variable.sourceRequestId || !variable.jsonPath.trim()) return
    const current = workspace.processVariables ?? []
    const previous = current.find((item) => item.id === variable.id)
    const sourceChanged = previous && (previous.sourceRequestId !== variable.sourceRequestId || previous.jsonPath !== variable.jsonPath.trim())
    const normalized = {
      ...variable,
      key: variable.key.trim(),
      jsonPath: variable.jsonPath.trim(),
      currentValue: sourceChanged ? undefined : variable.currentValue,
      updatedAt: sourceChanged ? undefined : variable.updatedAt,
      lastError: undefined,
    }
    const processVariables = current.some((item) => item.id === variable.id)
      ? current.map((item) => item.id === variable.id ? normalized : item)
      : [...current, normalized]
    const nextWorkspace = { ...workspace, processVariables }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  deleteProcessVariable: (variableId) => {
    const { workspace } = get()
    if (!workspace) return
    const nextWorkspace = { ...workspace, processVariables: (workspace.processVariables ?? []).filter((item) => item.id !== variableId) }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  captureProcessVariables: (sourceRequestId, responseBody) => {
    const { workspace } = get()
    if (!workspace || !(workspace.processVariables ?? []).some((item) => item.sourceRequestId === sourceRequestId)) return
    let responseData: unknown
    try {
      responseData = JSON.parse(responseBody)
    } catch {
      const processVariables = (workspace.processVariables ?? []).map((item) => item.sourceRequestId === sourceRequestId
        ? { ...item, currentValue: undefined, lastError: '接口响应不是有效的 JSON', updatedAt: new Date().toISOString() }
        : item)
      const nextWorkspace = { ...workspace, processVariables }
      set({ workspace: nextWorkspace })
      saveWorkspace(nextWorkspace, set)
      return
    }
    const updatedAt = new Date().toISOString()
    const processVariables = (workspace.processVariables ?? []).map((item) => {
      if (item.sourceRequestId !== sourceRequestId) return item
      const result = extractJsonPath(responseData, item.jsonPath)
      if (result.ok === false) return { ...item, currentValue: undefined, lastError: result.error, updatedAt }
      return { ...item, currentValue: stringifyProcessVariableValue(result.value), lastError: undefined, updatedAt }
    })
    const nextWorkspace = { ...workspace, processVariables }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  setActiveApiId: (apiId) => {
    const { activeApiId, workspace } = get()
    if (!workspace || apiId === activeApiId) return

    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, activeApiId: apiId } }
    set({ activeApiId: apiId, workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  setOpenApiIds: (apiIds) => {
    const { workspace } = get()
    if (!workspace) return
    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, openApiIds: apiIds } }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  updateRequest: (request) => {
    const { workspace } = get()
    if (!workspace) return
    const exists = workspace.requests.some((item) => item.id === request.id)
    const requests = exists ? workspace.requests.map((item) => item.id === request.id ? request : item) : [...workspace.requests, request]
    const nextWorkspace = { ...workspace, requests }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  addHistory: (item) => {
    const { workspace } = get()
    if (!workspace) return
    const nextWorkspace = { ...workspace, history: [item, ...workspace.history].slice(0, 200) }
    set({ workspace: nextWorkspace })
    saveHistory(nextWorkspace.history, set)
  },
  clearHistory: () => {
    const { workspace } = get()
    if (!workspace || workspace.history.length === 0) return
    const nextWorkspace = { ...workspace, history: [] }
    set({ workspace: nextWorkspace })
    saveHistory([], set)
  },
  createFolder: (parentId, name = '新建目录') => {
    const { workspace } = get()
    if (!workspace || !name.trim()) return undefined
    const id = `folder-${crypto.randomUUID()}`
    const nextWorkspace = { ...workspace, apiTree: appendTree(workspace.apiTree, parentId, { id, type: 'folder', name: name.trim(), parentId, children: [] }) }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
    return id
  },
  createApi: (parentId, input) => {
    const { workspace } = get()
    if (!workspace || !input.name.trim()) return undefined
    const id = `api-${crypto.randomUUID()}`
    const nextWorkspace = { ...workspace, apiTree: appendTree(workspace.apiTree, parentId, { id, type: 'api', name: input.name.trim(), protocol: input.protocol, method: input.method, parentId }), requests: [...workspace.requests, { id, protocol: input.protocol, name: input.name.trim(), method: input.method, url: input.url ?? '', params: [], headers: input.headers ?? [], body: input.body, updatedAt: new Date().toISOString() }] }
    set({ workspace: nextWorkspace, activeApiId: id })
    saveWorkspace(nextWorkspace, set)
    return id
  },
  moveApi: (apiId, parentId, index) => {
    const { workspace } = get()
    if (!workspace) return
    const api = findTreeNode(workspace.apiTree, apiId)
    const target = parentId ? findTreeNode(workspace.apiTree, parentId) : undefined
    if (!api || api.type !== 'api' || (parentId && target?.type !== 'folder') || api.parentId === parentId) return
    const nextApiTree = insertTree(removeTree(workspace.apiTree, apiId), parentId, { ...api, parentId }, index)
    const nextWorkspace = { ...workspace, apiTree: nextApiTree }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  renameNode: (nodeId, name) => {
    const { workspace } = get()
    if (!workspace || !name.trim()) return
    const nextWorkspace = { ...workspace, apiTree: updateTree(workspace.apiTree, (node) => node.id === nodeId ? { ...node, name: name.trim() } : node) }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  deleteNode: (nodeId) => {
    const { workspace, activeApiId } = get()
    if (!workspace) return
    const nextWorkspace = { ...workspace, apiTree: removeTree(workspace.apiTree, nodeId) }
    set({ workspace: nextWorkspace, activeApiId: treeContains(nextWorkspace.apiTree, activeApiId) ? activeApiId : undefined })
    saveWorkspace(nextWorkspace, set)
  },
  saveNow: () => {
    const { workspace } = get()
    if (workspace) persistWorkspace(workspace, set)
  },
  markUnsaved: () => set({ saveStatus: 'unsaved' }),
  setAutoSaveSettings: (enabled, interval) => {
    localStorage.setItem('autoSaveEnabled', String(enabled))
    localStorage.setItem('autoSaveInterval', String(interval))
    set({ autoSaveEnabled: enabled, autoSaveInterval: interval })
  },
  updateLargeModelConfig: (config) => {
    const { workspace } = get()
    if (!workspace) return
    const normalizedConfig = { ...config, thinkingEnabled: config.thinkingEnabled === true }
    const current = workspace.preferences.largeModels ?? []
    const largeModels = current.some((item) => item.id === config.id) ? current.map((item) => item.id === config.id ? normalizedConfig : item) : [...current, normalizedConfig]
    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, largeModels } }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  updateLightModelConfig: (config) => {
    const { workspace } = get()
    if (!workspace) return
    const normalizedConfig = { ...config, maxTokens: Math.max(1, config.maxTokens) }
    const current = workspace.preferences.lightModels ?? []
    const lightModels = current.some((item) => item.id === config.id) ? current.map((item) => item.id === config.id ? normalizedConfig : item) : [...current, normalizedConfig]
    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, lightModels } }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  deleteLargeModelConfig: (configId) => {
    const { workspace } = get()
    if (!workspace) return
    const largeModels = (workspace.preferences.largeModels ?? []).filter((item) => item.id !== configId)
    const activeLargeModelId = workspace.preferences.activeLargeModelId === configId ? undefined : workspace.preferences.activeLargeModelId
    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, largeModels, activeLargeModelId } }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  deleteLightModelConfig: (configId) => {
    const { workspace } = get()
    if (!workspace) return
    const lightModels = (workspace.preferences.lightModels ?? []).filter((item) => item.id !== configId)
    const activeLightModelId = workspace.preferences.activeLightModelId === configId ? undefined : workspace.preferences.activeLightModelId
    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, lightModels, activeLightModelId } }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  activateLargeModelConfig: (configId) => {
    const { workspace } = get()
    if (!workspace?.preferences.largeModels?.some((item) => item.id === configId)) return
    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, activeLargeModelId: configId } }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
  activateLightModelConfig: (configId) => {
    const { workspace } = get()
    if (!workspace?.preferences.lightModels?.some((item) => item.id === configId)) return
    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, activeLightModelId: configId } }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
}))
