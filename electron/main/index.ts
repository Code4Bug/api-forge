import { app, BrowserWindow, Menu, nativeImage, ipcMain, screen } from 'electron'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as net from 'node:net'
import * as dgram from 'node:dgram'
import type { RequestHistoryItem, WorkspaceSnapshot } from '../../src/shared/ipc-contracts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged
app.setName('API-forge')
app.setAppUserModelId('com.api-test-tools.desktop')
const WORKSPACE_VERSION = 2

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

function runtimeLogPath() {
  const date = new Date().toISOString().slice(0, 10)
  const homePath = process.env.HOME ?? process.env.USERPROFILE ?? app.getPath('home')
  return join(homePath, '.api-forge', 'logs', `runtime-${date}.log`)
}

function writeRuntimeLog(level: string, args: unknown[]) {
  try {
    const targetPath = runtimeLogPath()
    mkdirSync(dirname(targetPath), { recursive: true })
    const message = args.map((value) => value instanceof Error ? `${value.message}\n${value.stack ?? ''}` : typeof value === 'string' ? value : JSON.stringify(value)).join(' ')
    appendFileSync(targetPath, `${new Date().toISOString()} [${level}] ${message}\n`, 'utf8')
  } catch {
    // 日志写入失败不能影响应用运行。
  }
}

function installRuntimeLogging() {
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    console[level] = (...args: unknown[]) => {
      originalConsole[level](...args)
      writeRuntimeLog(level.toUpperCase(), args)
    }
  }
  process.on('uncaughtException', (error) => {
    writeRuntimeLog('UNCAUGHT_EXCEPTION', [error])
  })
  process.on('unhandledRejection', (reason) => {
    writeRuntimeLog('UNHANDLED_REJECTION', [reason])
  })
  process.on('exit', (code) => {
    writeRuntimeLog('EXIT', [`code=${code}`])
  })
  writeRuntimeLog('START', [`API-forge ${app.getVersion()} started`, `packaged=${app.isPackaged}`, `platform=${process.platform}`, `arch=${process.arch}`])
}

installRuntimeLogging()

const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B0F14"/><rect x="8" y="10" width="48" height="44" rx="8" fill="#111821" stroke="#263342" stroke-width="2"/><path d="M18 24l8 8-8 8" fill="none" stroke="#32F08C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 41h13" stroke="#42D9FF" stroke-width="4" stroke-linecap="round"/><circle cx="17" cy="17" r="2" fill="#42D9FF"/><circle cx="24" cy="17" r="2" fill="#32F08C"/></svg>`

const defaultWorkspace: WorkspaceSnapshot = {
  version: WORKSPACE_VERSION,
  apiTree: [
    {
      id: 'folder-core',
      type: 'folder',
      name: '核心接口',
      children: [
        {
          id: 'api-orders',
          type: 'api',
          name: '订单列表',
          method: 'GET',
          protocol: 'http',
          parentId: 'folder-core',
        },
        {
          id: 'api-order-detail',
          type: 'api',
          name: '订单详情',
          method: 'GET',
          protocol: 'http',
          parentId: 'folder-core',
        },
        {
          id: 'api-order-create',
          type: 'api',
          name: '创建订单',
          method: 'POST',
          protocol: 'http',
          parentId: 'folder-core',
        },
      ],
    },
    {
      id: 'folder-realtime',
      type: 'folder',
      name: '实时连接',
      children: [
        {
          id: 'api-ws-market',
          type: 'api',
          name: '行情 WebSocket',
          protocol: 'websocket',
          parentId: 'folder-realtime',
        },
        {
          id: 'api-socket-health',
          type: 'api',
          name: '服务健康检查',
          protocol: 'socket',
          parentId: 'folder-realtime',
        },
      ],
    },
    {
      id: 'folder-users',
      type: 'folder',
      name: '用户中心',
      children: [
        {
          id: 'api-user-profile',
          type: 'api',
          name: '用户资料',
          method: 'GET',
          protocol: 'http',
          parentId: 'folder-users',
        },
        {
          id: 'api-user-logout',
          type: 'api',
          name: '注销账户',
          method: 'DELETE',
          protocol: 'http',
          parentId: 'folder-users',
        },
      ],
    },
  ],
  environments: [
    {
      id: 'dev',
      name: 'Dev',
      variables: [
        { id: 'base-url', key: 'base_url', value: 'https://api.dev.local', type: 'text', scope: 'environment' },
        { id: 'token', key: 'token', value: 'dev-token-********', type: 'secret', scope: 'environment' },
      ],
      globalHeaders: [{ id: 'trace', key: 'X-Trace-Id', value: '{{trace_id}}', enabled: true }],
    },
    {
      id: 'test',
      name: 'Test',
      variables: [{ id: 'test-base-url', key: 'base_url', value: 'https://api.test.local', type: 'text', scope: 'environment' }],
      globalHeaders: [],
    },
    {
      id: 'prod',
      name: 'Prod',
      variables: [{ id: 'prod-base-url', key: 'base_url', value: 'https://api.example.com', type: 'text', scope: 'environment' }],
      globalHeaders: [],
    },
  ],
  requests: [],
  history: [
    {
      id: 'history-1',
      protocol: 'http',
      method: 'GET',
      url: '{{base_url}}/v1/orders',
      status: 200,
      durationMs: 128,
      sizeBytes: 4821,
      environmentId: 'dev',
      createdAt: new Date().toISOString(),
      requestSnapshot: {},
      responseSnapshot: {},
    },
  ],
  preferences: {
    activeEnvironmentId: 'dev',
    activeProtocol: 'http',
    openApiIds: [],
    theme: 'dark',
    largeModel: {
      enabled: false,
      provider: 'OpenAI 兼容',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 2048,
      maxContextTokens: 128000,
    },
  },
}

