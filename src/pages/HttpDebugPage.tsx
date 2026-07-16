import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Editor from '@monaco-editor/react'
import { Check, Copy, LoaderCircle, Plus, Save, Send, Square, Trash2 } from 'lucide-react'
import { StatusPill } from '@/components/common/StatusPill'
import { VariableInput } from '@/components/common/VariableInput'
import { VariableEditor } from '@/components/common/VariableEditor'
import { getWorkspaceVariables, replaceEnvironmentVariables, useWorkspaceStore } from '@/stores/workspace-store'
import { useTheme } from '@/hooks/useTheme'
import type { ApiTreeNode, HttpFieldItem, HttpMethod, HttpSendResult, ProcessVariable, RequestDefinition } from '@/shared/ipc-contracts'

const initialParams: HttpFieldItem[] = [
  { id: 'param-page', key: 'page', value: '1', enabled: true },
  { id: 'param-size', key: 'size', value: '20', enabled: true },
]
const initialHeaders: HttpFieldItem[] = [
  { id: 'header-content-type', key: 'Content-Type', value: 'application/json', enabled: true },
  { id: 'header-authorization', key: 'Authorization', value: 'Bearer {{token}}', enabled: true },
]
const headerValueOptions = {
  'Content-Type': [
    'application/json',
    'application/xml',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    'text/html',
    'text/css',
    'text/csv',
    'text/xml',
    'application/javascript',
    'application/octet-stream',
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/zip',
    'application/ld+json',
    'application/problem+json',
    'application/graphql',
    'application/graphql+json',
    'application/soap+xml',
    'application/vnd.api+json',
    'application/x-7z-compressed',
    'application/x-rar-compressed',
    'application/x-tar',
    'application/wasm',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'audio/mpeg',
    'audio/ogg',
    'font/woff',
    'font/woff2',
    'image/svg+xml',
    'video/mp4',
    'video/webm',
    'text/event-stream',
    'text/calendar',
    'text/markdown',
    'text/javascript',
  ],
  Authorization: ['Bearer {{token}}', 'Basic {{token}}', 'ApiKey {{token}}'],
} as const
const headerKeyOptions = [
  'Accept', 'Accept-Charset', 'Accept-Encoding', 'Accept-Language', 'Accept-Ranges', 'Access-Control-Allow-Credentials', 'Access-Control-Allow-Headers', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Origin', 'Access-Control-Expose-Headers', 'Access-Control-Max-Age', 'Access-Control-Request-Headers', 'Access-Control-Request-Method',
  'Authorization', 'Cache-Control', 'Connection', 'Content-Disposition', 'Content-Encoding', 'Content-Language', 'Content-Length', 'Content-Location', 'Content-Range', 'Content-Security-Policy', 'Content-Type',
  'Cookie', 'Date', 'ETag', 'Expect', 'Expires', 'Forwarded', 'Host', 'If-Match', 'If-Modified-Since', 'If-None-Match', 'If-Range', 'If-Unmodified-Since', 'Last-Modified', 'Location', 'Origin', 'Pragma', 'Range', 'Referer', 'Retry-After', 'Sec-WebSocket-Accept', 'Sec-WebSocket-Key', 'Server', 'Set-Cookie', 'Strict-Transport-Security', 'TE', 'Trailer', 'Transfer-Encoding', 'Upgrade', 'User-Agent', 'Vary', 'Via', 'Warning', 'WWW-Authenticate', 'X-Api-Key', 'X-Correlation-Id', 'X-Forwarded-For', 'X-Forwarded-Host', 'X-Forwarded-Proto', 'X-Real-IP', 'X-Request-Id', 'X-Requested-With', 'X-Trace-Id',
]
const initialBody = '{\n  "keyword": "notebook",\n  "page": 1\n}'

const methodColorClasses: Record<HttpMethod, string> = {
  GET: 'border-emerald-500/40 bg-emerald-400/10 text-emerald-200',
  POST: 'border-blue-500/40 bg-blue-400/10 text-blue-200',
  PUT: 'border-amber-500/40 bg-amber-400/10 text-amber-200',
  PATCH: 'border-violet-500/40 bg-violet-400/10 text-violet-200',
  DELETE: 'border-rose-500/40 bg-rose-400/10 text-rose-200',
  HEAD: 'border-cyan-500/40 bg-cyan-400/10 text-cyan-200',
  OPTIONS: 'border-zinc-500/40 bg-zinc-400/10 text-zinc-200',
}

function findApiNode(nodes: ApiTreeNode[], apiId?: string): ApiTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === apiId) return node
    const child = node.children ? findApiNode(node.children, apiId) : undefined
    if (child) return child
  }
  return undefined
}

function findJsonPath(root: unknown, selectedText: string, path: string[] = []): string | undefined {
  const selected = selectedText.trim().replace(/^['"]|['"]$/g, '')
  if (selected.length === 0) return undefined
  if (Array.isArray(root)) {
    for (let index = 0; index < root.length; index += 1) {
      const found = findJsonPath(root[index], selected, [...path, `[${index}]`])
      if (found) return found
    }
    return undefined
  }
  if (root && typeof root === 'object') {
    for (const [key, value] of Object.entries(root)) {
      const nextPath = [...path, key]
      if (key === selected) return `$.${nextPath.join('.').replace(/\.\[/g, '[')}`
      const found = findJsonPath(value, selected, nextPath)
      if (found) return found
    }
    return undefined
  }
  return String(root) === selected ? `$.${path.join('.').replace(/\.\[/g, '[')}` : undefined
}

function parseSseEvents(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .split(/\n\n+/)
    .map((block, index) => {
      const event = block.match(/^event:\s*(.*)$/m)?.[1] ?? 'message'
      const id = block.match(/^id:\s*(.*)$/m)?.[1]
      const rawData = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
      if (!rawData) return undefined
      if (rawData === '[DONE]') return { event, id, rawData, data: '流式响应已结束', streamData: '', key: `${id ?? 'done'}-${index}` }
      try {
        const parsed = JSON.parse(rawData) as { choices?: Array<{ delta?: { content?: string }; message?: { content?: string }; finish_reason?: string | null }> }
        const choice = parsed.choices?.[0]
        const content = choice?.delta?.content ?? choice?.message?.content
        if (content !== undefined) return { event, id, rawData, data: content, streamData: content, key: `${id ?? index}-${rawData.slice(0, 16)}` }
        if (choice?.finish_reason) return { event, id, rawData, data: `流式响应已结束（${choice.finish_reason}）`, streamData: '', key: `${id ?? index}-finish` }
        return { event, id, rawData, data: JSON.stringify(parsed, null, 2), streamData: '', key: `${id ?? index}-${rawData.slice(0, 16)}` }
      } catch {
        return { event, id, rawData, data: rawData, streamData: rawData, key: `${id ?? index}-${rawData.slice(0, 16)}` }
      }
    })
    .filter((item) => item !== undefined && item.rawData.trim())
}

function normalizeStreamText(value: string) {
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+-[ \t]+(?=\*\*)/g, '\n- ')
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = -1
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const precision = value >= 10 ? 1 : 2
  return `${value.toFixed(precision).replace(/\.0+$|(?<=\.\d)0+$/, '')} ${units[unitIndex]}`
}

function renderInlineMarkdown(value: string) {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-semibold text-zinc-100">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-cyan-200">{part.slice(1, -1)}</code>
    return <span key={index}>{part}</span>
  })
}

