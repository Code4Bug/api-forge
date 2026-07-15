import { create } from 'zustand'
import type { ApiTreeNode, Environment, EnvironmentVariable, HttpMethod, KeyValueItem, LargeModelConfig, Protocol, RequestDefinition, RequestHistoryItem, WorkspaceSnapshot } from '@/shared/ipc-contracts'

export function replaceEnvironmentVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{([^{}]+)\}\}/g, (match, key: string) => variables[key] ?? match)
}

export type WorkspaceSaveStatus = 'saving' | 'saved' | 'error'
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
  setAutoSaveSettings: (enabled: boolean, interval: number) => void
  updateLargeModelConfig: (config: LargeModelConfig) => void
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
    largeModel: { enabled: false, provider: 'OpenAI 兼容', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 2048, maxContextTokens: 128000, thinkingEnabled: false },
  },
}

let saveQueue = Promise.resolve()
let saveRevision = 0

function saveWorkspace(workspace: WorkspaceSnapshot, set: (state: Partial<WorkspaceState>) => void) {
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
    const largeModel = workspace.preferences.largeModel
    if (largeModel) {
      const normalizedLargeModel = { ...largeModel, maxContextTokens: Number.isFinite(largeModel.maxContextTokens) ? largeModel.maxContextTokens : 128000, thinkingEnabled: largeModel.thinkingEnabled === true }
      const needsMigration = normalizedLargeModel.maxContextTokens !== largeModel.maxContextTokens || normalizedLargeModel.thinkingEnabled !== largeModel.thinkingEnabled
      if (needsMigration) workspace = { ...workspace, preferences: { ...workspace.preferences, largeModel: normalizedLargeModel } }
    }
    set({
      workspace,
      activeProtocol: workspace.preferences.activeProtocol,
      activeEnvironmentId: workspace.preferences.activeEnvironmentId,
      activeApiId: workspace.preferences.activeApiId,
      saveStatus: 'saved',
    })
    if (largeModel && workspace.preferences.largeModel !== largeModel) saveWorkspace(workspace, set)
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
    if (workspace) saveWorkspace(workspace, set)
  },
  setAutoSaveSettings: (enabled, interval) => {
    localStorage.setItem('autoSaveEnabled', String(enabled))
    localStorage.setItem('autoSaveInterval', String(interval))
    set({ autoSaveEnabled: enabled, autoSaveInterval: interval })
  },
  updateLargeModelConfig: (config) => {
    const { workspace } = get()
    if (!workspace) return
    const normalizedConfig = { ...config, thinkingEnabled: config.thinkingEnabled === true }
    const nextWorkspace = { ...workspace, preferences: { ...workspace.preferences, largeModel: normalizedConfig } }
    set({ workspace: nextWorkspace })
    saveWorkspace(nextWorkspace, set)
  },
}))