const socketConnections = new Map<string, net.Socket | dgram.Socket>()
const httpControllers = new Map<string, AbortController>()
const canceledHttpRequests = new Set<string>()
function emitSocket(event: Electron.IpcMainInvokeEvent, payload: { connectionId: string; type: 'open' | 'data' | 'close' | 'error'; data?: string; hex?: string; error?: string }) {
  event.sender.send('socket:event', payload)
}

function workspacePath() {
  return join(app.getPath('home'), '.api-forge', 'workspace.json')
}

function historyPath() {
  return join(app.getPath('home'), '.api-forge', 'history.json')
}

function windowStatePath() {
  return join(app.getPath('home'), '.api-forge', 'window-state.json')
}

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

function readWindowState(): WindowState {
  const fallback = { width: 1440, height: 920, isMaximized: false }
  try {
    const state = JSON.parse(readFileSync(windowStatePath(), 'utf-8')) as Partial<WindowState>
    if (!Number.isFinite(state.width) || !Number.isFinite(state.height)) return fallback
    return { ...fallback, ...state }
  } catch {
    return fallback
  }
}

function isWindowStateVisible(state: WindowState) {
  if (state.x === undefined || state.y === undefined) return true
  return screen.getAllDisplays().some((display) => {
    const bounds = display.bounds
    return state.x! + state.width > bounds.x && state.x! < bounds.x + bounds.width && state.y! + state.height > bounds.y && state.y! < bounds.y + bounds.height
  })
}

function saveWindowState(window: BrowserWindow) {
  const bounds = window.getNormalBounds()
  const state: WindowState = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, isMaximized: window.isMaximized() }
  try {
    const targetPath = windowStatePath()
    const directory = dirname(targetPath)
    mkdirSync(directory, { recursive: true })
    writeFileSync(targetPath, JSON.stringify(state, null, 2), 'utf-8')
  } catch {
    // 窗口状态保存失败不影响应用关闭。
  }
}

async function readWorkspace(): Promise<WorkspaceSnapshot> {
  try {
    const content = await readFile(workspacePath(), 'utf-8')
    const workspace = JSON.parse(content) as WorkspaceSnapshot
    if (workspace.version === WORKSPACE_VERSION) {
      const history = await readHistory()
      const embeddedHistory = Array.isArray(workspace.history) ? workspace.history : []
      if (history.length === 0 && embeddedHistory.length > 0) await writeHistory(embeddedHistory)
      return { ...workspace, history: history.length > 0 ? history : embeddedHistory }
    }
    await writeWorkspace(defaultWorkspace)
    await writeHistory(defaultWorkspace.history)
    return defaultWorkspace
  } catch {
    await writeWorkspace(defaultWorkspace)
    await writeHistory(defaultWorkspace.history)
    return defaultWorkspace
  }
}

async function readHistory(): Promise<RequestHistoryItem[]> {
  try {
    const content = await readFile(historyPath(), 'utf-8')
    const history = JSON.parse(content) as unknown
    return Array.isArray(history) ? history as RequestHistoryItem[] : []
  } catch {
    return []
  }
}