function MarkdownText({ value }: { value: string }) {
  const lines = value.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  let code: string[] = []
  let inCode = false

  const flushList = () => {
    if (!list.length) return
    blocks.push(<ul key={`list-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">{list.map((item, index) => <li key={index}>{renderInlineMarkdown(item)}</li>)}</ul>)
    list = []
  }
  const flushCode = () => {
    if (!code.length) return
    blocks.push(<pre key={`code-${blocks.length}`} className="my-2 overflow-x-auto rounded border border-zinc-700 bg-zinc-950 p-3 text-xs leading-5 text-cyan-100"><code>{code.join('\n')}</code></pre>)
    code = []
  }

  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      if (inCode) flushCode()
      else flushList()
      inCode = !inCode
      return
    }
    if (inCode) {
      code.push(line)
      return
    }
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    if (bullet) {
      list.push(bullet[1])
      return
    }
    flushList()
    if (!line.trim()) return
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const className = level === 1 ? 'mt-3 text-lg font-semibold' : level === 2 ? 'mt-3 text-base font-semibold' : 'mt-2 text-sm font-semibold'
      blocks.push(<div key={`heading-${blocks.length}`} className={className}>{renderInlineMarkdown(heading[2])}</div>)
      return
    }
    blocks.push(<p key={`paragraph-${blocks.length}`} className="my-2 whitespace-pre-wrap">{renderInlineMarkdown(line)}</p>)
  })
  if (inCode) flushCode()
  flushList()
  return <div className="break-words text-sm leading-7 [overflow-wrap:anywhere]">{blocks}</div>
}

export default function HttpDebugPage() {
  const { monacoTheme: editorTheme } = useTheme()
  const addHistory = useWorkspaceStore((state) => state.addHistory)
  const workspace = useWorkspaceStore((state) => state.workspace)
  const activeEnvironmentId = useWorkspaceStore((state) => state.activeEnvironmentId)
  const activeApiId = useWorkspaceStore((state) => state.activeApiId)
  const updateRequest = useWorkspaceStore((state) => state.updateRequest)
  const saveNow = useWorkspaceStore((state) => state.saveNow)
  const markUnsaved = useWorkspaceStore((state) => state.markUnsaved)
  const updateProcessVariable = useWorkspaceStore((state) => state.updateProcessVariable)
  const captureProcessVariables = useWorkspaceStore((state) => state.captureProcessVariables)
  const [method, setMethod] = useState<HttpMethod>('GET')
  const [url, setUrl] = useState('{{base_url}}/v1/orders')
  const [params, setParams] = useState<HttpFieldItem[]>(initialParams)
  const [headers, setHeaders] = useState<HttpFieldItem[]>(initialHeaders)
  const [body, setBody] = useState(initialBody)
  const [bodyType, setBodyType] = useState<NonNullable<RequestDefinition['bodyType']>>('json')
  const [formFields, setFormFields] = useState<NonNullable<RequestDefinition['formFields']>>([{ id: 'form-0', key: '', value: '', kind: 'text', enabled: true }])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HttpSendResult | undefined>()
  const [streamBody, setStreamBody] = useState('')
  const [streamSse, setStreamSse] = useState(false)
  const [sseDisplayMode, setSseDisplayMode] = useState<'raw' | 'stream'>('stream')
  const requestIdRef = useRef('')
  const [inputError, setInputError] = useState('')
  const [activeResponseTab, setActiveResponseTab] = useState<'Body' | 'Headers' | 'Cookies' | '日志'>('Body')
  const [bearerToken, setBearerToken] = useState('')
  const [timeout, setTimeoutValue] = useState(30000)
  const [followRedirects, setFollowRedirects] = useState(true)
  const [validateCertificates, setValidateCertificates] = useState(true)
  const [assertion, setAssertion] = useState('')
  const [description, setDescription] = useState('')
  const [assertionResult, setAssertionResult] = useState<{ ok: boolean; message: string }>()
  const [saveMessage, setSaveMessage] = useState('')
  const [processVariableDialog, setProcessVariableDialog] = useState<ProcessVariable>()
  const [processVariableError, setProcessVariableError] = useState('')
  const [processVariableNotice, setProcessVariableNotice] = useState('')
  const saveRequestRef = useRef<() => void>(() => undefined)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = Number(localStorage.getItem('httpDebugSplitRatio'))
    return Number.isFinite(saved) && saved >= 0.35 && saved <= 0.65 ? saved : 0.54
  })
  const [isResizing, setIsResizing] = useState(false)
  const resizePointerOffsetRef = useRef(0)

  useEffect(() => {
    if (!isResizing) return undefined
    const handlePointerMove = (event: PointerEvent) => {
      const container = splitContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const minRequest = 520
      const minResponse = 420
      const available = rect.width
      const minRatio = minRequest / available
      const maxRatio = 1 - minResponse / available
      const pointerX = event.clientX - resizePointerOffsetRef.current
      const nextRatio = Math.min(Math.max((pointerX - rect.left) / available, Math.max(0.35, minRatio)), Math.min(0.65, maxRatio))
      setSplitRatio(nextRatio)
    }
    const handlePointerUp = () => setIsResizing(false)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizing])

  useEffect(() => {
    localStorage.setItem('httpDebugSplitRatio', String(splitRatio))
  }, [splitRatio])
  const draftSyncKeyRef = useRef('')

  useEffect(() => {
    if (!processVariableNotice) return undefined
    const timer = window.setTimeout(() => setProcessVariableNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [processVariableNotice])

  const variables = useMemo(() => getWorkspaceVariables(workspace, activeEnvironmentId), [workspace, activeEnvironmentId])
  const editorVariables = useMemo(() => ({
    ...variables,
    ...Object.fromEntries((workspace?.processVariables ?? []).map((item) => [item.key, item.currentValue ?? '待获取'])),
  }), [variables, workspace?.processVariables])
  const activeApiNode = useMemo(() => findApiNode(workspace?.apiTree ?? [], activeApiId), [workspace?.apiTree, activeApiId])
  const activeRequest = useMemo(() => workspace?.requests.find((request) => request.id === activeApiId) ?? workspace?.requests.find((request) => request.name === activeApiNode?.name), [workspace?.requests, activeApiId, activeApiNode?.name])
  const draftSignature = useMemo(() => JSON.stringify({ method, url, params, headers, body, bodyType, formFields, description }), [method, url, params, headers, body, bodyType, formFields, description])
  const savedSignature = useMemo(() => activeRequest ? JSON.stringify({ method: activeRequest.method, url: activeRequest.url, params: activeRequest.params, headers: activeRequest.headers, body: activeRequest.body ?? '', bodyType: activeRequest.bodyType ?? 'json', formFields: activeRequest.formFields ?? [], description: activeRequest.description ?? '' }) : '', [activeRequest])
  const requestTabs = useMemo(() => {
    if (activeApiNode && activeApiNode.protocol !== 'http') return ['Info'] as const
    return method === 'GET' || method === 'HEAD'
      ? ['Headers', 'Bearer', 'Params', 'Settings', 'Test', 'Info'] as const
      : ['Headers', 'Bearer', 'Body', 'Params', 'Settings', 'Test', 'Info'] as const
  }, [activeApiNode?.protocol, method])
  const [requestTabOrder, setRequestTabOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('httpRequestTabOrder')
      const parsed = saved ? JSON.parse(saved) : []
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
    } catch {
      return []
    }
  })
  const orderedRequestTabs = useMemo(() => {
    const available = new Set<string>(requestTabs)
    return [...requestTabOrder.filter((tab) => available.has(tab)), ...requestTabs.filter((tab) => !requestTabOrder.includes(tab))]
  }, [requestTabs, requestTabOrder])
  const [activeRequestTab, setActiveRequestTab] = useState<(typeof requestTabs)[number]>(requestTabs[0])
  useEffect(() => {
    setRequestTabOrder((current) => [...current.filter((tab) => requestTabs.includes(tab as never)), ...requestTabs.filter((tab) => !current.includes(tab))])
    const defaultTab = requestTabs.includes('Body' as never) ? 'Body' : requestTabs.includes('Params' as never) ? 'Params' : requestTabs[0]
    setActiveRequestTab(defaultTab as (typeof requestTabs)[number])
  }, [activeApiId, requestTabs])
  useEffect(() => {
    localStorage.setItem('httpRequestTabOrder', JSON.stringify(requestTabOrder))
  }, [requestTabOrder])

  function moveRequestTab(tab: string, target: string) {
    if (tab === target) return
    setRequestTabOrder((current) => {
      const order = [...(current.length ? current : requestTabs)]
      const from = order.indexOf(tab)
      const to = order.indexOf(target)
      if (from < 0 || to < 0) return order
      order.splice(from, 1)
      order.splice(to, 0, tab)
      return order
    })
  }
  const available = Boolean(window.desktopApi?.httpSend)
  const activeParams = useMemo(() => params.filter((item) => item.enabled && item.key.trim()), [params])
  const activeHeaders = useMemo(() => headers.filter((item) => item.enabled && item.key.trim()), [headers])

  useEffect(() => {
    const unsubscribe = window.desktopApi?.onHttpChunk?.((payload) => {
      if (payload.requestId !== requestIdRef.current) return
      if (payload.sse) setStreamSse(true)
      if (payload.chunk) setStreamBody((current) => current + payload.chunk)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    setResult(undefined)
    setStreamBody('')
    setStreamSse(false)
    setAssertionResult(undefined)
    setInputError('')
    setProcessVariableDialog(undefined)
  }, [activeApiId])

  useEffect(() => {
    if (!activeApiId) {
      draftSyncKeyRef.current = ''
      setMethod('GET')
      setUrl('')
      setParams([])
      setHeaders([])
      setBody('')
      setBodyType('json')
      setFormFields([])
      setBearerToken('')
      setAssertion('')
      setDescription('')
      setSaveMessage('')
      return
    }
    draftSyncKeyRef.current = ''
    const request = activeRequest as RequestDefinition | undefined
    setMethod(request?.method ?? activeApiNode?.method ?? 'GET')
    setUrl(request?.url ?? '')
    setParams(request?.params?.map((item, index) => ({ id: item.id || `${activeApiId}-param-${index}`, key: item.key, value: item.value, enabled: item.enabled })) ?? [{ id: `${activeApiId}-param-0`, key: '', value: '', enabled: true }])
    setHeaders(request?.headers?.map((item, index) => ({ id: item.id || `${activeApiId}-header-${index}`, key: item.key, value: item.value, enabled: item.enabled })) ?? [{ id: `${activeApiId}-header-0`, key: '', value: '', enabled: true }])
    if (request && request.params.length === 0) setParams([{ id: `${activeApiId}-param-0`, key: '', value: '', enabled: true }])
    if (request && request.headers.length === 0) setHeaders([{ id: `${activeApiId}-header-0`, key: '', value: '', enabled: true }])
    setBody(request?.body ?? '')
    setBodyType(request?.bodyType ?? 'json')
    setFormFields(request?.formFields?.length ? request.formFields : [{ id: `${activeApiId}-form-0`, key: '', value: '', kind: 'text', enabled: true }])
    const authorization = request?.headers?.find((item) => item.key.toLowerCase() === 'authorization')?.value ?? ''
    setBearerToken(authorization.replace(/^Bearer\s+/i, ''))
    setDescription(request?.description ?? '')
  }, [activeApiId, activeApiNode?.method, activeRequest])

  useEffect(() => {
    if (!activeRequest) return
    if (draftSyncKeyRef.current !== activeRequest.id) {
      draftSyncKeyRef.current = activeRequest.id
      return
    }
    if (draftSignature !== savedSignature) markUnsaved()
  }, [activeRequest, draftSignature, savedSignature, markUnsaved])

  useEffect(() => {
    const handleSaveRequest = () => saveRequestRef.current()
    window.addEventListener('api-forge:save-request', handleSaveRequest)
    return () => window.removeEventListener('api-forge:save-request', handleSaveRequest)
  }, [])

  function updateParam(index: number, field: keyof HttpFieldItem, value: string | boolean) {
    setParams((current) => current.map((item, currentIndex) => (currentIndex === index ? { ...item, [field]: value } : item)))
  }

  function addParam() {
    setParams((current) => [...current, { id: `param-${crypto.randomUUID()}`, key: '', value: '', enabled: true }])
  }

  function removeParam(index: number) {
    setParams((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  function saveCurrentRequest() {
    if (!activeApiId) return
    const request: RequestDefinition = {
      id: activeApiId,
      protocol: activeApiNode?.protocol ?? 'http',
      name: activeApiNode?.name ?? activeApiId,
      description: description.trim() || undefined,
      method,
      url,
      params: params.map((item, index) => ({ id: `${activeApiId}-param-${index}`, ...item })),
      headers: headers.map((item, index) => ({ id: `${activeApiId}-header-${index}`, ...item })),
      body,
      bodyType,
      formFields,
      updatedAt: new Date().toISOString(),
    }
    updateRequest(request)
    saveNow()
    setSaveMessage('已保存')
    window.setTimeout(() => setSaveMessage(''), 1800)
  }

  saveRequestRef.current = saveCurrentRequest

  function buildRequestBody() {
    if (bodyType === 'form-urlencoded') {
      return new URLSearchParams(formFields.filter((item) => item.enabled && item.kind === 'text').map((item) => [item.key, replaceEnvironmentVariables(item.value, variables)])).toString()
    }
    return replaceEnvironmentVariables(body, variables)
  }

  function updateBodyType(nextType: NonNullable<RequestDefinition['bodyType']>) {
    setBodyType(nextType)
    const contentType = nextType === 'form-urlencoded'
      ? 'application/x-www-form-urlencoded'
      : nextType === 'multipart'
        ? 'multipart/form-data'
        : nextType === 'json'
          ? 'application/json'
          : nextType === 'xml'
            ? 'application/xml'
            : nextType === 'html'
              ? 'text/html'
              : nextType === 'javascript'
                ? 'application/javascript'
                : nextType === 'text'
                  ? 'text/plain'
                  : undefined
    if (!contentType) return
    setHeaders((current) => {
      const index = current.findIndex((item) => item.key.toLowerCase() === 'content-type')
      if (index < 0) return [...current, { id: `header-${crypto.randomUUID()}`, key: 'Content-Type', value: contentType, enabled: true }]
      return current.map((item, itemIndex) => itemIndex === index ? { ...item, value: contentType, enabled: true } : item)
    })
  }

  function updateBearer(value: string) {
    setBearerToken(value)
    setHeaders((current) => {
      const index = current.findIndex((item) => item.key.toLowerCase() === 'authorization')
      if (index < 0) return [...current, { id: `header-${crypto.randomUUID()}`, key: 'Authorization', value: `Bearer ${value}`, enabled: true }]
      return current.map((item, itemIndex) => itemIndex === index ? { ...item, value: `Bearer ${value}` } : item)
    })
  }

  function transformJsonBody(compact: boolean) {
    try {
      setBody(JSON.stringify(JSON.parse(body), null, compact ? 0 : 2))
      setInputError('')
    } catch {
      setInputError(`Body 不是有效的 JSON，无法${compact ? '压缩' : '格式化'}`)
    }
  }

  function openProcessVariableDialog(selectedText: string) {
    if (!activeApiId) return
    const selected = selectedText.trim().replace(/^['"]|['"]$/g, '')
    let parsedResponse: unknown
    try { parsedResponse = JSON.parse(responseBody ?? '') } catch { parsedResponse = undefined }
    const jsonPath = selected.startsWith('$')
      ? selected
      : findJsonPath(parsedResponse, selected) ?? `$.${selected.replace(/\s+/g, '')}`
    setProcessVariableError('')
    setProcessVariableNotice('')
    setProcessVariableDialog({ id: `process-${crypto.randomUUID()}`, key: selected.split('.').pop() || 'response_value', sourceRequestId: activeApiId, jsonPath })
  }

  function submitProcessVariable() {
    if (!processVariableDialog?.key.trim()) return setProcessVariableError('请输入变量名')
    if (!processVariableDialog.jsonPath.trim().startsWith('$')) return setProcessVariableError('JSONPath 必须以 $ 开头')
    updateProcessVariable(processVariableDialog)
    const insertedKey = processVariableDialog.key.trim()
    setProcessVariableDialog(undefined)
    setProcessVariableError('')
    setProcessVariableNotice(`过程变量已保存：{{${insertedKey}}}`)
  }

  async function sendRequest() {
    if (!window.desktopApi?.httpSend) {
      setInputError('当前为浏览器预览环境，HTTP 调试需要在 Electron 桌面端运行。')
      return
    }

    const headers = Object.fromEntries(
      activeHeaders.map((item) => [item.key, replaceEnvironmentVariables(item.value, variables)]),
    )

    const resolvedUrl = replaceEnvironmentVariables(url, variables)
    const unresolvedVariable = resolvedUrl.match(/\{\{[^{}]+\}\}/)?.[0]
    if (unresolvedVariable) {
      setInputError(`变量未解析：${unresolvedVariable}。请检查当前环境或先调用过程变量的来源接口。`)
      return
    }
    const nextUrl = new URL(resolvedUrl, 'http://localhost')
    activeParams.forEach((item) => nextUrl.searchParams.set(item.key, replaceEnvironmentVariables(item.value, variables)))

    setInputError('')
    setLoading(true)
    setResult(undefined)
    setStreamBody('')
    setStreamSse(false)
    setSseDisplayMode('stream')
    const requestId = crypto.randomUUID()
    requestIdRef.current = requestId
    try {
      const response = await window.desktopApi.httpSend({
        requestId,
        method,
        url: nextUrl.toString().replace('http://localhost', ''),
        params: activeParams,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : buildRequestBody(),
      })
      if (requestIdRef.current !== requestId) return
      setResult(response)
      if (response.ok === false && response.error.code === 'CANCELED') return
      if (response.ok && activeApiId) captureProcessVariables(activeApiId, response.body)
      if (assertion.trim()) {
        const expression = replaceEnvironmentVariables(assertion.trim(), variables)
        try {
          const responseBody = response.ok ? response.body : ''
          let parsedBody: unknown = responseBody
          try { parsedBody = JSON.parse(responseBody) } catch { /* 非 JSON 响应按文本提供给断言 */ }
          const evaluate = new Function('status', 'headers', 'body', `return Boolean(${expression})`) as (status: number | undefined, headers: Record<string, string>, body: unknown) => boolean
          const passed = evaluate(response.ok ? response.status : undefined, response.ok ? response.headers : {}, parsedBody)
          setAssertionResult({ ok: passed, message: passed ? '断言通过' : '断言未通过' })
        } catch (error) {
          setAssertionResult({ ok: false, message: `断言表达式无效：${error instanceof Error ? error.message : '无法执行'}` })
        }
      } else {
        setAssertionResult(undefined)
      }
      addHistory({
        id: `history-${crypto.randomUUID()}`,
        protocol: 'http',
        method,
        url: nextUrl.toString(),
        status: response.ok ? response.status : undefined,
        durationMs: response.ok ? response.durationMs : undefined,
        sizeBytes: response.ok ? response.sizeBytes : undefined,
        environmentId: activeEnvironmentId,
        createdAt: new Date().toISOString(),
        requestSnapshot: { apiId: activeApiId, request: { method, url, params, headers, body, bodyType, formFields } },
        responseSnapshot: response,
      })
    } catch (error) {
      const failure = { ok: false as const, error: { code: 'UNKNOWN_ERROR' as const, message: error instanceof Error ? error.message : '请求失败' } }
      setResult(failure)
      addHistory({ id: `history-${crypto.randomUUID()}`, protocol: 'http', method, url: nextUrl.toString(), environmentId: activeEnvironmentId, createdAt: new Date().toISOString(), requestSnapshot: { apiId: activeApiId, request: { method, url, params, headers, body, bodyType, formFields } }, responseSnapshot: failure })
    } finally {
      setLoading(false)
    }
  }

  function stopRequest() {
    const requestId = requestIdRef.current
    if (!requestId) return
    requestIdRef.current = ''
    setLoading(false)
    setInputError('请求已中断')
    void window.desktopApi?.httpCancel(requestId)
  }

  const responseBody = streamBody || (result && result.ok ? result.body : result && 'error' in result ? result.error.message : undefined)
  const errorCode = result && 'error' in result ? result.error.code : undefined
  const responseContentType = result?.ok ? (result.headers['content-type'] ?? '') : ''
  const isJsonResponse = result?.ok === true && /(?:application\/json|\+json)(?:\s*;|$)/i.test(responseContentType)
  const formattedResponseBody = isJsonResponse && responseBody
    ? (() => {
      try { return JSON.stringify(JSON.parse(responseBody), null, 2) } catch { return responseBody }
    })()
    : responseBody
  const sseEvents = parseSseEvents(streamBody)
  const streamText = normalizeStreamText(sseEvents.map((item) => item.streamData).join(''))

  return (
    <div ref={splitContainerRef} className={`relative grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] overflow-auto lg:grid-cols-[var(--http-split-ratio)_minmax(0,1fr)] lg:grid-rows-1 lg:overflow-hidden ${isResizing ? 'select-none' : ''}`} style={{ '--http-split-ratio': `${splitRatio * 100}%` } as CSSProperties}>
      <section className="flex min-h-0 min-w-0 flex-col border-b border-zinc-800 bg-[#0b0f14] lg:border-b-0 lg:border-r">
        <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-2">
          <select value={method} onChange={(event) => setMethod(event.target.value as HttpMethod)} className={`h-9 rounded border px-3 text-xs font-semibold outline-none ${methodColorClasses[method]}`}>
            {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as HttpMethod[]).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div className="relative min-w-0 basis-full flex-1 sm:basis-auto sm:min-w-[180px]">
            <VariableInput value={url} variables={variables} onChange={setUrl} placeholder="输入请求地址，例如 {{base_url}}/api" className="h-9 w-full rounded border border-zinc-700 bg-transparent px-3 text-sm text-zinc-100 caret-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-400/60" />
          </div>
          <button onClick={loading ? stopRequest : sendRequest} disabled={!loading && !available} className={`flex h-9 items-center gap-2 rounded px-4 text-xs font-semibold text-zinc-950 disabled:opacity-60 ${loading ? 'bg-rose-400 hover:bg-rose-300' : 'bg-cyan-400 hover:bg-cyan-300'}`}>
            {loading ? <Square className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {loading ? '停止' : '发送'}
          </button>
          <button onClick={saveCurrentRequest} disabled={!activeApiId} title={activeApiId ? '保存当前 API' : '请先从左侧打开一个 API'} className="flex h-9 items-center gap-2 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saveMessage || '保存'}</button>
        </div>
        <div className="flex h-12 shrink-0 items-end gap-6 border-b border-zinc-800 px-4 text-sm text-zinc-500">
          {orderedRequestTabs.map((tab) => (
            <button key={tab} draggable onDragStart={(event) => event.dataTransfer.setData('text/request-tab', tab)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); moveRequestTab(event.dataTransfer.getData('text/request-tab'), tab) }} onClick={() => setActiveRequestTab(tab as (typeof requestTabs)[number])} className={`cursor-grab border-b-2 pb-3 transition-colors active:cursor-grabbing ${activeRequestTab === tab ? 'border-cyan-400 text-zinc-100' : 'border-transparent hover:text-zinc-300'}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {activeRequestTab === 'Headers' && (
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-300">
                <span>Headers</span>
                <button onClick={() => setHeaders((current) => [...current, { id: `header-${crypto.randomUUID()}`, key: '', value: '', enabled: true }])} className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-100">
                  <Plus className="h-3 w-3" />
                  新增
                </button>
              </div>
              <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950 p-3">
                <datalist id="header-content-type-values">
                  {headerValueOptions['Content-Type'].map((item) => <option key={item} value={item} />)}
                </datalist>
                <datalist id="header-authorization-values">
                  {headerValueOptions.Authorization.map((item) => <option key={item} value={item} />)}
                </datalist>
                <datalist id="header-key-values">{headerKeyOptions.map((item) => <option key={item} value={item} />)}</datalist>
                {headers.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_24px] items-center gap-2">
                    <input type="checkbox" checked={item.enabled} onChange={(event) => setHeaders((current) => current.map((entry, currentIndex) => (currentIndex === index ? { ...entry, enabled: event.target.checked } : entry)))} className="h-4 w-4 accent-cyan-400" />
                    <VariableInput list="header-key-values" value={item.key} variables={variables} onChange={(value) => setHeaders((current) => current.map((entry, currentIndex) => (currentIndex === index ? { ...entry, key: value } : entry)))} placeholder="key" className="h-9 w-full rounded border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-100 outline-none focus:border-cyan-400/60" />
                    <VariableInput list={item.key === 'Content-Type' ? 'header-content-type-values' : item.key === 'Authorization' ? 'header-authorization-values' : undefined} value={item.value} variables={variables} onChange={(value) => setHeaders((current) => current.map((entry, currentIndex) => (currentIndex === index ? { ...entry, value } : entry)))} placeholder="value" className="h-9 w-full rounded border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-100 outline-none focus:border-cyan-400/60" />
                    <button onClick={() => setHeaders((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" title="删除 header">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeRequestTab === 'Bearer' && (
            <div className="space-y-4 rounded border border-zinc-800 bg-zinc-950 p-4"><label className="block text-xs text-zinc-400">认证方式<select className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-100"><option>Bearer Token</option><option>Basic Auth</option><option>API Key</option></select></label><label className="block text-xs text-zinc-400">Token<VariableInput value={bearerToken} variables={variables} onChange={updateBearer} className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-400/60" placeholder="输入 token 或 {{token}}" /></label><p className="text-[11px] text-zinc-600">保存后会同步更新 Headers 中的 Authorization。</p></div>
          )}
          {activeRequestTab === 'Body' && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-medium text-zinc-300">Body</label>
                <div className="flex items-center gap-2">
                  {bodyType === 'json' && (
                    <>
                      <button onClick={() => transformJsonBody(false)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800">格式化</button>
                      <button onClick={() => transformJsonBody(true)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800">压缩</button>
                    </>
                  )}
                  <select value={bodyType} onChange={(event) => updateBodyType(event.target.value as NonNullable<RequestDefinition['bodyType']>)} className="h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-300">
                    <option value="json">JSON</option>
                    <option value="form-urlencoded">表单 URL 编码</option>
                    <option value="multipart">Multipart 表单</option>
                    <option value="text">纯文本</option>
                    <option value="xml">XML</option>
                    <option value="html">HTML</option>
                    <option value="javascript">JavaScript</option>
                  </select>
                </div>
              </div>
              {(bodyType === 'form-urlencoded' || bodyType === 'multipart') ? (
                <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950 p-3">
                  {formFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_110px_24px] gap-2">
                      <input type="checkbox" checked={field.enabled} onChange={(event) => setFormFields((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} className="h-4 w-4 shrink-0 self-center justify-self-center accent-cyan-400" />
                      <VariableInput value={field.key} variables={variables} onChange={(value) => setFormFields((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, key: value } : item))} placeholder="key" className="h-9 w-full rounded border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-100" />
                      {field.kind === 'file' ? (
                        <label htmlFor={`form-file-${field.id}`} className="flex h-9 min-w-0 cursor-pointer items-center overflow-hidden rounded border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-300 hover:border-zinc-600">
                          <input id={`form-file-${field.id}`} type="file" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setFormFields((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, value: `@${file.name}` } : item)); event.currentTarget.value = '' }} />
                          <span className="truncate">{field.value || '选择文件'}</span>
                        </label>
                      ) : (
                        <VariableInput value={field.value} variables={variables} onChange={(value) => setFormFields((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item))} placeholder="value" className="h-9 w-full rounded border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-100" />
                      )}
                      <select value={field.kind} onChange={(event) => setFormFields((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, kind: event.target.value as 'text' | 'file' } : item))} className="h-9 rounded border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-100">
                        <option value="text">文本</option>
                        <option value="file">文件</option>
                      </select>
                      <button onClick={() => setFormFields((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="text-zinc-500 hover:text-zinc-100" title="删除字段">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setFormFields((items) => [...items, { id: `form-${crypto.randomUUID()}`, key: '', value: '', kind: 'text', enabled: true }])} className="inline-flex items-center gap-1 text-xs text-cyan-300">
                    <Plus className="h-3 w-3" />
                    新增字段
                  </button>
                </div>
              ) : (
                <div className="min-h-[240px] flex-1 overflow-hidden rounded border border-zinc-800 bg-[#0b0f14]">
                  <VariableEditor height="100%" language={bodyType === 'json' ? 'json' : bodyType} theme={editorTheme} variables={editorVariables} value={body} onChange={(value) => setBody(value ?? '')} options={{ minimap: { enabled: false }, lineNumbers: 'on', tabSize: 2, wordWrap: 'on', padding: { top: 12, bottom: 12 }, fontSize: 12 }} />
                </div>
              )}
            </div>
          )}
          {activeRequestTab === 'Params' && (
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-300">
                <span>Params</span>
                <button onClick={addParam} className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-100">
                  <Plus className="h-3 w-3" />
                  新增
                </button>
              </div>
              <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950 p-3">
                {params.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_24px] items-center gap-2">
                    <input type="checkbox" checked={item.enabled} onChange={(event) => updateParam(index, 'enabled', event.target.checked)} className="h-4 w-4 accent-cyan-400" />
                    <VariableInput value={item.key} variables={variables} onChange={(value) => updateParam(index, 'key', value)} placeholder="key" className="h-9 w-full rounded border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-100 outline-none focus:border-cyan-400/60" />
                    <VariableInput value={item.value} variables={variables} onChange={(value) => updateParam(index, 'value', value)} placeholder="value" className="h-9 w-full rounded border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-100 outline-none focus:border-cyan-400/60" />
                    <button onClick={() => removeParam(index)} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" title="删除参数">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeRequestTab === 'Settings' && (
            <div className="space-y-3 rounded border border-zinc-800 bg-zinc-950 p-4 text-xs"><label className="flex items-center justify-between text-zinc-300">请求超时（毫秒）<input type="number" min="0" value={timeout} onChange={(event) => setTimeoutValue(Number(event.target.value))} className="h-8 w-32 rounded border border-zinc-700 bg-zinc-900 px-2 text-right text-zinc-100" /></label><label className="flex items-center justify-between text-zinc-300">跟随重定向<input type="checkbox" checked={followRedirects} onChange={(event) => setFollowRedirects(event.target.checked)} className="h-4 w-4 accent-cyan-400" /></label><label className="flex items-center justify-between text-zinc-300">校验证书<input type="checkbox" checked={validateCertificates} onChange={(event) => setValidateCertificates(event.target.checked)} className="h-4 w-4 accent-cyan-400" /></label></div>
          )}
          {activeRequestTab === 'Info' && (
            <div className="space-y-4 rounded border border-zinc-800 bg-zinc-950 p-4 text-xs"><div className="grid grid-cols-2 gap-3"><div><div className="text-zinc-600">接口名称</div><div className="mt-1 text-zinc-200">{activeApiNode?.name ?? '-'}</div></div><div><div className="text-zinc-600">协议</div><div className="mt-1 uppercase text-cyan-200">{activeApiNode?.protocol ?? '-'}</div></div><div><div className="text-zinc-600">参数数量</div><div className="mt-1 text-zinc-200">{params.length}</div></div><div><div className="text-zinc-600">最后修改</div><div className="mt-1 text-zinc-400">{activeRequest?.updatedAt ? new Date(activeRequest.updatedAt).toLocaleString() : '未保存'}</div></div></div><label className="block text-zinc-400">备注描述<textarea value={description} onChange={(event) => setDescription(event.target.value)} onBlur={saveCurrentRequest} className="mt-2 min-h-24 w-full resize-y rounded border border-zinc-700 bg-zinc-900 p-3 text-xs leading-5 text-zinc-100 outline-none focus:border-cyan-400/60" placeholder="请输入接口用途、前置条件或其他备注" /></label></div>
          )}
          {activeRequestTab === 'Test' && (
            <div className="space-y-4 rounded border border-zinc-800 bg-zinc-950 p-4 text-xs"><label className="block text-zinc-400">响应断言<VariableInput multiline value={assertion} variables={variables} onChange={(value) => { setAssertion(value); setAssertionResult(undefined) }} placeholder="例如：status === 200 或 {{expected_status}}" className="mt-2 box-border block min-h-24 w-full resize-y rounded border border-zinc-700 bg-zinc-900 p-3 font-mono text-xs leading-5 text-zinc-100 outline-none focus:border-cyan-400/60" /></label>{assertionResult && <div className={`rounded border px-3 py-2 text-xs ${assertionResult.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>{assertionResult.message}</div>}<button onClick={() => { setAssertion('status === 200'); setAssertionResult(undefined) }} className="inline-flex items-center gap-1 rounded border border-zinc-700 px-3 py-2 text-zinc-300 hover:bg-zinc-800"><Check className="h-3.5 w-3.5" />插入常用断言</button><div className="border-t border-zinc-800 pt-3 text-[11px] leading-5 text-zinc-500"><div className="mb-1 font-medium text-zinc-300">断言编写说明</div><p>请求发送后执行断言，表达式结果为 true 时通过。</p><p><code className="text-cyan-300">status</code> 表示状态码，<code className="text-cyan-300">headers</code> 表示响应头，<code className="text-cyan-300">body</code> 表示响应内容（JSON 会自动解析）。</p><p>示例：<code className="text-zinc-300">status === 200</code>、<code className="text-zinc-300">body.code === 0</code>、<code className="text-zinc-300">body.data.length &gt; 0</code></p><p>可使用 <code className="text-cyan-300">{'{{变量名}}'}</code> 引用当前环境变量。</p></div></div>
          )}
          {inputError && <p className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{inputError}</p>}
          {!available && <p className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">当前环境不可用：请启动 Electron 桌面端后发送真实 HTTP 请求。</p>}
        </div>
      </section>
      <button type="button" aria-label="调整请求和响应区域宽度" title="拖动调整请求和响应区域宽度" onPointerDown={(event) => {
        event.preventDefault()
        const container = splitContainerRef.current
        const rect = container?.getBoundingClientRect()
        if (rect) {
          const dividerX = rect.left + rect.width * splitRatio
          resizePointerOffsetRef.current = event.clientX - dividerX
        }
        setIsResizing(true)
      }} className="resize-handle http-split-resize-handle group absolute inset-y-0 left-[var(--http-split-ratio)] z-20 hidden w-3 -translate-x-1/2 items-center justify-center bg-transparent lg:flex" style={{ cursor: 'col-resize' }}>
        <span className={`resize-line relative h-full ${isResizing ? 'is-resizing' : ''}`}>
          <span className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-0.5 rounded-full border border-zinc-700/80 bg-[#0f141b]/90 px-1 py-1.5 shadow-lg backdrop-blur-sm transition-[opacity,border-color] duration-150 ${isResizing ? 'border-cyan-400/60 opacity-100' : 'opacity-0 group-hover:border-cyan-400/40 group-hover:opacity-100'}`}>
          <span className="h-0.5 w-0.5 rounded-full bg-cyan-200/80" />
          <span className="h-0.5 w-0.5 rounded-full bg-cyan-200/80" />
          <span className="h-0.5 w-0.5 rounded-full bg-cyan-200/80" />
          </span>
        </span>
      </button>
      <section className="relative flex min-h-0 min-w-0 flex-col bg-[#0f141b]">
        {processVariableNotice && <div role="status" className="process-variable-notice absolute right-4 top-4 z-40 rounded border px-3 py-2 text-xs shadow-xl backdrop-blur">{processVariableNotice}</div>}
        <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
          <div className="flex items-center gap-2">
            {result?.ok && <StatusPill tone={result.status < 400 ? 'green' : 'red'}>{result.status}</StatusPill>}
            {loading && <span className="text-xs text-cyan-300">请求进行中...</span>}
            {result?.ok && <span className="text-xs text-zinc-500">{result.durationMs} ms · {formatBytes(result.sizeBytes)}</span>}
            {errorCode && <StatusPill tone="red">{errorCode}</StatusPill>}
          </div>
        </div>
        <div className="flex h-12 shrink-0 items-end justify-between border-b border-zinc-800 px-4 text-xs text-zinc-500">
          <div className="flex items-end gap-5">
            {(['Body', 'Headers', 'Cookies', '日志'] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveResponseTab(tab)} className={`border-b-2 pb-3 transition-colors ${activeResponseTab === tab ? 'border-cyan-400 text-zinc-100' : 'border-transparent hover:text-zinc-300'}`}>{tab}</button>
            ))}
          </div>
          <button onClick={() => result?.ok && navigator.clipboard.writeText(result.body)} disabled={!result?.ok} className="mb-1 rounded p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30" title="复制响应"><Copy className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          {!result && !loading && <p className="rounded border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-600">发送请求后显示真实响应</p>}
          {activeResponseTab === 'Body' && responseBody && (streamSse ? <div className="flex min-h-0 min-w-0 flex-1 flex-col"><div className="mb-3 flex shrink-0 items-center"><div className="inline-flex rounded border border-zinc-700 bg-zinc-950 p-1"><button onClick={() => setSseDisplayMode('stream')} className={`rounded px-3 py-1.5 text-xs ${sseDisplayMode === 'stream' ? 'bg-cyan-400/15 text-cyan-200' : 'text-zinc-500 hover:text-zinc-300'}`}>流式</button><button onClick={() => setSseDisplayMode('raw')} className={`rounded px-3 py-1.5 text-xs ${sseDisplayMode === 'raw' ? 'bg-cyan-400/15 text-cyan-200' : 'text-zinc-500 hover:text-zinc-300'}`}>原始 JSON</button></div></div>{sseDisplayMode === 'stream' ? <div className="min-h-0 flex-1 overflow-y-auto rounded border border-cyan-400/20 bg-zinc-950 p-4 text-zinc-200"><MarkdownText value={streamText} /></div> : <div className="min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto pr-1">{sseEvents.map((item) => <div key={item.key} className="min-w-0 overflow-hidden rounded border border-cyan-400/20 bg-zinc-950 p-3"><div className="mb-1 flex gap-3 text-[11px] text-cyan-300"><span>{item.event}</span>{item.id && <span className="text-zinc-600">#{item.id}</span>}</div><pre className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-5 text-zinc-300">{item.rawData}</pre></div>)}</div>}</div> : isJsonResponse ? <div className="relative min-h-0 flex-1 overflow-hidden rounded border border-zinc-800 bg-[#0b0f14]"><VariableEditor height="100%" language="json" theme={editorTheme} variables={{}} value={formattedResponseBody ?? ''} onInsertProcessVariable={openProcessVariableDialog} options={{ readOnly: true, minimap: { enabled: false }, lineNumbers: 'on', tabSize: 2, wordWrap: 'on', padding: { top: 12, bottom: 12 }, fontSize: 12 }} /></div> : <pre className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded border p-4 font-mono text-xs leading-6 ${result?.ok ? 'border-zinc-800 bg-zinc-950 text-zinc-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>{responseBody}</pre>)}
          {activeResponseTab === 'Headers' && result?.ok && <pre className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-500">{JSON.stringify(result.headers, null, 2)}</pre>}
          {activeResponseTab === 'Cookies' && <div className="rounded border border-dashed border-zinc-800 bg-zinc-950 p-5 text-xs text-zinc-600">当前响应未提供可解析的 Cookie。</div>}
          {activeResponseTab === '日志' && <div className="rounded border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-6 text-zinc-500">{loading ? 'request: sending' : result ? `request: ${result.ok ? 'completed' : 'failed'}` : 'request: idle'}</div>}
        </div>
        {processVariableDialog && <form onSubmit={(event) => { event.preventDefault(); submitProcessVariable() }} className="absolute bottom-4 left-4 right-4 z-30 rounded border border-cyan-400/30 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur"><div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-200"><span>插入过程变量</span><button type="button" onClick={() => setProcessVariableDialog(undefined)} className="text-zinc-500 hover:text-zinc-200">关闭</button></div><div className="grid grid-cols-1 gap-2 md:grid-cols-3"><label className="text-[11px] text-zinc-400">变量名<input autoFocus value={processVariableDialog.key} onChange={(event) => setProcessVariableDialog({ ...processVariableDialog, key: event.target.value })} className="mt-1 h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100" /></label><label className="text-[11px] text-zinc-400">JSONPath<input value={processVariableDialog.jsonPath} onChange={(event) => setProcessVariableDialog({ ...processVariableDialog, jsonPath: event.target.value })} className="mt-1 h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-zinc-100" /></label><label className="text-[11px] text-zinc-400">描述<input value={processVariableDialog.description ?? ''} onChange={(event) => setProcessVariableDialog({ ...processVariableDialog, description: event.target.value })} className="mt-1 h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100" /></label></div>{processVariableError && <div className="mt-2 text-[11px] text-rose-300">{processVariableError}</div>}<button className="mt-3 flex h-8 items-center justify-center rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950">保存并插入</button></form>}
      </section>
    </div>
  )
}
