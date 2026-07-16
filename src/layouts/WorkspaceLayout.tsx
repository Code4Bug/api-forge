import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { BookOpen, Boxes, Cable, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Copy, Download, FileCode2, FilePlus2, Folder, History, LoaderCircle, MoreVertical, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Radio, Search, Settings2, Trash2, X, Sparkles } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { getActiveLargeModel } from '@/shared/ipc-contracts'
import { themePresets, useTheme, type Theme } from '@/hooks/useTheme'
import AIAssistantPage from '@/pages/AIAssistantPage'
import type { ApiTreeNode, HttpFieldItem, HttpMethod, Protocol } from '@/shared/ipc-contracts'
import logo from '@/assets/icons/favicon.svg'
import lightLogo from '@/assets/icons/favicon-light.svg'

function treeHasMatch(nodes: ApiTreeNode[], query: string): boolean {
  if (!query) return nodes.length > 0
  return nodes.some((node) => node.name.toLowerCase().includes(query.toLowerCase()) || (node.children ? treeHasMatch(node.children, query) : false))
}

function flattenApiNodes(nodes: ApiTreeNode[]): ApiTreeNode[] {
  return nodes.flatMap((node) => node.type === 'api' ? [node] : flattenApiNodes(node.children ?? []))
}

function flattenFolders(nodes: ApiTreeNode[]): ApiTreeNode[] {
  return nodes.flatMap((node) => node.type === 'folder' ? [node, ...flattenFolders(node.children ?? [])] : [])
}

function flattenNodeIds(node: ApiTreeNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(flattenNodeIds)]
}

function findApiNode(nodes: ApiTreeNode[], apiId?: string): ApiTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === apiId) return node
    const child = node.children ? findApiNode(node.children, apiId) : undefined
    if (child) return child
  }
  return undefined
}

function flattenTreeApis(node: ApiTreeNode): ApiTreeNode[] {
  return node.type === 'api' ? [node] : (node.children ?? []).flatMap(flattenTreeApis)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character))
}

