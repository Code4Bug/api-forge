import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Check, ChevronDown, ChevronRight, Copy, Download, RotateCcw, Send, Settings2, Sparkles, Square, Wrench } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { ApiTreeNode, HttpMethod, LargeModelConfig, Protocol } from '@/shared/ipc-contracts'
import { useWorkspaceStore } from '@/stores/workspace-store'

type Message = { id: string; role: 'user' | 'assistant' | 'reasoning' | 'tool'; content: string; tool?: string; reasoningDone?: boolean }
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: string }
type ToolName = 'list_directories' | 'get_directory' | 'create_directory' | 'edit_directory' | 'delete_directory' | 'list_apis' | 'get_api_details' | 'create_api' | 'edit_api' | 'delete_api' | 'get_app_version' | 'get_usage_help'
type ModelMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>; tool_call_id?: string; name?: string }

const toolLabels: Record<ToolName, string> = { list_directories: '列出目录', get_directory: '查询目录', create_directory: '新增目录', edit_directory: '修改目录', delete_directory: '删除目录', list_apis: '列出接口', get_api_details: '查看接口详情', create_api: '新增接口', edit_api: '编辑接口', delete_api: '删除接口', get_app_version: '获取应用版本', get_usage_help: '获取使用说明' }
const toolDefinitions = Object.entries(toolLabels).map(([name, description]) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: name === 'create_directory' ? { name: { type: 'string' }, parentId: { type: 'string' } } : name === 'edit_directory' ? { id: { type: 'string' }, name: { type: 'string' } } : name === 'create_api' ? { name: { type: 'string' }, parentId: { type: 'string' }, protocol: { type: 'string', enum: ['http', 'websocket', 'socket'] }, method: { type: 'string' }, url: { type: 'string' }, headers: { type: 'array' }, body: { type: 'string' } } : name === 'edit_api' ? { id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' }, method: { type: 'string' }, body: { type: 'string' } } : name === 'delete_api' || name === 'list_directories' || name === 'get_directory' || name === 'delete_directory' || name === 'list_apis' || name === 'get_api_details' ? { id: { type: 'string' } } : {}, required: name === 'create_directory' || name === 'create_api' ? ['name'] : name === 'get_directory' || name === 'edit_directory' || name === 'delete_directory' || name === 'get_api_details' ? ['id'] : [] } } }))

function flatten(nodes: ApiTreeNode[]): ApiTreeNode[] { return nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]) }
function json(value: unknown) { return JSON.stringify(value, null, 2) }

function buildConversationExport(conversations: Conversation[]) {
  const sections = conversations.map((conversation) => {
    const messages = conversation.messages.map((message) => {
      const role = message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : message.role === 'reasoning' ? '思考' : '工具' + (message.tool ? `（${message.tool}）` : '')
      return '### ' + role + '\n\n' + (message.content || '（无内容）')
    }).join('\n\n')
    return '## ' + (conversation.title || '新对话') + '\n\n' + (messages || '（暂无消息）')
  })
  return '# AI 工作台对话记录\n\n' + sections.join('\n\n---\n\n')
}

function removeDuplicateEmptyConversations(conversations: Conversation[]): Conversation[] {
  const firstEmptyId = conversations.find((conversation) => conversation.messages.length === 0)?.id
  return conversations.filter((conversation) => conversation.messages.length > 0 || conversation.id === firstEmptyId)
}

function limitContext(messages: ModelMessage[], maxTokens: number): ModelMessage[] {
  const limit = Math.max(1, maxTokens)
  const system = messages[0]
  const result: ModelMessage[] = system?.role === 'system' ? [system] : []
  let used = Math.ceil((system?.content?.length ?? 0) / 4)
  for (let index = messages.length - 1; index >= (system ? 1 : 0); index -= 1) {
    const message = messages[index]
    const cost = Math.ceil((message.content?.length ?? 0) / 4)
    if (result.length > 1 && used + cost > limit) break
    result.splice(system ? 1 : 0, 0, message)
    used += cost
  }
  return result
}