async function writeHistory(history: RequestHistoryItem[]) {
  const targetPath = historyPath()
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, JSON.stringify(history, null, 2), 'utf-8')
  return { ok: true as const }
}

async function writeWorkspace(workspace: WorkspaceSnapshot) {
  const targetPath = workspacePath()
  const directory = dirname(targetPath)
  const temporaryPath = join(directory, `.workspace-${process.pid}-${Date.now()}-${randomUUID()}.tmp`)
  await mkdir(directory, { recursive: true })

  try {
    const { history: _history, ...workspaceOnly } = workspace
    await writeFile(temporaryPath, JSON.stringify(workspaceOnly, null, 2), 'utf-8')
    await rename(temporaryPath, targetPath)
    return { ok: true as const }
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

function createApplicationMenu(mainWindow: BrowserWindow) {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' as const }] }] : []),
    {
      label: '文件',
      submenu: [
        { label: '新建 API', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('app:menu-action', 'new-api') },
        { label: '保存请求', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('app:menu-action', 'save-request') },
        { type: 'separator' },
        { label: '关闭窗口', role: 'close' as const },
        { label: '退出应用', accelerator: 'CmdOrCtrl+Q', click: () => app.exit(0) },
      ],
    },
    {
      label: '编辑',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: '查看',
      submenu: [
        { role: 'reload' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools', visible: isDev },
      ],
    },
    {
      label: '窗口',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ role: 'front' as const }] : [])],
    },
    {
      label: '帮助',
      submenu: [{ label: '关于 API-forge', click: () => mainWindow.webContents.send('app:menu-action', 'about') }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const iconPath = join(__dirname, isDev ? '../../../public/favicon.png' : '../../../dist/favicon.png')
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(appIconSvg).toString('base64')}`))
  }
  const savedState = readWindowState()
  const windowState = isWindowStateVisible(savedState) ? savedState : { width: 1440, height: 920, isMaximized: false }
  const mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 640,
    minHeight: 720,
    title: 'API-forge',
    show: true,
    icon: iconPath,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5174').catch((error) => {
      console.error('加载开发页面失败:', error)
    })
  } else {
    void mainWindow.loadFile(join(__dirname, '../../../dist/index.html')).catch((error) => {
      console.error('加载应用页面失败:', error)
    })
  }
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.info(`渲染进程 console level=${level} ${sourceId}:${line}`, message)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    console.info('应用页面加载完成')
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('应用页面加载失败:', { errorCode, errorDescription, validatedURL, isMainFrame })
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('渲染进程退出:', details)
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  if (windowState.isMaximized) mainWindow.maximize()
  const persistWindowState = () => saveWindowState(mainWindow)
  mainWindow.on('move', persistWindowState)
  mainWindow.on('resize', persistWindowState)
  mainWindow.on('maximize', persistWindowState)
  mainWindow.on('unmaximize', persistWindowState)
  mainWindow.on('close', persistWindowState)
  createApplicationMenu(mainWindow)
}

ipcMain.handle('app:get-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
}))

ipcMain.handle('workspace:load', readWorkspace)
ipcMain.handle('workspace:save', (_event, workspace: WorkspaceSnapshot) => writeWorkspace(workspace))
ipcMain.handle('history:save', (_event, history: RequestHistoryItem[]) => writeHistory(history))
ipcMain.handle('socket:connect', async (event, request) => {
  const { connectionId, protocol, host, port, timeout = 5000 } = request as { connectionId: string; protocol: 'tcp' | 'udp'; host: string; port: number; timeout?: number }
  if (!connectionId || !host || !Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: '主机和端口无效' }
  if (socketConnections.has(connectionId)) return { ok: false, error: '连接已存在' }
  return await new Promise((resolve) => {
    const socket = protocol === 'tcp' ? net.createConnection({ host, port }) : dgram.createSocket('udp4')
    socketConnections.set(connectionId, socket)
    let settled = false
    const finish = (result: { ok: true } | { ok: false; error: string }) => { if (!settled) { settled = true; resolve(result) } }
    const timer = setTimeout(() => { if (socket instanceof net.Socket) socket.destroy(); else socket.close(); socketConnections.delete(connectionId); finish({ ok: false, error: '连接超时' }) }, timeout)
    if (protocol === 'tcp') {
      const tcp = socket as net.Socket
      tcp.on('connect', () => { clearTimeout(timer); emitSocket(event, { connectionId, type: 'open' }); finish({ ok: true }) })
      tcp.on('data', (buf) => emitSocket(event, { connectionId, type: 'data', data: buf.toString('utf8'), hex: buf.toString('hex') }))
      tcp.on('close', () => { socketConnections.delete(connectionId); emitSocket(event, { connectionId, type: 'close' }) })
      tcp.on('error', (error) => { clearTimeout(timer); emitSocket(event, { connectionId, type: 'error', error: error.message }); finish({ ok: false, error: error.message }) })
    } else {
      const udp = socket as dgram.Socket
      udp.on('listening', () => { clearTimeout(timer); emitSocket(event, { connectionId, type: 'open' }); finish({ ok: true }) })
      udp.on('message', (buf) => emitSocket(event, { connectionId, type: 'data', data: buf.toString('utf8'), hex: buf.toString('hex') }))
      udp.on('error', (error) => { clearTimeout(timer); emitSocket(event, { connectionId, type: 'error', error: error.message }); finish({ ok: false, error: error.message }) })
      udp.bind()
    }
  })
})
ipcMain.handle('socket:send', (_event, request) => {
  const socket = socketConnections.get(request.connectionId)
  if (!socket) return { ok: false, error: '尚未连接' }
  const buffer = Buffer.from(request.data, request.encoding === 'hex' ? 'hex' : 'utf8')
  if (socket instanceof net.Socket) socket.write(buffer)
  else socket.send(buffer, request.port, request.host)
  return { ok: true }
})
ipcMain.handle('socket:close', (_event, connectionId: string) => { const socket = socketConnections.get(connectionId); if (!socket) return { ok: true }; if (socket instanceof net.Socket) socket.destroy(); else socket.close(); socketConnections.delete(connectionId); return { ok: true } })
ipcMain.handle('http:send', async (event, request) => {
  const startedAt = Date.now()
  const timeout = request.timeout ?? 30000

  if (!request.url || timeout <= 0) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'URL and a positive timeout are required' } }
  }

  const controller = new AbortController()
  if (request.requestId) {
    httpControllers.set(request.requestId, controller)
    if (canceledHttpRequests.has(request.requestId)) controller.abort()
  }
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      signal: controller.signal,
    })
    const headers = Object.fromEntries(response.headers.entries())
    const contentType = headers['content-type'] ?? ''
    const isSse = contentType.toLowerCase().startsWith('text/event-stream')
    let body = ''
    if (response.body) {
      const reader = response.body.getReader()
      controller.signal.addEventListener('abort', () => { void reader.cancel().catch(() => undefined) }, { once: true })
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        body += chunk
        if (request.requestId) event.sender.send('http:chunk', { requestId: request.requestId, chunk, sse: isSse })
      }
      const tail = decoder.decode()
      body += tail
      if (tail && request.requestId) event.sender.send('http:chunk', { requestId: request.requestId, chunk: tail, sse: isSse })
    }
    if (request.requestId) event.sender.send('http:chunk', { requestId: request.requestId, chunk: '', done: true, sse: isSse })
    const sizeBytes = Buffer.byteLength(body, 'utf8')

    return {
      ok: true,
      status: response.status,
      headers,
      body,
      durationMs: Date.now() - startedAt,
      sizeBytes,
    }
  } catch (error) {
    const isCanceled = Boolean(request.requestId && canceledHttpRequests.has(request.requestId))
    const isTimeout = controller.signal.aborted && !isCanceled
    if (request.requestId) canceledHttpRequests.delete(request.requestId)
    return {
      ok: false,
      error: {
        code: isCanceled ? 'CANCELED' : isTimeout ? 'TIMEOUT' : error instanceof TypeError ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR',
        message: isCanceled ? '请求已中断' : isTimeout ? `Request timed out after ${timeout}ms` : error instanceof Error ? error.message : 'HTTP request failed',
      },
    }
  } finally {
    clearTimeout(timer)
    if (request.requestId) httpControllers.delete(request.requestId)
  }
})
ipcMain.handle('http:cancel', (_event, requestId: string) => { canceledHttpRequests.add(requestId); httpControllers.get(requestId)?.abort(); return { ok: true } })

app.whenReady().then(() => {
  app.setName('API-forge')
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({ applicationName: 'API-forge', applicationVersion: app.getVersion() })
  }
  createWindow()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  app.exit(0)
})

app.on('will-quit', () => {
  for (const window of BrowserWindow.getAllWindows()) window.destroy()
})