function downloadFile(name: string, content: string, type: string) {
  const safeName = [...name].map((character) => /[<>:"/\\|?*]/.test(character) || character.charCodeAt(0) < 32 ? '_' : character).join('').replace(/\.+$/, '') || 'api-forge-export'
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = safeName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const protocolMethods: Record<Protocol, HttpMethod[]> = {
  http: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
  websocket: [],
  socket: [],
}

function ApiTypeIcon({ protocol, active }: { protocol?: Protocol; active: boolean }) {
  const Icon = protocol === 'websocket' ? Radio : protocol === 'socket' ? Cable : FileCode2
  return <Icon className={`h-3.5 w-3.5 ${active ? 'text-cyan-200' : protocol === 'websocket' ? 'text-violet-300' : protocol === 'socket' ? 'text-amber-300' : 'text-blue-300'}`} />
}

function methodClass(method?: HttpMethod) {
  if (method === 'GET') return 'border-emerald-500/40 bg-emerald-400/10 text-emerald-200'
  if (method === 'POST') return 'border-blue-500/40 bg-blue-400/10 text-blue-200'
  if (method === 'PUT') return 'border-amber-500/40 bg-amber-400/10 text-amber-200'
  if (method === 'PATCH') return 'border-violet-500/40 bg-violet-400/10 text-violet-200'
  if (method === 'DELETE') return 'border-rose-500/40 bg-rose-400/10 text-rose-200'
  if (method === 'HEAD') return 'border-cyan-500/40 bg-cyan-400/10 text-cyan-200'
  return 'border-zinc-500/40 bg-zinc-400/10 text-zinc-200'
}

function socketType(node: ApiTreeNode) {
  if (node.protocol !== 'socket') return undefined
  const value = `${node.name} ${node.id}`.toLowerCase()
  return value.includes('udp') ? 'UDP' : 'TCP'
}

function parseCurlCommand(value: string): { name: string; method: HttpMethod; protocol: Protocol; url: string; headers: HttpFieldItem[]; body?: string } | undefined {
  if (!/\bcurl\b/i.test(value)) return undefined
  const normalized = value.replace(/(?:\\|\^)\r?\n/g, ' ').replace(/\r?\n/g, ' ')
  const url = normalized.match(/https?:\/\/[^\s'"\\]+/i)?.[0]
  if (!url) return undefined
  const methodMatch = normalized.match(/(?:-X|--request)\s+['"]?([A-Z]+)['"]?/i)
  const bodyMatch = normalized.match(/(?:-d|--data|--data-raw|--data-binary)\s+(['"])([\s\S]*?)\1/i)
  const method = (methodMatch?.[1]?.toUpperCase() ?? (bodyMatch ? 'POST' : 'GET')) as HttpMethod
  const parsed = new URL(url)
  const headers = [...normalized.matchAll(/(?:-H|--header)\s+(['"])([\s\S]*?)\1/gi)].map((match, index) => {
    const [key, ...valueParts] = match[2].split(':')
    return { id: `curl-header-${index}`, key: key.trim(), value: valueParts.join(':').trim(), enabled: true }
  }).filter((item) => item.key)
  return { name: `${method} ${parsed.pathname || '/'}`, method, protocol: 'http', url, headers, body: bodyMatch?.[2] }
}

function TreeNode({ node, depth = 0, index = 0, query = '', onOpenApi, onCreateFolder, onCreateApi, onRename, onDelete, onMoveApi, onCopyName, onCopyCurl, onExportFolder }: { node: ApiTreeNode; depth?: number; index?: number; query?: string; onOpenApi: (node: ApiTreeNode) => void; onCreateFolder: (parentId: string) => void; onCreateApi: (parentId?: string) => void; onRename: (node: ApiTreeNode) => void; onDelete: (node: ApiTreeNode) => void; onMoveApi: (apiId: string, parentId?: string, index?: number) => void; onCopyName: (node: ApiTreeNode) => void; onCopyCurl: (node: ApiTreeNode) => void; onExportFolder: (node: ApiTreeNode, format: 'markdown' | 'html') => void }) {
  const isFolder = node.type === 'folder'
  const { activeApiId } = useWorkspaceStore()
  const isActive = activeApiId === node.id
  const [expanded, setExpanded] = useState(true)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isDropTarget, setIsDropTarget] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [morePosition, setMorePosition] = useState<{ top: number; left: number }>()
  const [exportOpen, setExportOpen] = useState(false)
  const [exportPosition, setExportPosition] = useState<{ top: number; left: number }>()
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const morePortalRef = useRef<HTMLDivElement>(null)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const matches = !query || node.name.toLowerCase().includes(query.toLowerCase()) || node.children?.some((child) => child.name.toLowerCase().includes(query.toLowerCase()))
  useEffect(() => {
    const clear = () => {
      setIsDragOver(false)
      setIsDropTarget(false)
    }
    // 拖拽事件可能被子节点阻止冒泡，使用捕获阶段确保目录高亮始终清理。
    window.addEventListener('dragend', clear, true)
    window.addEventListener('drop', clear, true)
    return () => {
      window.removeEventListener('dragend', clear, true)
      window.removeEventListener('drop', clear, true)
    }
  }, [])

  useEffect(() => {
    if (!moreOpen) return
    const close = (event: MouseEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node) && !morePortalRef.current?.contains(event.target as Node) && !exportMenuRef.current?.contains(event.target as Node)) {
        setMoreOpen(false)
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moreOpen])

  if (!matches) return null

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    if (isFolder) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', node.id)
  }

  function clearDragState() {
    setIsDragOver(false)
    setIsDropTarget(false)
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    clearDragState()
    window.setTimeout(clearDragState, 0)
    if (!isFolder) {
      const apiId = event.dataTransfer.getData('text/plain')
      if (apiId && apiId !== node.id) onMoveApi(apiId, node.parentId, index)
      return
    }
    const apiId = event.dataTransfer.getData('text/plain')
    if (apiId) onMoveApi(apiId, node.id)
  }

  return (
    <div>
      <div role="button" tabIndex={0} draggable={!isFolder} onDragStart={handleDragStart} onDragEnd={clearDragState} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (isFolder) setIsDragOver(true); else setIsDropTarget(true) }} onDragLeave={clearDragState} onDrop={handleDrop} onClick={() => isFolder ? setExpanded((value) => !value) : onOpenApi(node)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (isFolder) setExpanded((value) => !value); else onOpenApi(node) } }} className={`group flex h-8 w-full items-center rounded text-left ${isDragOver ? 'bg-cyan-400/20 ring-1 ring-cyan-400/50' : isDropTarget ? 'bg-cyan-400/10 ring-1 ring-cyan-400/30' : isActive ? 'bg-cyan-400/10' : ''}`}>
        <div className={`flex min-w-0 flex-1 items-center gap-1.5 py-0 pr-0 text-xs ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`} style={{ paddingLeft: 8 + depth * 14 }}>
          {isFolder ? (expanded ? <ChevronDown className="h-3 w-3 text-zinc-500" /> : <ChevronRight className="h-3 w-3 text-zinc-500" />) : <span className="w-3" />}
          {isFolder ? <Folder className="h-3.5 w-3.5 text-amber-300" /> : <ApiTypeIcon protocol={node.protocol} active={isActive} />}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {node.method && <span className={`mr-1 inline-flex h-5 min-w-11 items-center justify-center rounded border px-1.5 text-[10px] font-semibold ${methodClass(node.method)}`}>{node.method}</span>}
          {socketType(node) && <span className={`mr-1 inline-flex h-5 min-w-10 items-center justify-center rounded border px-1.5 text-[10px] font-semibold ${socketType(node) === 'UDP' ? 'border-violet-500/40 bg-violet-400/10 text-violet-200' : 'border-amber-500/40 bg-amber-400/10 text-amber-200'}`}>{socketType(node)}</span>}
        </div>
        <div className={`mr-1 flex shrink-0 items-center gap-0.5 transition-opacity ${moreOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {isFolder && <><button onClick={(event) => { event.stopPropagation(); onCreateFolder(node.id) }} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" title="新增目录"><Plus className="h-3 w-3" /></button><button onClick={(event) => { event.stopPropagation(); onCreateApi(node.id) }} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" title="新增 API"><FilePlus2 className="h-3 w-3" /></button></>}
          <button onClick={(event) => { event.stopPropagation(); onRename(node) }} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" title="重命名"><Pencil className="h-3 w-3" /></button>
          <button onClick={(event) => { event.stopPropagation(); onDelete(node) }} className="rounded p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-200" title="删除"><Trash2 className="h-3 w-3" /></button>
          <div ref={moreMenuRef} className="relative">
            <button ref={moreButtonRef} onClick={(event) => { event.stopPropagation(); const rect = moreButtonRef.current?.getBoundingClientRect(); if (rect) setMorePosition({ top: rect.bottom - 8, left: rect.right - 12 }); setMoreOpen((value) => !value) }} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" title="更多操作" aria-label="更多操作" aria-expanded={moreOpen}><MoreVertical className="h-3 w-3" /></button>
          </div>
        </div>
      </div>
      {moreOpen && morePosition && createPortal(<div ref={morePortalRef} className="fixed z-[9998] w-48 rounded border border-zinc-700 bg-[#111821] p-1 shadow-2xl" style={{ top: morePosition.top, left: morePosition.left }} onClick={(event) => event.stopPropagation()}>
        <button ref={exportButtonRef} onClick={() => { const rect = exportButtonRef.current?.getBoundingClientRect(); if (rect) setExportPosition({ top: rect.top, left: rect.right + 4 }); setExportOpen((value) => !value) }} className="flex h-8 w-full items-center justify-between gap-2 rounded px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800"><span className="flex items-center gap-2"><Download className="h-3.5 w-3.5" />导出 API 文档</span><ChevronRight className="h-3.5 w-3.5 text-zinc-500" /></button>
        {!isFolder && <button onClick={() => { setMoreOpen(false); onCopyCurl(node) }} className="flex h-8 w-full items-center gap-2 whitespace-nowrap rounded px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800"><Copy className="h-3.5 w-3.5 shrink-0" />复制为 cURL 命令</button>}
        <button onClick={() => { setMoreOpen(false); onCopyName(node) }} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800"><Copy className="h-3.5 w-3.5" />复制名称</button>
      </div>, document.body)}
      {exportOpen && exportPosition && createPortal(<div ref={exportMenuRef} className="fixed z-[9999] w-32 rounded border border-zinc-700 bg-[#111821] p-1 shadow-2xl" style={{ top: exportPosition.top, left: exportPosition.left }}><button onClick={() => { setMoreOpen(false); setExportOpen(false); onExportFolder(node, 'markdown') }} className="flex h-8 w-full items-center rounded px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800">Markdown</button><button onClick={() => { setMoreOpen(false); setExportOpen(false); onExportFolder(node, 'html') }} className="flex h-8 w-full items-center rounded px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800">HTML</button></div>, document.body)}
      {isFolder && expanded && <div onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setIsDragOver(true) }} onDragLeave={clearDragState} onDrop={handleDrop} className={isDragOver ? 'rounded bg-cyan-400/5' : ''}>{node.children?.map((child, childIndex) => <TreeNode key={child.id} node={child} index={childIndex} depth={depth + 1} query={query} onOpenApi={onOpenApi} onCreateFolder={onCreateFolder} onCreateApi={onCreateApi} onRename={onRename} onDelete={onDelete} onMoveApi={onMoveApi} onCopyName={onCopyName} onCopyCurl={onCopyCurl} onExportFolder={onExportFolder} />)}</div>}
    </div>
  )
}

const saveStatusContent = {
  unsaved: { label: '有未保存修改', icon: CircleAlert, className: 'text-amber-300' },
  saving: { label: '正在保存', icon: LoaderCircle, className: 'text-zinc-400' },
  saved: { label: '已保存', icon: CheckCircle2, className: 'text-emerald-400' },
  error: { label: '保存失败', icon: CircleAlert, className: 'text-red-400' },
} as const

export function WorkspaceLayout() {
  const { workspace, activeApiId, activeEnvironmentId, saveStatus, autoSaveEnabled, autoSaveInterval, loadWorkspace, saveNow, setActiveApiId, setActiveEnvironmentId, setOpenApiIds: saveOpenApiIds, createFolder, createApi, updateRequest, moveApi, renameNode, deleteNode } = useWorkspaceStore()
  const { theme, setTheme, isDark } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [openApiIds, setOpenApiIds] = useState<string[]>([])
  const [tabsInitialized, setTabsInitialized] = useState(false)
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number }>()
  const [dialog, setDialog] = useState<{ mode: 'folder' | 'api' | 'rename'; parentId?: string; node?: ApiTreeNode }>()
  const [dialogName, setDialogName] = useState('')
  const [dialogDescription, setDialogDescription] = useState('')
  const [dialogFolderId, setDialogFolderId] = useState<string | undefined>()
  const [dialogProtocol, setDialogProtocol] = useState<Protocol>('http')
  const [dialogMethod, setDialogMethod] = useState<HttpMethod | undefined>('GET')
  const [pendingCurl, setPendingCurl] = useState('')
  const [parsedCurl, setParsedCurl] = useState<ReturnType<typeof parseCurlCommand>>()
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem('sidebarWidth') ?? 260))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')
  const [resizingSidebar, setResizingSidebar] = useState(false)
  const sidebarResizeOffsetRef = useRef(0)
  const deleteConfirmingRef = useRef(false)
  const apiTabsRef = useRef<HTMLDivElement>(null)
  const [hasPreviousApiTabs, setHasPreviousApiTabs] = useState(false)
  const [hasMoreApiTabs, setHasMoreApiTabs] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const statusContent = saveStatusContent[saveStatus]
  const SaveStatusIcon = statusContent.icon
  const modelConfig = getActiveLargeModel(workspace?.preferences)
  const aiReady = Boolean(modelConfig?.baseUrl.trim() && modelConfig.model.trim())

  useEffect(() => {
    void window.desktopApi?.getAppInfo().then((info) => setAppVersion(info.version)).catch(() => undefined)
  }, [])

  useEffect(() => {
    localStorage.setItem('sidebarWidth', String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!resizingSidebar) return
    function handlePointerMove(event: PointerEvent) {
      setSidebarWidth(Math.min(420, Math.max(220, event.clientX - sidebarResizeOffsetRef.current)))
    }
    function stopResize() {
      setResizingSidebar(false)
    }
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', stopResize)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', stopResize)
    }
  }, [resizingSidebar])

  useEffect(() => {
    if (!dialog && !tabMenu) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (dialog) setDialog(undefined)
      else if (tabMenu) setTabMenu(undefined)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [dialog, tabMenu])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  useEffect(() => {
    if (!autoSaveEnabled || !workspace) return
    const timer = window.setInterval(saveNow, autoSaveInterval * 1000)
    return () => window.clearInterval(timer)
  }, [autoSaveEnabled, autoSaveInterval, workspace, saveNow])

  useEffect(() => {
    function checkClipboard() {
      void navigator.clipboard?.readText().then((text) => {
        setPendingCurl(parseCurlCommand(text) ? text : '')
      }).catch(() => undefined)
    }
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (location.pathname === '/settings') {
          window.dispatchEvent(new CustomEvent('api-forge:save-settings'))
          return
        }
        const isApiDetail = ['/http', '/websocket', '/socket'].includes(location.pathname)
        const activeNode = findApiNode(workspace?.apiTree ?? [], activeApiId)
        if (isApiDetail && activeNode?.type === 'api' && activeNode.name.trim()) {
          window.dispatchEvent(new CustomEvent('api-forge:save-request'))
        } else if (isApiDetail) {
          openDialog({ mode: 'api', parentId: activeNode?.parentId })
        } else {
          saveNow()
        }
      }
    }
    function handleNewApi() {
      openDialog({ mode: 'api' })
    }
    window.addEventListener('focus', checkClipboard)
    document.addEventListener('visibilitychange', checkClipboard)
    window.addEventListener('keydown', handleShortcut)
    window.addEventListener('api-forge:new-api', handleNewApi)
    checkClipboard()
    return () => {
      window.removeEventListener('focus', checkClipboard)
      document.removeEventListener('visibilitychange', checkClipboard)
      window.removeEventListener('keydown', handleShortcut)
      window.removeEventListener('api-forge:new-api', handleNewApi)
    }
  }, [activeApiId, location.pathname, saveNow, workspace])

  const apiNodes = workspace ? flattenApiNodes(workspace.apiTree) : []
  const openApis = apiNodes.filter((node) => openApiIds.includes(node.id))

  function updateApiTabsOverflow() {
    const tabs = apiTabsRef.current
    if (!tabs) return
    setHasPreviousApiTabs(tabs.scrollLeft > 1)
    setHasMoreApiTabs(tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1)
  }

  useEffect(() => {
    updateApiTabsOverflow()
    window.addEventListener('resize', updateApiTabsOverflow)
    return () => window.removeEventListener('resize', updateApiTabsOverflow)
  }, [openApis.length])

  useEffect(() => {
    if (!workspace || tabsInitialized) return
    const ids = workspace.preferences.openApiIds ?? []
    setOpenApiIds(ids)
    setTabsInitialized(true)
    if (ids.length && !activeApiId) setActiveApiId(ids[0])
  }, [workspace, tabsInitialized, activeApiId, setActiveApiId])

  function updateOpenApiIds(ids: string[]) {
    setOpenApiIds(ids)
    saveOpenApiIds(ids)
  }

  function openApi(node: ApiTreeNode) {
    setActiveApiId(node.id)
    const next = openApiIds.includes(node.id) ? openApiIds : [...openApiIds, node.id]
    updateOpenApiIds(next)
    navigate(`/${node.protocol ?? 'http'}`)
  }

  async function copyNodeName(node: ApiTreeNode) {
    try {
      await navigator.clipboard?.writeText(node.name)
    } catch {
      const input = document.createElement('textarea')
      input.value = node.name
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
  }

  async function copyNodeCurl(node: ApiTreeNode) {
    const request = workspace?.requests.find((item) => item.id === node.id)
    const method = request?.method ?? node.method ?? 'GET'
    const url = request?.url || ''
    const parts = [`curl -X ${method} '${url.replace(/'/g, "'\\''")}'`]
    request?.headers?.filter((item) => item.enabled && item.key).forEach((item) => parts.push(`-H '${`${item.key}: ${item.value}`.replace(/'/g, "'\\''")}'`))
    if (request?.body) parts.push(`--data-raw '${request.body.replace(/'/g, "'\\''")}'`)
    const command = parts.join(' \\\n  ')
    try {
      await navigator.clipboard?.writeText(command)
    } catch {
      const input = document.createElement('textarea')
      input.value = command
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
  }

  function exportFolderDoc(folder: ApiTreeNode, format: 'markdown' | 'html') {
    const requests = new Map((workspace?.requests ?? []).map((request) => [request.id, request]))
    const apis = flattenTreeApis(folder)
    const title = `${folder.name} API 文档`
    if (format === 'markdown') {
      const sections = apis.map((api, index) => {
        const request = requests.get(api.id)
        const method = request?.method ?? api.method ?? ''
        const params = request?.params?.filter((item) => item.enabled && item.key) ?? []
        const headers = request?.headers?.filter((item) => item.enabled && item.key) ?? []
        const lines = [`## ${index + 1}. ${api.name}`, '', '| 项目 | 内容 |', '| --- | --- |', `| 协议 | ${(request?.protocol ?? api.protocol ?? '').toUpperCase() || '-'} |`, ...(method ? [`| 方法 | \`${method}\` |`] : []), `| 地址 | \`${request?.url || '未设置'}\` |`]
        if (request?.description) lines.push(`| 说明 | ${request.description.replace(/\n/g, '<br>')} |`)
        if (params.length) lines.push('', '### 请求参数', '', '| 参数 | 值 |', '| --- | --- |', ...params.map((item) => `| \`${item.key}\` | ${String(item.value).replace(/\n/g, '<br>')} |`))
        if (headers.length) lines.push('', '### 请求头', '', '| Header | 值 |', '| --- | --- |', ...headers.map((item) => `| \`${item.key}\` | ${String(item.value).replace(/\n/g, '<br>')} |`))
        if (request?.body) lines.push('', '### 请求体', '', '```json', request.body, '```')
        return lines.join('\n')
      })
      const toc = apis.map((api, index) => `${index + 1}. ${api.name}`).join('\n')
      downloadFile(`${folder.name}-api-docs.md`, `# API-forge\n\n## ${title}\n\n> 共 ${apis.length} 个接口 · 导出时间：${new Date().toLocaleString('zh-CN')}\n\n## 接口目录\n\n${toc || '该目录暂无接口。'}\n\n${sections.join('\n\n---\n\n')}`, 'text/markdown;charset=utf-8')
      return
    }
    const sections = apis.map((api, index) => {
      const request = requests.get(api.id)
      const method = request?.method ?? api.method ?? ''
      const params = request?.params?.filter((item) => item.enabled && item.key) ?? []
      const headers = request?.headers?.filter((item) => item.enabled && item.key) ?? []
      const table = (items: typeof params) => items.length ? `<table><thead><tr><th>名称</th><th>值</th></tr></thead><tbody>${items.map((item) => `<tr><td><code>${escapeHtml(item.key)}</code></td><td>${escapeHtml(item.value)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">无</p>'
      return `<section id="api-${index + 1}"><h2><span class="index">${String(index + 1).padStart(2, '0')}</span>${escapeHtml(api.name)}</h2><div class="badges"><span class="protocol">${escapeHtml((request?.protocol ?? api.protocol ?? '').toUpperCase() || 'API')}</span>${method ? `<span class="method">${escapeHtml(method)}</span>` : ''}</div><div class="url"><span>请求地址</span><code>${escapeHtml(request?.url || '未设置')}</code></div>${request?.description ? `<p class="description">${escapeHtml(request.description).replace(/\n/g, '<br>')}</p>` : ''}<h3>请求参数</h3>${table(params)}<h3>请求头</h3>${table(headers)}${request?.body ? `<h3>请求体</h3><pre>${escapeHtml(request.body)}</pre>` : ''}</section>`
    }).join('') || '<p>该目录暂无接口。</p>'
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - API-forge</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#243044;font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}main{max-width:1080px;margin:0 auto;padding:36px 28px}.brand{display:flex;align-items:center;gap:12px;margin-bottom:28px;padding:16px 20px;border-radius:12px;background:#0b0f14;color:#f8fafc}.brand svg{width:38px;height:38px;flex:none}.brand-name{font-size:18px;font-weight:700;letter-spacing:.02em}.brand-title{margin-left:auto;color:#a7f3d0;font-size:14px}header{margin-bottom:28px}h1{margin:0 0 8px;font-size:32px}header p,.muted{color:#718096}nav{display:flex;flex-direction:column;gap:6px;margin-bottom:28px;padding:16px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}nav strong{display:block;margin-bottom:4px}nav a{display:block;width:100%;padding:8px 10px;border-radius:6px;color:#2563eb;text-decoration:none;background:#eff6ff}nav a:hover{background:#dbeafe}section{margin:20px 0;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 4px 16px #1e293b0a}h2{display:flex;gap:12px;align-items:center;margin:0;font-size:22px}.index{font:12px ui-monospace;color:#94a3b8}.badges{display:flex;gap:8px;margin:12px 0}.protocol,.method{display:inline-block;padding:2px 9px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700}.method{background:#dcfce7;color:#15803d}.url{display:flex;gap:12px;padding:12px;border-radius:8px;background:#f8fafc}.url span{color:#64748b;white-space:nowrap}h3{margin:22px 0 8px;font-size:14px}table{width:100%;border-collapse:collapse}th,td{padding:9px 12px;text-align:left;border-bottom:1px solid #edf2f7}th{color:#64748b;background:#f8fafc}code{padding:2px 5px;border-radius:4px;background:#f1f5f9;color:#334155;font:12px ui-monospace,monospace}pre{padding:14px;overflow:auto;border-radius:8px;background:#0f172a;color:#dbeafe;font:12px/1.7 ui-monospace,monospace}.description{color:#526176}@media(max-width:640px){main{padding:24px 14px}.brand-title{display:none}h1{font-size:26px}.url{flex-direction:column;gap:4px}}</style></head><body><main><div class="brand"><svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="API-forge Logo"><rect width="64" height="64" rx="14" fill="#0B0F14"/><rect x="8" y="10" width="48" height="44" rx="8" fill="#111821" stroke="#263342" stroke-width="2"/><path d="M18 24L26 32L18 40" stroke="#32F08C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 41H45" stroke="#42D9FF" stroke-width="4" stroke-linecap="round"/><circle cx="17" cy="17" r="2" fill="#42D9FF"/><circle cx="24" cy="17" r="2" fill="#32F08C"/></svg><span class="brand-name">API-forge</span><span class="brand-title">API 文档</span></div><header><h1>${escapeHtml(title)}</h1><p>共 ${apis.length} 个接口 · 导出时间：${escapeHtml(new Date().toLocaleString('zh-CN'))}</p></header><nav><strong>接口目录</strong>${apis.map((api, index) => `<a href="#api-${index + 1}">${String(index + 1).padStart(2, '0')} ${escapeHtml(api.name)}</a>`).join('')}</nav>${sections}</main></body></html>`
    downloadFile(`${folder.name}-api-docs.html`, html, 'text/html;charset=utf-8')
  }

  function closeApi(id: string) {
    const next = openApiIds.filter((item) => item !== id)
    updateOpenApiIds(next)
    if (activeApiId === id) {
      const nextActive = next[next.length - 1]
      const node = apiNodes.find((item) => item.id === nextActive)
      if (node) {
        setActiveApiId(node.id)
        navigate(`/${node.protocol ?? 'http'}`)
      }
      else {
        setActiveApiId(undefined)
        navigate('/http')
      }
    }
    setTabMenu(undefined)
  }

  function closeOtherApis(id: string) {
    updateOpenApiIds([id])
    const node = apiNodes.find((item) => item.id === id)
    if (node && activeApiId !== id) {
      setActiveApiId(id)
      navigate(`/${node.protocol ?? 'http'}`)
    }
    setTabMenu(undefined)
  }

  function closeAllApis() {
    updateOpenApiIds([])
    setActiveApiId(undefined)
    setTabMenu(undefined)
    navigate('/http')
  }

  function openDialog(next: { mode: 'folder' | 'api' | 'rename'; parentId?: string; node?: ApiTreeNode }) {
    setDialog(next)
    setDialogName(next.node?.name ?? '')
    setDialogDescription('')
    setDialogFolderId(next.parentId)
    setDialogProtocol(next.node?.protocol ?? 'http')
    setDialogMethod(next.node?.method ?? (next.node?.protocol === 'websocket' || next.node?.protocol === 'socket' ? undefined : 'GET'))
  }

  function changeDialogProtocol(protocol: Protocol) {
    setDialogProtocol(protocol)
    const methods = protocolMethods[protocol]
    setDialogMethod(methods.includes(dialogMethod as HttpMethod) ? dialogMethod : methods[0])
  }

  function submitDialog() {
    if (!dialog || !dialogName.trim()) return
    if (dialog.mode === 'folder') createFolder(dialog.parentId, dialogName)
    if (dialog.mode === 'api') {
      const id = createApi(dialogFolderId, { name: dialogName, protocol: dialogProtocol, method: dialogMethod })
      if (id) {
        if (parsedCurl) updateRequest({ id, name: dialogName, description: dialogDescription.trim() || undefined, protocol: parsedCurl.protocol, method: parsedCurl.method, url: parsedCurl.url, headers: parsedCurl.headers.map((item, index) => ({ id: `${id}-header-${index}`, ...item })), params: [], body: parsedCurl.body, updatedAt: new Date().toISOString() })
        else updateRequest({ id, name: dialogName, description: dialogDescription.trim() || undefined, protocol: dialogProtocol, method: dialogMethod, url: '', params: [], headers: [], updatedAt: new Date().toISOString() })
        setActiveApiId(id)
        setParsedCurl(undefined)
        updateOpenApiIds(openApiIds.includes(id) ? openApiIds : [...openApiIds, id])
        navigate(`/${parsedCurl?.protocol ?? dialogProtocol}`)
      }
    }
    if (dialog.mode === 'rename' && dialog.node) renameNode(dialog.node.id, dialogName)
    setDialog(undefined)
  }

  function importCurl() {
    const parsed = parseCurlCommand(pendingCurl)
    if (!parsed) return
    setPendingCurl('')
    void navigator.clipboard?.writeText('').catch(() => undefined)
    setParsedCurl(parsed)
    openDialog({ mode: 'api' })
    setDialogName(parsed.name)
    setDialogProtocol(parsed.protocol)
    setDialogMethod(parsed.method)
  }

  function requestDelete(node: ApiTreeNode) {
    if (deleteConfirmingRef.current) return
    deleteConfirmingRef.current = true
    const confirmed = window.confirm(`确定删除${node.type === 'folder' ? '目录及其全部内容' : '接口'}“${node.name}”吗？`)
    if (confirmed) {
      deleteNode(node.id)
      const deletedIds = new Set(flattenNodeIds(node))
      updateOpenApiIds(openApiIds.filter((id) => !deletedIds.has(id)))
    }
    window.setTimeout(() => { deleteConfirmingRef.current = false }, 0)
  }

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-[#0b0f14] text-zinc-100">
      <aside className={`relative z-20 flex shrink-0 flex-col overflow-visible border-r border-zinc-800 bg-[#0f141b] ${resizingSidebar ? 'select-none' : 'transition-[width] duration-150'}`} style={{ width: sidebarCollapsed ? 48 : sidebarWidth }}>
        <div className={`api-forge-brand flex h-14 items-center border-b border-zinc-800 ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'}`}>
          {!sidebarCollapsed && <div className="api-forge-brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded bg-cyan-400/15">
            <img src={isDark ? lightLogo : logo} alt="API-forge" className="h-6 w-6" />
          </div>}
          {!sidebarCollapsed && <div className="min-w-0">
            <div className="flex items-center gap-2"><div className="api-forge-brand-name text-sm font-semibold">API-forge</div>{appVersion && <span className="text-[10px] text-zinc-500">v{appVersion}</span>}</div>
            <div className="text-[11px] text-zinc-500">Local API Workspace</div>
          </div>}
          <button onClick={() => setSidebarCollapsed((value) => !value)} className={sidebarCollapsed ? 'rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100' : 'ml-auto rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'} title={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'} aria-label={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}>
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {!sidebarCollapsed && <>
        <div className="border-b border-zinc-800 p-3">
          <div className="flex h-9 items-center gap-2 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-500">
            <Search className="h-3.5 w-3.5" />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索接口、目录、路径" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-500" />
          </div>
        </div>

        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
            <BookOpen className="h-3.5 w-3.5" />
            API 目录
          </div>
          <button onClick={() => openDialog({ mode: 'folder' })} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="新建目录">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3">
          {workspace?.apiTree.map((node, index) => <TreeNode key={node.id} node={node} index={index} query={searchQuery} onOpenApi={openApi} onCreateFolder={(parentId) => openDialog({ mode: 'folder', parentId })} onCreateApi={(parentId) => openDialog({ mode: 'api', parentId })} onRename={(node) => openDialog({ mode: 'rename', node })} onDelete={requestDelete} onMoveApi={moveApi} onCopyName={copyNodeName} onCopyCurl={copyNodeCurl} onExportFolder={exportFolderDoc} />)}
          {workspace && !treeHasMatch(workspace.apiTree, searchQuery) && <div className="p-4 text-center text-xs text-zinc-600">未找到匹配接口</div>}
        </div>

        <div className="border-t border-zinc-800 p-3 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
          <NavLink to="/settings" className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded px-2 hover:bg-zinc-800 hover:text-zinc-200" title="系统设置">
            <Settings2 className="h-3.5 w-3.5" />
            <span className="truncate">系统设置</span>
          </NavLink>
          <div className="flex h-8 shrink-0 items-center gap-1 rounded border border-zinc-700 bg-zinc-950/60 px-1.5" aria-label="主题快速切换">
            {([
              ['dark', '深色'],
              ['light', '浅色'],
              ['system', '跟随系统'],
              ['darkOrange', '深色-橙色'],
              ['lightBlue', '浅色-蓝色'],
            ] as Array<[Theme, string]>).map(([id, name]) => {
              const preset = id === 'system' ? themePresets.dark : themePresets[id]
              const background = id === 'system'
                ? `linear-gradient(90deg, ${themePresets.dark.background} 0 50%, ${themePresets.light.background} 50% 100%)`
                : id === 'dark' || id === 'light' ? preset.background : preset.accent
              return <button key={id} type="button" onClick={() => setTheme(id)} className={`h-4 w-4 rounded-full border transition-transform hover:scale-110 ${theme === id ? 'border-zinc-100 ring-1 ring-zinc-400 ring-offset-1 ring-offset-zinc-950' : 'border-zinc-600'}`} style={{ background }} title={name} aria-label={name} />
            })}
          </div>
          </div>
        </div>
        </>}
        {!sidebarCollapsed && <button onPointerDown={(event) => { event.preventDefault(); const aside = event.currentTarget.parentElement; sidebarResizeOffsetRef.current = aside ? event.clientX - aside.getBoundingClientRect().right : 0; setResizingSidebar(true) }} className="resize-handle sidebar-resize-handle group absolute right-0 top-0 z-10 flex h-full w-3 translate-x-1/2 items-center justify-center bg-transparent" style={{ cursor: 'col-resize' }} title="调整侧栏宽度" aria-label="调整侧栏宽度">
          <span className={`resize-line relative h-full ${resizingSidebar ? 'is-resizing' : ''}`}>
            <span className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-0.5 rounded-full border border-zinc-700/80 bg-[#0f141b]/90 px-1 py-1.5 shadow-lg backdrop-blur-sm transition-[opacity,border-color] duration-150 ${resizingSidebar ? 'border-cyan-400/60 opacity-100' : 'opacity-0 group-hover:border-cyan-400/40 group-hover:opacity-100'}`}>
              <span className="h-0.5 w-0.5 rounded-full bg-cyan-200/80" />
              <span className="h-0.5 w-0.5 rounded-full bg-cyan-200/80" />
              <span className="h-0.5 w-0.5 rounded-full bg-cyan-200/80" />
            </span>
          </span>
        </button>}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-[#111821] px-4">
          <div className="relative min-w-0 max-w-[70%] flex-1">
            <div ref={apiTabsRef} onScroll={updateApiTabsOverflow} className="scrollbar-hidden flex min-w-0 items-center gap-1 overflow-x-auto px-7">
              {openApis.map((api) => (
                <NavLink key={api.id} to={`/${api.protocol ?? 'http'}`} onClick={() => { setActiveApiId(api.id); setTabMenu(undefined) }} onContextMenu={(event) => { event.preventDefault(); setTabMenu({ id: api.id, x: event.clientX, y: event.clientY }) }} className={`flex h-8 max-w-48 shrink-0 items-center gap-2 rounded px-3 text-xs transition-colors ${activeApiId === api.id ? 'bg-zinc-800 font-semibold text-zinc-100 hover:bg-white/10' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'}`}>
                  <span className="truncate">{api.name}</span>
                  <span role="button" tabIndex={0} aria-label={`关闭${api.name}`} onClick={(event) => { event.preventDefault(); closeApi(api.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); closeApi(api.id) } }} className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-100"><X className="h-3 w-3" /></span>
                </NavLink>
              ))}
              <button className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" title="新增标签"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            {hasPreviousApiTabs && <button onClick={() => apiTabsRef.current?.scrollBy({ left: -180, behavior: 'smooth' })} className="absolute left-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded bg-[#111821]/90 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="显示前面的标签" aria-label="显示前面的标签"><ChevronRight className="h-4 w-4 rotate-180" /></button>}
            {hasMoreApiTabs && <button onClick={() => apiTabsRef.current?.scrollBy({ left: 180, behavior: 'smooth' })} className="absolute right-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded bg-[#111821]/90 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="显示更多标签" aria-label="显示更多标签"><ChevronRight className="h-4 w-4" /></button>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {pendingCurl && <button onClick={importCurl} className="flex h-9 w-24 animate-pulse items-center justify-center gap-2 rounded border border-amber-400/50 bg-amber-400/10 px-3 text-xs font-medium text-amber-200 hover:bg-amber-400/20">从 curl 导入</button>}
            <div className="flex h-9 w-36 min-w-0 items-center gap-2 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-300">
              <Boxes className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
              <select className="min-w-0 flex-1 truncate bg-transparent outline-none" value={activeEnvironmentId} onChange={(event) => setActiveEnvironmentId(event.target.value)}>
                {workspace?.environments.map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
              </select>
              <NavLink to="/environments" className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="设置环境变量">
                <Settings2 className="h-3.5 w-3.5" />
              </NavLink>
            </div>
            <NavLink to="/history" className="flex h-9 w-10 items-center justify-center rounded px-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="历史">
              <History className="h-3.5 w-3.5" />
            </NavLink>
            <NavLink to={aiReady ? '/ai' : '/settings'} aria-disabled={!aiReady} onClick={(event) => { if (!aiReady) event.preventDefault() }} className={({ isActive }) => `ai-entry-button flex h-9 w-10 items-center justify-center rounded px-2 ${isActive && aiReady ? 'is-active' : ''} ${!aiReady ? 'is-disabled cursor-not-allowed' : ''}`} title={aiReady ? 'AI 助手' : 'AI 助手未配置，请先完成大模型配置'}>
              <Sparkles className="ai-entry-icon h-3.5 w-3.5" />
            </NavLink>
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-hidden">
          <div className={location.pathname === '/ai' ? 'h-full' : 'hidden'}>
            <AIAssistantPage />
          </div>
          <div className={location.pathname === '/ai' ? 'hidden' : 'h-full'}>
            <Outlet />
          </div>
        </section>

        <footer className="flex h-10 shrink-0 items-center gap-2 border-t border-zinc-800 bg-[#0f141b] px-3 text-[11px] text-zinc-500">
          <div className="ml-auto flex items-center gap-3">
            <span>本地工作区</span>
            <span>{workspace?.history.length ?? 0} 条历史</span>
          </div>
          <div className={`flex items-center gap-2 ${statusContent.className}`}>
            <SaveStatusIcon className={`h-3.5 w-3.5 ${saveStatus === 'saving' ? 'animate-spin' : ''}`} />
            {statusContent.label}
          </div>
        </footer>
      </main>
      {tabMenu && <>
        <div className="fixed inset-0 z-40" onClick={() => setTabMenu(undefined)} />
        <div className="fixed z-50 w-40 rounded-md border border-zinc-700 bg-[#111821] p-1 shadow-2xl" style={{ left: tabMenu.x, top: tabMenu.y }}>
          <button onClick={() => closeApi(tabMenu.id)} className="flex h-8 w-full items-center rounded px-3 text-left text-xs text-zinc-300 hover:bg-zinc-800">关闭当前</button>
          <button onClick={() => closeOtherApis(tabMenu.id)} className="flex h-8 w-full items-center rounded px-3 text-left text-xs text-zinc-300 hover:bg-zinc-800">关闭其他</button>
          <button onClick={closeAllApis} className="flex h-8 w-full items-center rounded px-3 text-left text-xs text-rose-200 hover:bg-rose-500/15">关闭所有</button>
        </div>
      </>}
      {dialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <form onSubmit={(event) => { event.preventDefault(); submitDialog() }} className="w-full max-w-md rounded-lg border border-zinc-700 bg-[#111821] p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">{dialog.mode === 'folder' ? '新建目录' : dialog.mode === 'api' ? '新建 API' : '重命名'}</h2><button type="button" onClick={() => setDialog(undefined)} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"><X className="h-4 w-4" /></button></div>
          <label className="mb-4 block text-xs text-zinc-400">名称<input autoFocus value={dialogName} onChange={(event) => setDialogName(event.target.value)} className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-100 outline-none focus:border-cyan-400/60" placeholder="请输入名称" /></label>
          {dialog.mode === 'api' && <label className="mb-4 block text-xs text-zinc-400">备注描述<textarea value={dialogDescription} onChange={(event) => setDialogDescription(event.target.value)} className="mt-2 min-h-20 w-full resize-y rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-400/60" placeholder="请输入接口用途或备注" /></label>}
          {dialog.mode === 'api' && <div className="space-y-3"><label className="block text-xs text-zinc-400">所属目录<select value={dialogFolderId ?? ''} onChange={(event) => setDialogFolderId(event.target.value || undefined)} className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none"><option value="">根目录</option>{flattenFolders(workspace?.apiTree ?? []).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-xs text-zinc-400">协议<select value={dialogProtocol} onChange={(event) => changeDialogProtocol(event.target.value as Protocol)} className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none"><option value="http">HTTP</option><option value="websocket">WebSocket</option><option value="socket">Socket</option></select></label><label className="text-xs text-zinc-400">方法<select disabled={protocolMethods[dialogProtocol].length === 0} value={dialogMethod ?? ''} onChange={(event) => setDialogMethod((event.target.value || undefined) as HttpMethod | undefined)} className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none"><option value="">不适用</option>{protocolMethods[dialogProtocol].map((method) => <option key={method} value={method}>{method}</option>)}</select></label></div></div>}
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDialog(undefined)} className="h-9 rounded border border-zinc-700 px-4 text-xs text-zinc-300 hover:bg-zinc-800">取消</button><button type="submit" disabled={!dialogName.trim()} className="h-9 rounded bg-cyan-400 px-4 text-xs font-semibold text-zinc-950 disabled:opacity-40">保存</button></div>
        </form>
      </div>}
    </div>
  )
}
