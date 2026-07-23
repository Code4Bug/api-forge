import { contextBridge, ipcRenderer } from 'electron'
import type { AiConversation, BashExecRequest, BashExecResult, DesktopApi, HttpSendRequest, WorkspaceSnapshot, RequestHistoryItem, SocketConnectRequest, SocketSendRequest, UpdateStatus } from '../../src/shared/ipc-contracts.js'

const desktopApi: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  closeWindow: () => ipcRenderer.invoke('app:close-window'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  selectFile: (options) => ipcRenderer.invoke('dialog:select-file', options),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },
  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  saveWorkspace: (workspace: WorkspaceSnapshot) => ipcRenderer.invoke('workspace:save', workspace),
  saveHistory: (history: RequestHistoryItem[]) => ipcRenderer.invoke('history:save', history),
  loadConversations: () => ipcRenderer.invoke('conversations:load'),
  saveConversations: (conversations: AiConversation[]) => ipcRenderer.invoke('conversations:save', conversations),
  httpSend: (request: HttpSendRequest) => ipcRenderer.invoke('http:send', request),
  httpCancel: (requestId: string) => ipcRenderer.invoke('http:cancel', requestId),
  socketConnect: (request: SocketConnectRequest) => ipcRenderer.invoke('socket:connect', request),
  socketSend: (request: SocketSendRequest) => ipcRenderer.invoke('socket:send', request),
  socketClose: (connectionId: string) => ipcRenderer.invoke('socket:close', connectionId),
  bashExec: (request: BashExecRequest) => ipcRenderer.invoke('bash:exec', request) as Promise<BashExecResult>,
  onSocketEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<NonNullable<DesktopApi['onSocketEvent']>>[0] extends (value: infer T) => void ? T : never) => listener(payload)
    ipcRenderer.on('socket:event', handler)
    return () => ipcRenderer.removeListener('socket:event', handler)
  },
  onHttpChunk: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { requestId: string; chunk: string; done?: boolean; sse?: boolean }) => listener(payload)
    ipcRenderer.on('http:chunk', handler)
    return () => ipcRenderer.removeListener('http:chunk', handler)
  },
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)

ipcRenderer.on('app:menu-action', (_event, action: string) => {
  window.dispatchEvent(new CustomEvent(`api-forge:${action}`))
})
