import { contextBridge, ipcRenderer } from 'electron';
const desktopApi = {
    getAppInfo: () => ipcRenderer.invoke('app:get-info'),
    closeWindow: () => ipcRenderer.invoke('app:close-window'),
    checkForUpdates: () => ipcRenderer.invoke('update:check'),
    downloadUpdate: () => ipcRenderer.invoke('update:download'),
    installUpdate: () => ipcRenderer.invoke('update:install'),
    onUpdateStatus: (listener) => {
        const handler = (_event, status) => listener(status);
        ipcRenderer.on('update:status', handler);
        return () => ipcRenderer.removeListener('update:status', handler);
    },
    loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
    saveWorkspace: (workspace) => ipcRenderer.invoke('workspace:save', workspace),
    saveHistory: (history) => ipcRenderer.invoke('history:save', history),
    loadConversations: () => ipcRenderer.invoke('conversations:load'),
    saveConversations: (conversations) => ipcRenderer.invoke('conversations:save', conversations),
    httpSend: (request) => ipcRenderer.invoke('http:send', request),
    httpCancel: (requestId) => ipcRenderer.invoke('http:cancel', requestId),
    socketConnect: (request) => ipcRenderer.invoke('socket:connect', request),
    socketSend: (request) => ipcRenderer.invoke('socket:send', request),
    socketClose: (connectionId) => ipcRenderer.invoke('socket:close', connectionId),
    onSocketEvent: (listener) => {
        const handler = (_event, payload) => listener(payload);
        ipcRenderer.on('socket:event', handler);
        return () => ipcRenderer.removeListener('socket:event', handler);
    },
    onHttpChunk: (listener) => {
        const handler = (_event, payload) => listener(payload);
        ipcRenderer.on('http:chunk', handler);
        return () => ipcRenderer.removeListener('http:chunk', handler);
    },
};
contextBridge.exposeInMainWorld('desktopApi', desktopApi);
ipcRenderer.on('app:menu-action', (_event, action) => {
    window.dispatchEvent(new CustomEvent(`api-forge:${action}`));
});
