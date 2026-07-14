import { contextBridge, ipcRenderer } from 'electron';
const desktopApi = {
    getAppInfo: () => ipcRenderer.invoke('app:get-info'),
    loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
    saveWorkspace: (workspace) => ipcRenderer.invoke('workspace:save', workspace),
    saveHistory: (history) => ipcRenderer.invoke('history:save', history),
    httpSend: (request) => ipcRenderer.invoke('http:send', request),
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