function buildThinkingParams(config: LargeModelConfig | undefined) {
  const enabled = config?.thinkingEnabled === true
  // Qwen/vLLM 等 OpenAI 兼容服务分别读取这两个位置，显式传 false 也能关闭服务端默认思考。
  return { enable_thinking: enabled, chat_template_kwargs: { enable_thinking: enabled } }
}

function MarkdownText({ value }: { value: string }) {
  // 模型常以换行开始，清理首行空白，保留正文和代码块中的换行。
  const normalized = value.replace(/^\s+/, '').replace(/\n{2,}/g, '\n')
  const escaped = normalized.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const tableRows = escaped.split('\n')
  const tableHtml: string[] = []
  for (let index = 0; index < tableRows.length; index += 1) {
    const separator = tableRows[index].trim().match(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/)
    if (!separator || index === 0 || !tableRows[index - 1].includes('|')) continue
    const body: string[] = []
    let rowIndex = index + 1
    while (rowIndex < tableRows.length && tableRows[rowIndex].includes('|') && tableRows[rowIndex].trim()) { body.push(tableRows[rowIndex]); rowIndex += 1 }
    const cells = (row: string) => row.split('|').map((cell) => cell.trim()).filter(Boolean)
    const renderRow = (row: string, tag: 'th' | 'td') => `<tr>${cells(row).map((cell) => `<${tag} class="border border-zinc-700 px-3 py-1.5 text-left">${cell}</${tag}>`).join('')}</tr>`
    tableHtml.push(`<table class="my-2 w-full border-collapse text-xs"><thead>${renderRow(tableRows[index - 1], 'th')}</thead><tbody>${body.map((row) => renderRow(row, 'td')).join('')}</tbody></table>`)
    tableRows.splice(index - 1, body.length + 2, `@@API_FORGE_TABLE_${tableHtml.length - 1}@@`)
    index -= 1
  }
  const html = tableRows.join('\n')
    .replace(/```([\s\S]*?)```/g, '<pre class="my-2 overflow-auto rounded bg-black/30 p-2 font-mono text-[11px]"><code>$1</code></pre>')
    .replace(/^### (.*)$/gm, '<h3 class="mt-2 font-semibold text-zinc-200">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="mt-2 font-semibold text-zinc-100">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 class="mt-2 text-sm font-semibold text-zinc-100">$1</h1>')
    .replace(/^[-*] (.*)$/gm, '<li class="my-0 ml-4 list-disc leading-5">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-black/20 px-1 font-mono text-cyan-200">$1</code>')
    .replace(/\n/g, '<br />')
    .replace(/(<li class="[^"]*">[\s\S]*?<\/li>)<br \/>/g, '$1')
    .replace(/@@API_FORGE_TABLE_(\d+)@@/g, (_, tableIndex) => tableHtml[Number(tableIndex)])
  return <div className="markdown-content ai-markdown" dangerouslySetInnerHTML={{ __html: html }} />
}

export default function AIAssistantPage() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const modelConfig = workspace?.preferences.largeModel
  const aiReady = Boolean(modelConfig?.enabled && modelConfig.baseUrl.trim() && modelConfig.model.trim())
  const createApi = useWorkspaceStore((s) => s.createApi)
  const updateRequest = useWorkspaceStore((s) => s.updateRequest)
  const renameNode = useWorkspaceStore((s) => s.renameNode)
  const deleteNode = useWorkspaceStore((s) => s.deleteNode)
  const createFolder = useWorkspaceStore((s) => s.createFolder)
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const stored = localStorage.getItem('ai-chat-conversations')
      if (stored) return removeDuplicateEmptyConversations(JSON.parse(stored) as Conversation[])
      const legacy = JSON.parse(localStorage.getItem('ai-chat-messages') ?? '[]') as Message[]
      return [{ id: crypto.randomUUID(), title: legacy.find((item) => item.role === 'user')?.content?.slice(0, 32) || '新对话', messages: legacy, updatedAt: new Date().toISOString() }]
    } catch { return [{ id: crypto.randomUUID(), title: '新对话', messages: [], updatedAt: new Date().toISOString() }] }
  })
  const [activeConversationId, setActiveConversationId] = useState(() => conversations[0]?.id ?? '')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const conversationsRef = useRef(conversations)
  const aiAbortRef = useRef<AbortController>()
  const [toolsEnabled, setToolsEnabled] = useState(true)
  const [copiedMessageId, setCopiedMessageId] = useState<string>()
  const [exportFeedback, setExportFeedback] = useState<'copied' | 'exported'>()
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [editingMessageId, setEditingMessageId] = useState<string>()
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set())
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set())
  const reasoningFollowRef = useRef(true)
  const reasoningContentRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const shouldFollowRef = useRef(true)

  const nodes = useMemo(() => flatten(workspace?.apiTree ?? []), [workspace?.apiTree])
  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? conversations[0]
  const messages = activeConversation?.messages ?? []
  const promptHistory = messages.filter((message) => message.role === 'user').map((message) => message.content).reverse()
  const contextLimit = Math.max(1, modelConfig?.maxContextTokens ?? 128000)
  const contextTokens = Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 4) + Math.ceil(input.length / 4)
  const contextRatio = Math.min(1, contextTokens / contextLimit)
  const contextPercent = Math.round(contextRatio * 100)
  const contextTone = contextRatio >= 0.9 ? 'danger' : contextRatio >= 0.75 ? 'warning' : 'normal'
  useEffect(() => {
    if (shouldFollowRef.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [activeConversationId, messages.length, messages[messages.length - 1]?.content])
  useEffect(() => {
    const reasoning = messages.find((message) => message.role === 'reasoning' && !message.reasoningDone)
    const element = reasoning ? reasoningContentRefs.current[reasoning.id] : undefined
    if (element && reasoningFollowRef.current) element.scrollTop = element.scrollHeight
  }, [messages.find((message) => message.role === 'reasoning')?.content])
  function persist(next: Conversation[]) {
    conversationsRef.current = next
    setConversations(next)
    localStorage.setItem('ai-chat-conversations', JSON.stringify(next))
  }
  function persistMessages(nextMessages: Message[]) {
    if (!activeConversation) return
    setConversations((current) => {
      const next = current.map((item) => item.id === activeConversation.id ? { ...item, messages: nextMessages, updatedAt: new Date().toISOString() } : item)
      conversationsRef.current = next
      localStorage.setItem('ai-chat-conversations', JSON.stringify(next))
      return next
    })
  }

  function createConversation() {
    if (busy) return
    const current = conversationsRef.current
    const emptyConversation = current.find((conversation) => conversation.messages.length === 0)
    if (emptyConversation) {
      setActiveConversationId(emptyConversation.id)
    } else {
      const conversation = { id: crypto.randomUUID(), title: '新对话', messages: [], updatedAt: new Date().toISOString() }
      persist([conversation, ...current])
      setActiveConversationId(conversation.id)
    }
    setInput('')
    setEditingMessageId(undefined)
    setHistoryIndex(-1)
  }

  async function runTool(name: ToolName, args: Record<string, unknown>) {
    if (name === 'get_app_version') {
      const info = await window.desktopApi?.getAppInfo()
      return info ? json({ name: info.name, version: info.version, platform: info.platform }) : '应用信息不可用'
    }
    if (name === 'get_usage_help') return `API-forge 使用说明：
- HTTP 调试：在 API 目录中打开或新建接口，填写 URL、Params、Headers、Body 后发送请求。
- 环境变量：在环境管理中维护变量，使用 {{变量名}} 插入 URL、请求头和请求体。
- WebSocket：打开 WebSocket 接口后连接、发送消息并查看帧日志。
- TCP/UDP：在 Socket 页面填写主机和端口，连接后发送文本或 Hex 报文。
- 请求历史：底部或历史页面可查看请求结果，并恢复请求配置。
- AI 工具：可查询、新增、修改和删除目录，也可列出、查看详情、创建或编辑接口；删除操作必须先征得用户确认。
- 应用更新：系统设置中检查、下载并安装新版本。`
    if (!workspace) return '工作区尚未加载'
    if (name === 'list_directories') return json(nodes.filter((n) => n.type === 'folder').map(({ id, name, parentId, children }) => ({ id, name, parentId, childCount: children?.length ?? 0 })))
    if (name === 'create_directory') {
      const nameValue = String(args.name || '').trim()
      if (!nameValue) return '目录名称不能为空'
      const parentId = String(args.parentId || '') || undefined
      const parent = parentId ? nodes.find((item) => item.id === parentId) : undefined
      if (parentId && parent?.type !== 'folder') return `未找到父目录 ${parentId}`
      const id = createFolder(parentId, nameValue)
      return id ? `已新增目录 ${id}` : '新增目录失败'
    }
    if (name === 'get_directory') {
      const id = String(args.id || '')
      const directory = nodes.find((item) => item.id === id && item.type === 'folder')
      if (!directory) return `未找到目录 ${id}`
      return json({ id: directory.id, name: directory.name, parentId: directory.parentId, children: (directory.children ?? []).map(({ id: childId, name: childName, type, method, protocol }) => ({ id: childId, name: childName, type, method, protocol })) })
    }
    if (name === 'edit_directory') {
      const id = String(args.id || '')
      const directory = nodes.find((item) => item.id === id && item.type === 'folder')
      if (!directory) return `未找到目录 ${id}`
      const nameValue = String(args.name || '').trim()
      if (!nameValue) return '目录名称不能为空'
      renameNode(id, nameValue)
      return `已修改目录 ${directory.name} 为 ${nameValue}`
    }
    if (name === 'delete_directory') {
      const id = String(args.id || '')
      const directory = nodes.find((item) => item.id === id && item.type === 'folder')
      if (!directory) return `未找到目录 ${id}`
      deleteNode(id)
      return `已删除目录 ${directory.name}`
    }
    if (name === 'list_apis') return json(nodes.filter((n) => n.type === 'api').map(({ id, name, method, protocol, parentId }) => ({ id, name, method, protocol, parentId })))
    if (name === 'get_api_details') {
      const id = String(args.id || '')
      const api = nodes.find((item) => item.id === id && item.type === 'api')
      if (!api) return `未找到接口 ${id}`
      const request = workspace.requests.find((item) => item.id === id)
      return json({
        id: api.id,
        name: api.name,
        parentId: api.parentId,
        protocol: request?.protocol ?? api.protocol,
        method: request?.method ?? api.method,
        description: request?.description,
        url: request?.url ?? '',
        params: request?.params ?? [],
        headers: request?.headers ?? [],
        body: request?.body,
        bodyType: request?.bodyType,
        formFields: request?.formFields,
        updatedAt: request?.updatedAt,
      })
    }
    if (name === 'create_api') {
      const rawHeaders = args.headers && typeof args.headers === 'object' ? args.headers : {}
      const headers = Array.isArray(rawHeaders)
        ? (rawHeaders as Array<{ key?: string; name?: string; value?: string; enabled?: boolean }>).filter((item) => item.key || item.name).map((item, index) => ({ id: `header-${index}`, key: String(item.key || item.name), value: String(item.value ?? ''), enabled: item.enabled !== false }))
        : Object.entries(rawHeaders as Record<string, unknown>).map(([key, value], index) => ({ id: `header-${index}`, key: key.toLowerCase() === 'authorization' ? 'Authorization' : key, value: String(value ?? ''), enabled: true }))
      const id = createApi(String(args.parentId || '') || undefined, { name: String(args.name || '新接口'), protocol: (args.protocol as Protocol) || 'http', method: (args.method as HttpMethod) || 'GET', url: String(args.url || ''), headers, body: args.body === undefined ? undefined : String(args.body) })
      return id ? `已新增接口 ${id}` : '新增接口失败'
    }
    const id = String(args.id || '')
    const node = nodes.find((item) => item.id === id)
    if (!node) return `未找到接口 ${id}`
    if (name === 'delete_api') { deleteNode(id); return `已删除接口 ${node.name}` }
    if (name === 'edit_api') {
      if (args.name) renameNode(id, String(args.name))
      const request = workspace.requests.find((item) => item.id === id)
      if (request && (args.url || args.method || args.body)) updateRequest({ ...request, url: String(args.url || request.url), method: (args.method as HttpMethod) || request.method, body: args.body === undefined ? request.body : String(args.body), updatedAt: new Date().toISOString() })
      return `已更新接口 ${String(args.name || node.name)}`
    }
    return '工具执行完成'
  }

  async function requestModel(modelMessages: ModelMessage[], onText: (text: string, reasoning?: string) => void) {
    const requestBody = { model: modelConfig?.model, temperature: modelConfig?.temperature ?? 0.7, max_tokens: modelConfig?.maxTokens ?? 2048, stream: true, ...buildThinkingParams(modelConfig), messages: limitContext(modelMessages, modelConfig?.maxContextTokens ?? 128000), ...(toolsEnabled ? { tools: toolDefinitions, tool_choice: 'auto' } : {}) }
    const controller = new AbortController(); aiAbortRef.current = controller
    const response = await fetch(`${modelConfig?.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(modelConfig?.apiKey ? { Authorization: `Bearer ${modelConfig.apiKey}` } : {}) }, body: JSON.stringify(requestBody), signal: controller.signal })
    if (!response.ok) throw new Error(`模型请求失败（${response.status}）`)
    if (!response.body) throw new Error('模型未返回流式响应')
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let content = ''; let reasoning = ''; const calls: NonNullable<ModelMessage['tool_calls']> = []
    const consumeLine = (line: string) => { const value = line.trim(); if (!value.startsWith('data:')) return; const data = value.slice(5).trim(); if (!data || data === '[DONE]') return; try { const delta = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: string; reasoning_content?: string; reasoning?: string; reasoning_details?: Array<{ text?: string; content?: string }>; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } }> }).choices?.[0]?.delta; if (!delta) return; const thought = delta.reasoning_content ?? delta.reasoning ?? delta.reasoning_details?.map((item) => item.text ?? item.content ?? '').join('') ?? ''; if (thought) { reasoning += thought; onText('', reasoning) } if (delta.content) { content += delta.content; onText(delta.content, reasoning) } for (const item of delta.tool_calls ?? []) { const call = calls[item.index] ?? { id: item.id ?? crypto.randomUUID(), type: 'function' as const, function: { name: '', arguments: '' } }; call.id = item.id ?? call.id; call.function.name += item.function?.name ?? ''; call.function.arguments += item.function?.arguments ?? ''; calls[item.index] = call } } catch { /* 非完整 JSON 时等待下一次读取 */ } }
    while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }); const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? ''; lines.forEach(consumeLine); if (done) { consumeLine(buffer); break } }
    return { role: 'assistant' as const, content: content || null, ...(calls.length ? { tool_calls: calls } : {}) }
  }

  async function runAgent(userText: string, append: (message: Message) => void) {
    const contextText = toolsEnabled ? `\n当前工作区上下文：${json({ directories: nodes.filter((n) => n.type === 'folder').map(({ id, name, parentId }) => ({ id, name, parentId })), apis: nodes.filter((n) => n.type === 'api').map(({ id, name, method, protocol, parentId }) => ({ id, name, method, protocol, parentId })) })}` : ''
    const modelMessages: ModelMessage[] = [{ role: 'system', content: `你是 API-forge 的接口测试助手。${toolsEnabled ? '你必须通过工具完成工作区操作，工具结果返回后继续推理。需要用户确认的破坏性操作（删除）先询问，不要直接调用。' : '当前为普通问答模式，不要调用工具。'}${contextText}` }, { role: 'user', content: userText }]
    while (true) {
      let streamedText = ''; let streamedReasoning = ''
      const streamingId = crypto.randomUUID()
      const reasoningId = crypto.randomUUID()
      const modelMessage = await requestModel(modelMessages, (chunk, thought) => {
        streamedText += chunk
        streamedReasoning = thought ?? streamedReasoning
        if (streamedReasoning.trim()) append({ id: reasoningId, role: 'reasoning', content: streamedReasoning, reasoningDone: false })
        if (streamedText.trim()) append({ id: streamingId, role: 'assistant', content: streamedText })
      })
      modelMessages.push(modelMessage)
      if (streamedReasoning.trim()) append({ id: reasoningId, role: 'reasoning', content: streamedReasoning, reasoningDone: true })
      const calls = modelMessage.tool_calls ?? []
      if (!calls.length) {
        if (!streamedText.trim() && modelMessage.content?.trim()) append({ id: streamingId, role: 'assistant', content: modelMessage.content })
        return
      }
      for (const call of calls) {
        const toolName = call.function.name as ToolName
        if (!toolLabels[toolName]) { modelMessages.push({ role: 'tool', tool_call_id: call.id, name: toolName, content: '未知工具' }); continue }
        append({ id: crypto.randomUUID(), role: 'tool', tool: toolName, content: `调用 ${toolLabels[toolName]}...` })
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown> } catch { args = {} }
        const result = await runTool(toolName, args)
        append({ id: crypto.randomUUID(), role: 'tool', tool: toolName, content: `Observation：${result}` })
        modelMessages.push({ role: 'tool', tool_call_id: call.id, name: toolName, content: result })
      }
    }
  }

  async function copyMessage(message: Message) {
    await navigator.clipboard?.writeText(message.content)
    setCopiedMessageId(message.id)
    window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? undefined : current), 1500)
  }

  async function submit(textOverride?: string, baseMessages = messages) {
    const text = (textOverride ?? input).trim(); if (!text || busy) return
    if (!activeConversation) return
    shouldFollowRef.current = true
    const editingIndex = editingMessageId ? baseMessages.findIndex((message) => message.id === editingMessageId) : -1
    const userMessage = editingIndex >= 0 ? { ...baseMessages[editingIndex], content: text } : { id: crypto.randomUUID(), role: 'user' as const, content: text }
    let transcript = editingIndex >= 0 ? [...baseMessages.slice(0, editingIndex), userMessage] : [...baseMessages, userMessage]
    setEditingMessageId(undefined); persistMessages(transcript); setInput(''); setBusy(true)
    if (activeConversation.title === '新对话') persist(conversations.map((item) => item.id === activeConversation.id ? { ...item, title: text.slice(0, 32), messages: transcript, updatedAt: new Date().toISOString() } : item))
    const append = (message: Message) => { transcript = transcript.some((item) => item.id === message.id) ? transcript.map((item) => item.id === message.id ? message : item) : [...transcript, message]; persistMessages(transcript) }
    try { await runAgent(text, append) } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) append({ id: crypto.randomUUID(), role: 'assistant', content: `AI 执行失败：${error instanceof Error ? error.message : '未知错误'}` }) }
    aiAbortRef.current = undefined
    setBusy(false)
  }
  function stopAgent() { aiAbortRef.current?.abort() }

  function editMessage(index: number) {
    if (busy) return
    const message = messages[index]
    if (!message || message.role !== 'user') return
    setEditingMessageId(message.id)
    setInput(message.content)
    setHistoryIndex(-1)
  }

  function cancelEdit() { setEditingMessageId(undefined); setInput('') }

  async function copyAllConversations() {
    const transcript = buildConversationExport(conversationsRef.current)
    try {
      await navigator.clipboard?.writeText(transcript)
      setExportFeedback('copied')
      window.setTimeout(() => setExportFeedback(undefined), 1600)
    } catch { setExportFeedback(undefined) }
  }

  function exportAllConversations() {
    const transcript = buildConversationExport(conversationsRef.current)
    const blob = new Blob([transcript], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ai-workspace-${new Date().toISOString().slice(0, 10)}.md`
    anchor.click()
    URL.revokeObjectURL(url)
    setExportFeedback('exported')
    window.setTimeout(() => setExportFeedback(undefined), 1600)
  }

  if (!aiReady) return <div className="flex h-full min-h-0 items-center justify-center bg-[#0b0f14] p-6 text-zinc-500"><div className="max-w-md text-center"><Sparkles className="mx-auto mb-4 h-10 w-10 text-zinc-700" /><h1 className="text-sm font-semibold text-zinc-400">AI 对话暂不可用</h1><p className="mt-2 text-xs leading-6">请先在大模型配置中启用服务，并填写接口地址和模型名称。</p><NavLink to="/settings" className="mt-5 inline-flex h-9 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950"><Settings2 className="h-3.5 w-3.5" />前往配置</NavLink></div></div>

  return <div className="flex h-full min-h-0 bg-[#0b0f14] text-zinc-100">
    <aside className="hidden w-64 shrink-0 border-r border-zinc-800 p-3 md:block"><div className="mb-3 flex items-center gap-2 text-xs font-semibold"><Sparkles className="h-4 w-4 text-cyan-300" />AI 对话</div><button onClick={createConversation} disabled={busy} className="mb-4 h-8 w-full rounded border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">新建对话</button><div className="space-y-1 text-xs text-zinc-500">{conversations.map((conversation) => <div key={conversation.id} onClick={() => setActiveConversationId(conversation.id)} className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-2 ${conversation.id === activeConversation?.id ? 'bg-zinc-800 text-zinc-200' : 'hover:bg-zinc-800'}`}><span className="min-w-0 flex-1 truncate">{conversation.title}</span><button onClick={(event) => { event.stopPropagation(); const next = conversations.filter((item) => item.id !== conversation.id); const fallback = next[0] ?? { id: crypto.randomUUID(), title: '新对话', messages: [], updatedAt: new Date().toISOString() }; persist(next.length ? next : [fallback]); setActiveConversationId(next[0]?.id ?? fallback.id) }} className="hidden text-zinc-500 hover:text-rose-300 group-hover:block" title="删除对话">×</button></div>)}</div></aside>
    <section className="flex min-w-0 flex-1 flex-col"><header className="flex h-14 items-center justify-between border-b border-zinc-800 px-5"><div><h1 className="text-sm font-semibold">AI 工作台</h1><p className="text-[11px] text-zinc-500">基于当前工作区上下文执行操作</p></div><div className="flex items-center gap-2"><button onClick={() => void copyAllConversations()} disabled={!conversations.some((conversation) => conversation.messages.length)} className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40" title="复制所有对话上下文">{exportFeedback === 'copied' ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}{exportFeedback === 'copied' ? '已复制' : '复制全部'}</button><button onClick={exportAllConversations} disabled={!conversations.some((conversation) => conversation.messages.length)} className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40" title="导出所有对话上下文">{exportFeedback === 'exported' ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Download className="h-3.5 w-3.5" />}{exportFeedback === 'exported' ? '已导出' : '导出'}</button></div></header><div ref={messagesContainerRef} onScroll={(event) => { const target = event.currentTarget; shouldFollowRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 48 }} className="min-h-0 flex-1 space-y-4 overflow-auto p-5">{messages.length === 0 && <div className="mx-auto mt-20 max-w-lg text-center text-sm text-zinc-500"><Bot className="mx-auto mb-3 h-9 w-9 text-cyan-300" /><p>告诉我你想做什么，例如“列出订单目录下的接口”或“新增接口 用户登录”。</p></div>}{messages.map((m, index) => <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}><div>{m.role === 'reasoning' ? <div className="ai-reasoning-panel"><button onClick={() => setExpandedToolIds((current) => { const next = new Set(current); if (next.has(m.id)) next.delete(m.id); else next.add(m.id); return next })} className="ai-tool-toggle"><Sparkles className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{m.reasoningDone ? '思考内容' : '思考中'}</span>{expandedToolIds.has(m.id) ? <ChevronDown className="ml-auto h-3.5 w-3.5" /> : <ChevronRight className="ml-auto h-3.5 w-3.5" />}</button>{expandedToolIds.has(m.id) && <div ref={(element) => { reasoningContentRefs.current[m.id] = element }} onScroll={(event) => { const target = event.currentTarget; reasoningFollowRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 24 }} className="ai-tool-detail ai-reasoning-markdown"><MarkdownText value={m.content} /></div>}</div> : m.role === 'tool' ? <div className="ai-tool-panel"><button onClick={() => setExpandedToolIds((current) => { const next = new Set(current); if (next.has(m.id)) next.delete(m.id); else next.add(m.id); return next })} className="ai-tool-toggle"><Wrench className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{m.content.startsWith('Observation') ? '工具结果' : m.content.replace('调用 ', '').replace('...', '')}</span>{expandedToolIds.has(m.id) ? <ChevronDown className="ml-auto h-3.5 w-3.5" /> : <ChevronRight className="ml-auto h-3.5 w-3.5" />}</button>{expandedToolIds.has(m.id) && <pre className="ai-tool-detail">{m.content}</pre>}</div> : <div className={`ai-message ai-message-${m.role}`}>{m.role === 'assistant' ? <MarkdownText value={m.content} /> : m.content}</div>}{m.role !== 'tool' && <div className={`mt-1 flex items-center gap-1 ${m.role === 'user' ? 'justify-end' : ''}`}><button onClick={() => void copyMessage(m)} className="flex h-6 items-center gap-1 rounded px-2 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" title="复制消息">{copiedMessageId === m.id ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}{copiedMessageId === m.id ? '已复制' : '复制'}</button>{m.role === 'user' && <button onClick={() => editMessage(index)} disabled={busy} className="flex h-6 items-center gap-1 rounded px-2 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40" title="编辑并重新提问"><RotateCcw className="h-3 w-3" />重新提问</button>}</div>}</div></div>)}<div ref={messagesEndRef} /></div><div className="border-t border-zinc-800 p-4"><div className="mx-auto max-w-4xl rounded-lg border border-zinc-700 bg-[#111821] p-2">{editingMessageId && <div className="mb-2 flex items-center justify-between px-2 text-[11px] text-amber-300"><span>正在编辑历史消息</span><button onClick={cancelEdit} className="text-zinc-500 hover:text-zinc-300">取消</button></div>}<textarea value={input} onChange={(e) => { setInput(e.target.value); if (!editingMessageId) setHistoryIndex(-1) }} onKeyDown={(e) => { if (e.key === 'ArrowUp' && !e.shiftKey && !editingMessageId && promptHistory.length) { e.preventDefault(); const next = Math.min(historyIndex + 1, promptHistory.length - 1); setHistoryIndex(next); setInput(promptHistory[next]); return } if (e.key === 'ArrowDown' && !e.shiftKey && !editingMessageId && historyIndex >= 0) { e.preventDefault(); const next = historyIndex - 1; setHistoryIndex(next); setInput(next >= 0 ? promptHistory[next] : ''); return } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } }} placeholder="输入指令，AI 将规划并执行工具..." className="min-h-16 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-zinc-600" /><div className="flex items-center justify-between"><button onClick={() => setToolsEnabled((value) => !value)} className={`flex h-8 items-center gap-2 rounded border px-3 text-[11px] ${toolsEnabled ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`} title={toolsEnabled ? '已开启工具调用，消息会携带工作区上下文' : '已关闭工具调用，当前为普通问答'}><Wrench className="h-3.5 w-3.5" />工具 {toolsEnabled ? '已开启' : '已关闭'}</button><div className="flex items-center gap-3"><div className={`context-gauge context-gauge-${contextTone}`} tabIndex={0} role="img" aria-label={`上下文占用 ${contextTokens.toLocaleString()} / ${contextLimit.toLocaleString()} Token，${contextPercent}%`}><div className="context-gauge-ring" style={{ background: `conic-gradient(var(--context-color) ${contextRatio * 360}deg, var(--context-track) 0deg)` }}><span className="context-gauge-center" /></div><div className="context-gauge-tooltip" role="tooltip"><span>上下文用量</span><strong>{contextTokens.toLocaleString()} / {contextLimit.toLocaleString()} Token</strong><span>已使用 {contextPercent}%</span></div></div><button onClick={busy ? stopAgent : () => void submit()} disabled={!busy && !input.trim()} className="flex h-8 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950 disabled:opacity-40">{busy ? <Square className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}{busy ? '停止' : editingMessageId ? '重新提问' : '发送'}</button></div></div></div></div></section>
  </div>
}
