import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Square,
  Wrench,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  type AppInfo,
  getActiveLargeModel,
  getActiveLightModel,
  type AiConversation,
  type AiMessage,
  type ApiTreeNode,
  type HttpFieldItem,
  type HttpMethod,
  type LargeModelConfig,
  type Protocol,
  type RequestDefinition,
} from "@/shared/ipc-contracts";
import {
  getWorkspaceVariables,
  replaceEnvironmentVariables,
  useWorkspaceStore,
} from "@/stores/workspace-store";

type Message = AiMessage;
type Conversation = AiConversation;
type ToolName =
  | "list_directories"
  | "get_directory"
  | "get_directory_details"
  | "create_directory"
  | "edit_directory"
  | "delete_directory"
  | "list_apis"
  | "get_api_details"
  | "create_api"
  | "edit_api"
  | "delete_api"
  | "get_app_version"
  | "get_usage_help"
  | "test_http_api"
  | "test_http_api_load"
  | "test_websocket"
  | "test_socket"
  | "bash_exec"
  | "cmd_exec";
type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

const toolLabels: Record<ToolName, string> = {
  list_directories: "列出所有目录（仅返回目录摘要）",
  get_directory: "查询指定目录（仅返回目录基础信息）",
  get_directory_details: "获取指定目录详情（包含子目录和接口列表）",
  create_directory: "新增目录（在指定父目录下创建）",
  edit_directory: "修改目录名称",
  delete_directory: "删除目录",
  list_apis: "列出所有接口（仅返回接口摘要）",
  get_api_details: "查看接口详情（返回完整请求信息）",
  create_api: "新增接口（创建请求定义）",
  edit_api: "编辑接口（更新名称/地址/方法/内容）",
  delete_api: "删除接口",
  get_app_version: "获取应用版本信息",
  get_usage_help: "获取系统应用使用说明",
  test_http_api: "测试 HTTP 接口（直接发起请求并返回结果）",
  test_http_api_load: "测试 HTTP 接口压测（并发发送并返回核心指标）",
  test_websocket: "测试 WebSocket（连接、发送消息并返回帧日志）",
  test_socket: "测试 Socket（连接 TCP/UDP 并发送报文）",
  bash_exec: "执行 macOS/Linux Bash 脚本（仅限查询类命令；网络命令需用户授权）",
  cmd_exec: "执行 Windows CMD 脚本（仅限查询类命令；网络命令需用户授权）",
};

function getScriptToolName(platform: string | undefined): "bash_exec" | "cmd_exec" | undefined {
  if (!platform) return undefined;
  return platform === "win32" ? "cmd_exec" : "bash_exec";
}

function toolParameters(name: ToolName) {
  switch (name) {
    case "create_directory":
      return {
        type: "object",
        properties: { name: { type: "string" }, parentId: { type: "string" } },
        required: ["name"],
      };
    case "edit_directory":
    case "delete_directory":
    case "get_directory":
    case "get_directory_details":
      return {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      };
    case "create_api":
      return {
        type: "object",
        properties: {
          name: { type: "string" },
          parentId: { type: "string" },
          protocol: { type: "string", enum: ["http", "websocket", "socket"] },
          method: { type: "string" },
          url: { type: "string" },
          headers: { type: "array" },
          body: { type: "string" },
        },
        required: ["name"],
      };
    case "edit_api":
      return {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          url: { type: "string" },
          method: { type: "string" },
          body: { type: "string" },
        },
        required: ["id"],
      };
    case "delete_api":
    case "get_api_details":
    case "test_http_api":
    case "test_http_api_load":
      return {
        type: "object",
        properties: {
          id: { type: "string" },
          concurrency: { type: "number" },
          iterations: { type: "number" },
          timeout: { type: "number" },
        },
        required: ["id"],
      };
    case "test_websocket":
      return {
        type: "object",
        properties: {
          url: { type: "string" },
          message: { type: "string" },
          timeout: { type: "number" },
        },
        required: ["url"],
      };
    case "test_socket":
      return {
        type: "object",
        properties: {
          protocol: { type: "string", enum: ["tcp", "udp"] },
          host: { type: "string" },
          port: { type: "number" },
          data: { type: "string" },
          encoding: { type: "string", enum: ["utf8", "hex"] },
          timeout: { type: "number" },
        },
        required: ["protocol", "host", "port", "data"],
      };
    case "bash_exec":
    case "cmd_exec":
      return {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: { type: "string" },
          timeout: { type: "number" },
        },
        required: ["command"],
      };
    default:
      return { type: "object", properties: {} };
  }
}

function isNetworkCommand(command: string) {
  return /\b(curl|wget|ping|nc|ncat|netcat|ssh|scp|rsync|telnet|ftp|nslookup|dig|host|traceroute|mtr|npm\s+install|npm\s+add|pnpm\s+add|pnpm\s+install|yarn\s+add|yarn\s+install|pip\s+install|pip3\s+install|brew\s+install|apt(-get)?\s+install|yum\s+install|dnf\s+install|choco\s+install|scoop\s+install)\b/i.test(command);
}

function hasNetworkAuthorization(text: string) {
  return /(?:授权|允许|同意|可以|请)?(?:联网|网络查询|网络访问|联网查询)|(?:网络|联网).*(?:授权|允许|同意)/i.test(text);
}

function buildToolDefinitions(names: ToolName[]) {
  return names.map((name) => ({
    type: "function" as const,
    function: {
      name,
      description: toolLabels[name],
      parameters: toolParameters(name),
    },
  }));
}

function buildToolCatalog(names: ToolName[]) {
  return JSON.stringify(
    names.map((name) => ({
      name,
      description: toolLabels[name],
      parameters: toolParameters(name),
    })),
    null,
    2,
  );
}

function flatten(nodes: ApiTreeNode[]): ApiTreeNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(node.children ? flatten(node.children) : []),
  ]);
}
function findTreeNode(
  nodes: ApiTreeNode[],
  nodeId: string,
): ApiTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = node.children
      ? findTreeNode(node.children, nodeId)
      : undefined;
    if (child) return child;
  }
  return undefined;
}
function collectTreePath(
  nodes: ApiTreeNode[],
  nodeId: string,
  parents: string[] = [],
): string[] | undefined {
  for (const node of nodes) {
    const current = [...parents, node.name];
    if (node.id === nodeId) return current;
    const child = node.children
      ? collectTreePath(node.children, nodeId, current)
      : undefined;
    if (child) return child;
  }
  return undefined;
}
function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function buildConversationExport(conversations: Conversation[]) {
  const sections = conversations.map((conversation) => {
    const messages = conversation.messages
      .map((message) => {
        const role =
          message.role === "user"
            ? "用户"
            : message.role === "assistant"
              ? "助手"
              : message.role === "reasoning"
                ? "思考"
                : "工具" + (message.tool ? `（${message.tool}）` : "");
        return "### " + role + "\n\n" + (message.content || "（无内容）");
      })
      .join("\n\n");
    return (
      "## " +
      (conversation.title || "新对话") +
      "\n\n" +
      (messages || "（暂无消息）")
    );
  });
  return "# AI 工作台对话记录\n\n" + sections.join("\n\n---\n\n");
}

function removeDuplicateEmptyConversations(
  conversations: Conversation[],
): Conversation[] {
  const firstEmptyId = conversations.find(
    (conversation) => conversation.messages.length === 0,
  )?.id;
  return conversations.filter(
    (conversation) =>
      conversation.messages.length > 0 || conversation.id === firstEmptyId,
  );
}

function readLegacyConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem("ai-chat-conversations");
    if (stored) {
      const conversations = removeDuplicateEmptyConversations(
        JSON.parse(stored) as Conversation[],
      );
      if (conversations.length > 0) return conversations;
    }
    const messages = JSON.parse(
      localStorage.getItem("ai-chat-messages") ?? "[]",
    ) as Message[];
    return [
      {
        id: crypto.randomUUID(),
        title:
          messages
            .find((item) => item.role === "user")
            ?.content?.slice(0, 32) || "新对话",
        messages,
        updatedAt: new Date().toISOString(),
      },
    ];
  } catch {
    return [
      {
        id: crypto.randomUUID(),
        title: "新对话",
        messages: [],
        updatedAt: new Date().toISOString(),
      },
    ];
  }
}

function normalizeConversationTitle(value: string, fallback: string) {
  const normalized = value
    .trim()
    .replace(/^标题\s*[:：]\s*/i, "")
    .replace(/^["'“”‘’《》]+|["'“”‘’《》]+$/g, "")
    .split(/\r?\n/, 1)[0]
    .replace(/[。.!！?？]+$/, "")
    .trim();
  return (normalized || fallback.replace(/\s+/g, " ").trim() || "新对话").slice(
    0,
    32,
  );
}

function limitContext(
  messages: ModelMessage[],
  maxTokens: number,
): ModelMessage[] {
  const limit = Math.max(1, maxTokens);
  const system = messages[0];
  const result: ModelMessage[] = system?.role === "system" ? [system] : [];
  let used = Math.ceil((system?.content?.length ?? 0) / 4);
  for (let index = messages.length - 1; index >= (system ? 1 : 0); index -= 1) {
    const message = messages[index];
    const cost = Math.ceil((message.content?.length ?? 0) / 4);
    if (result.length > 1 && used + cost > limit) break;
    result.splice(system ? 1 : 0, 0, message);
    used += cost;
  }
  return result;
}

function buildThinkingParams(config: LargeModelConfig | undefined) {
  const enabled = config?.thinkingEnabled === true;
  // Qwen/vLLM 等 OpenAI 兼容服务分别读取这两个位置，显式传 false 也能关闭服务端默认思考。
  return {
    enable_thinking: enabled,
    chat_template_kwargs: { enable_thinking: enabled },
  };
}

function extractReasoning(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractReasoning).join("");
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return extractReasoning(
      item.text ??
        item.content ??
        item.reasoning ??
        item.reasoning_content ??
        item.thinking ??
        item.analysis,
    );
  }
  return "";
}

function formatToolCallMessage(
  toolName: ToolName,
  args: Record<string, unknown>,
) {
  const payload = Object.keys(args).length > 0 ? json(args) : "（无参数）";
  return `调用工具：${toolLabels[toolName]}\n工具标识：${toolName}\n参数：\n${payload}`;
}

function resolveFields(
  fields: HttpFieldItem[],
  variables: Record<string, string>,
) {
  return fields
    .filter((item) => item.enabled && item.key.trim())
    .map((item) => ({
      key: replaceEnvironmentVariables(item.key, variables),
      value: replaceEnvironmentVariables(item.value, variables),
    }));
}

function collectSubtreeNodes(
  nodes: ApiTreeNode[],
  nodeId: string,
): ApiTreeNode[] {
  const node = findTreeNode(nodes, nodeId);
  if (!node) return [];
  return [node, ...(node.children ? flatten(node.children) : [])];
}

function extractRequestSummary(request: RequestDefinition | undefined) {
  if (!request) return undefined;
  return {
    id: request.id,
    protocol: request.protocol,
    name: request.name,
    description: request.description,
    method: request.method,
    url: request.url,
    params: request.params,
    headers: request.headers,
    body: request.body,
    bodyType: request.bodyType,
    formFields: request.formFields,
    updatedAt: request.updatedAt,
  };
}

function buildRequestBody(
  request: RequestDefinition,
  variables: Record<string, string>,
) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  if (request.bodyType === "form-urlencoded") {
    return new URLSearchParams(
      (request.formFields ?? [])
        .filter(
          (item) => item.enabled && item.kind === "text" && item.key.trim(),
        )
        .map((item) => [
          replaceEnvironmentVariables(item.key, variables),
          replaceEnvironmentVariables(item.value, variables),
        ]),
    ).toString();
  }
  return request.body
    ? replaceEnvironmentVariables(request.body, variables)
    : undefined;
}

function buildRequestHeaders(
  request: RequestDefinition,
  variables: Record<string, string>,
) {
  return Object.fromEntries(
    resolveFields(request.headers ?? [], variables).map((item) => [
      item.key,
      item.value,
    ]),
  );
}

function buildRequestUrl(
  request: RequestDefinition,
  variables: Record<string, string>,
) {
  const resolvedUrl = replaceEnvironmentVariables(request.url, variables);
  const nextUrl = new URL(resolvedUrl, "http://localhost");
  resolveFields(request.params ?? [], variables).forEach((item) =>
    nextUrl.searchParams.set(item.key, item.value),
  );
  return nextUrl.toString().replace("http://localhost", "");
}

function MarkdownText({ value }: { value: string }) {
  // 模型常以换行开始，清理首行空白，保留正文和代码块中的换行。
  const normalized = value.replace(/^\s+/, "").replace(/\n{2,}/g, "\n");
  const escaped = normalized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const tableRows = escaped.split("\n");
  const tableHtml: string[] = [];
  for (let index = 0; index < tableRows.length; index += 1) {
    const separator = tableRows[index]
      .trim()
      .match(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/);
    if (!separator || index === 0 || !tableRows[index - 1].includes("|"))
      continue;
    const body: string[] = [];
    let rowIndex = index + 1;
    while (
      rowIndex < tableRows.length &&
      tableRows[rowIndex].includes("|") &&
      tableRows[rowIndex].trim()
    ) {
      body.push(tableRows[rowIndex]);
      rowIndex += 1;
    }
    const cells = (row: string) =>
      row
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
    const renderRow = (row: string, tag: "th" | "td") =>
      `<tr>${cells(row)
        .map(
          (cell) =>
            `<${tag} class="border border-zinc-700 px-3 py-1.5 text-left">${cell}</${tag}>`,
        )
        .join("")}</tr>`;
    tableHtml.push(
      `<table class="my-2 w-full border-collapse text-xs"><thead>${renderRow(tableRows[index - 1], "th")}</thead><tbody>${body.map((row) => renderRow(row, "td")).join("")}</tbody></table>`,
    );
    tableRows.splice(
      index - 1,
      body.length + 2,
      `@@API_FORGE_TABLE_${tableHtml.length - 1}@@`,
    );
    index -= 1;
  }
  const html = tableRows
    .join("\n")
    .replace(
      /```([\s\S]*?)```/g,
      '<pre class="my-2 overflow-auto rounded bg-black/30 p-2 font-mono text-[11px]"><code>$1</code></pre>',
    )
    .replace(
      /^### (.*)$/gm,
      '<h3 class="mt-2 font-semibold text-zinc-200">$1</h3>',
    )
    .replace(
      /^## (.*)$/gm,
      '<h2 class="mt-2 font-semibold text-zinc-100">$1</h2>',
    )
    .replace(
      /^# (.*)$/gm,
      '<h1 class="mt-2 text-sm font-semibold text-zinc-100">$1</h1>',
    )
    .replace(
      /^[-*] (.*)$/gm,
      '<li class="my-0 ml-4 list-disc leading-5">$1</li>',
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-black/20 px-1 font-mono text-cyan-200">$1</code>',
    )
    .replace(/\n/g, "<br />")
    .replace(/(<li class="[^"]*">[\s\S]*?<\/li>)<br \/>/g, "$1")
    .replace(
      /@@API_FORGE_TABLE_(\d+)@@/g,
      (_, tableIndex) => tableHtml[Number(tableIndex)],
    );
  return (
    <div
      className="markdown-content ai-markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function AIAssistantPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const modelConfig = getActiveLargeModel(workspace?.preferences);
  const lightModelConfig = getActiveLightModel(workspace?.preferences);
  const aiReady = Boolean(
    modelConfig?.baseUrl.trim() && modelConfig.model.trim(),
  );
  const activeEnvironmentId = workspace?.preferences.activeEnvironmentId ?? "";
  const createApi = useWorkspaceStore((s) => s.createApi);
  const updateRequest = useWorkspaceStore((s) => s.updateRequest);
  const renameNode = useWorkspaceStore((s) => s.renameNode);
  const deleteNode = useWorkspaceStore((s) => s.deleteNode);
  const createFolder = useWorkspaceStore((s) => s.createFolder);
  const [conversations, setConversations] = useState<Conversation[]>(
    readLegacyConversations,
  );
  const [activeConversationId, setActiveConversationId] = useState(
    () => conversations[0]?.id ?? "",
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationsRef = useRef(conversations);
  const aiRequestIdRef = useRef<string>();
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [appInfo, setAppInfo] = useState<AppInfo>();
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  const [exportFeedback, setExportFeedback] = useState<"copied" | "exported">();
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [editingMessageId, setEditingMessageId] = useState<string>();
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(
    new Set(),
  );
  const isComposingRef = useRef(false);
  const reasoningFollowRef = useRef(true);
  const reasoningContentRefs = useRef<Record<string, HTMLDivElement | null>>(
    {},
  );
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  useEffect(() => {
    const desktopApi = window.desktopApi;
    if (!desktopApi) return;
    let canceled = false;
    void desktopApi
      .loadConversations()
      .then(async (stored) => {
        const next =
          stored.length > 0
            ? removeDuplicateEmptyConversations(stored)
            : conversationsRef.current;
        if (canceled) return;
        conversationsRef.current = next;
        setConversations(next);
        setActiveConversationId((current) =>
          next.some((item) => item.id === current)
            ? current
            : (next[0]?.id ?? ""),
        );
        if (stored.length === 0) await desktopApi.saveConversations(next);
        localStorage.removeItem("ai-chat-conversations");
        localStorage.removeItem("ai-chat-messages");
      })
      .catch((error) => console.error("加载 AI 对话失败:", error));
    void desktopApi
      .getAppInfo()
      .then((info) => setAppInfo(info))
      .catch((error) => console.error("加载应用信息失败:", error));
    return () => {
      canceled = true;
    };
  }, []);

  const nodes = useMemo(
    () => flatten(workspace?.apiTree ?? []),
    [workspace?.apiTree],
  );
  const variables = useMemo(
    () => getWorkspaceVariables(workspace, activeEnvironmentId),
    [workspace, activeEnvironmentId],
  );
  const activeConversation =
    conversations.find((item) => item.id === activeConversationId) ??
    conversations[0];
  const messages = activeConversation?.messages ?? [];
  const promptHistory = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .reverse();
  const contextLimit = Math.max(1, modelConfig?.maxContextTokens ?? 128000);
  const contextTokens =
    Math.ceil(
      messages.reduce((total, message) => total + message.content.length, 0) /
        4,
    ) + Math.ceil(input.length / 4);
  const contextRatio = Math.min(1, contextTokens / contextLimit);
  const contextPercent = Math.round(contextRatio * 100);
  const contextTone =
    contextRatio >= 0.9
      ? "danger"
      : contextRatio >= 0.75
        ? "warning"
        : "normal";
  useEffect(() => {
    if (shouldFollowRef.current)
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
  }, [
    activeConversationId,
    messages.length,
    messages[messages.length - 1]?.content,
  ]);
  useEffect(() => {
    const reasoning = messages.find(
      (message) => message.role === "reasoning" && !message.reasoningDone,
    );
    const element = reasoning
      ? reasoningContentRefs.current[reasoning.id]
      : undefined;
    if (element && reasoningFollowRef.current)
      element.scrollTop = element.scrollHeight;
  }, [messages.find((message) => message.role === "reasoning")?.content]);
  function persist(next: Conversation[]) {
    conversationsRef.current = next;
    setConversations(next);
    if (window.desktopApi)
      void window.desktopApi
        .saveConversations(next)
        .catch((error) => console.error("保存 AI 对话失败:", error));
    else localStorage.setItem("ai-chat-conversations", JSON.stringify(next));
  }
  function persistMessages(nextMessages: Message[]) {
    if (!activeConversation) return;
    setConversations((current) => {
      const next = current.map((item) =>
        item.id === activeConversation.id
          ? {
              ...item,
              messages: nextMessages,
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
      conversationsRef.current = next;
      if (window.desktopApi)
        void window.desktopApi
          .saveConversations(next)
          .catch((error) => console.error("保存 AI 对话失败:", error));
      else localStorage.setItem("ai-chat-conversations", JSON.stringify(next));
      return next;
    });
  }
  function renameConversationTitle(conversationId: string, title: string) {
    setConversations((current) => {
      const next = current.map((item) =>
        item.id === conversationId
          ? { ...item, title, updatedAt: new Date().toISOString() }
          : item,
      );
      conversationsRef.current = next;
      if (window.desktopApi)
        void window.desktopApi
          .saveConversations(next)
          .catch((error) => console.error("保存 AI 对话失败:", error));
      else localStorage.setItem("ai-chat-conversations", JSON.stringify(next));
      return next;
    });
  }

  function createConversation() {
    if (busy) return;
    const current = conversationsRef.current;
    const emptyConversation = current.find(
      (conversation) => conversation.messages.length === 0,
    );
    if (emptyConversation) {
      setActiveConversationId(emptyConversation.id);
    } else {
      const conversation = {
        id: crypto.randomUUID(),
        title: "新对话",
        messages: [],
        updatedAt: new Date().toISOString(),
      };
      persist([conversation, ...current]);
      setActiveConversationId(conversation.id);
    }
    setInput("");
    setEditingMessageId(undefined);
    setHistoryIndex(-1);
  }

  async function runTool(
    name: ToolName,
    args: Record<string, unknown>,
    options?: { networkAuthorized?: boolean },
  ) {
    if (name === "get_app_version") {
      const info = await window.desktopApi?.getAppInfo();
      return info
        ? json({
            name: info.name,
            version: info.version,
            platform: info.platform,
          })
        : "应用信息不可用";
    }
    if (name === "get_usage_help")
      return `API-forge 系统应用使用说明：
- HTTP 调试：在 API 目录中打开或新建接口，填写 URL、Params、Headers、Body 后发送请求。
- 环境变量：在环境管理中维护变量，使用 {{变量名}} 插入 URL、请求头和请求体。
- WebSocket：打开 WebSocket 接口后连接、发送消息并查看帧日志。
- TCP/UDP：在 Socket 页面填写主机和端口，连接后发送文本或 Hex 报文。
- 请求历史：底部或历史页面可查看请求结果，并恢复请求配置。
- AI 工具：可查询、新增、修改和删除目录，也可列出、查看详情、创建或编辑接口；删除操作必须先征得用户确认。
- AI 工具：HTTP 接口支持单次测试和并发压测，压测会返回总请求数、成功数、失败数、平均耗时、P95 和最大耗时。
- 应用更新：系统设置中检查、下载并安装新版本。`;
    if (!workspace) return "工作区尚未加载";
    if (name === "list_directories")
      return json(
        nodes
          .filter((n) => n.type === "folder")
          .map(({ id, name, parentId, children }) => ({
            id,
            name,
            parentId,
            childCount: children?.length ?? 0,
          })),
      );
    if (name === "get_directory_details") {
      const id = String(args.id || "");
      const directory = findTreeNode(workspace.apiTree, id);
      if (!directory || directory.type !== "folder") return `未找到目录 ${id}`;
      const subtree = collectSubtreeNodes(workspace.apiTree, id);
      const folderIds = subtree
        .filter((item) => item.type === "folder")
        .map(({ id: folderId, name, parentId }) => ({
          id: folderId,
          name,
          parentId,
        }));
      const apiIds = subtree
        .filter((item) => item.type === "api")
        .map(({ id: apiId, name, parentId, method, protocol }) => {
          const request = workspace.requests.find((item) => item.id === apiId);
          return {
            id: apiId,
            name,
            parentId,
            method,
            protocol,
            request: extractRequestSummary(request),
          };
        });
      return json({
        folder: {
          id: directory.id,
          name: directory.name,
          parentId: directory.parentId,
        },
        path: collectTreePath(workspace.apiTree, id)?.join(" / "),
        folders: folderIds,
        apis: apiIds,
      });
    }
    if (name === "create_directory") {
      const nameValue = String(args.name || "").trim();
      if (!nameValue) return "目录名称不能为空";
      const parentId = String(args.parentId || "") || undefined;
      const parent = parentId
        ? nodes.find((item) => item.id === parentId)
        : undefined;
      if (parentId && parent?.type !== "folder")
        return `未找到父目录 ${parentId}`;
      const id = createFolder(parentId, nameValue);
      return id ? `已新增目录 ${id}` : "新增目录失败";
    }
    if (name === "get_directory") {
      const id = String(args.id || "");
      const directory = nodes.find(
        (item) => item.id === id && item.type === "folder",
      );
      if (!directory) return `未找到目录 ${id}`;
      return json({
        id: directory.id,
        name: directory.name,
        parentId: directory.parentId,
        children: (directory.children ?? []).map(
          ({ id: childId, name: childName, type, method, protocol }) => ({
            id: childId,
            name: childName,
            type,
            method,
            protocol,
          }),
        ),
      });
    }
    if (name === "edit_directory") {
      const id = String(args.id || "");
      const directory = nodes.find(
        (item) => item.id === id && item.type === "folder",
      );
      if (!directory) return `未找到目录 ${id}`;
      const nameValue = String(args.name || "").trim();
      if (!nameValue) return "目录名称不能为空";
      renameNode(id, nameValue);
      return `已修改目录 ${directory.name} 为 ${nameValue}`;
    }
    if (name === "delete_directory") {
      const id = String(args.id || "");
      const directory = nodes.find(
        (item) => item.id === id && item.type === "folder",
      );
      if (!directory) return `未找到目录 ${id}`;
      deleteNode(id);
      return `已删除目录 ${directory.name}`;
    }
    if (name === "list_apis")
      return json(
        nodes
          .filter((n) => n.type === "api")
          .map(({ id, name, method, protocol, parentId }) => ({
            id,
            name,
            method,
            protocol,
            parentId,
          })),
      );
    if (name === "get_api_details") {
      const id = String(args.id || "");
      const api = nodes.find((item) => item.id === id && item.type === "api");
      if (!api) return `未找到接口 ${id}`;
      const request = workspace.requests.find((item) => item.id === id);
      return json(
        extractRequestSummary(request) ?? {
          id: api.id,
          name: api.name,
          parentId: api.parentId,
          protocol: api.protocol,
          method: api.method,
        },
      );
    }
    if (name === "create_api") {
      const rawHeaders =
        args.headers && typeof args.headers === "object" ? args.headers : {};
      const headers = Array.isArray(rawHeaders)
        ? (
            rawHeaders as Array<{
              key?: string;
              name?: string;
              value?: string;
              enabled?: boolean;
            }>
          )
            .filter((item) => item.key || item.name)
            .map((item, index) => ({
              id: `header-${index}`,
              key: String(item.key || item.name),
              value: String(item.value ?? ""),
              enabled: item.enabled !== false,
            }))
        : Object.entries(rawHeaders as Record<string, unknown>).map(
            ([key, value], index) => ({
              id: `header-${index}`,
              key:
                key.toLowerCase() === "authorization" ? "Authorization" : key,
              value: String(value ?? ""),
              enabled: true,
            }),
          );
      const id = createApi(String(args.parentId || "") || undefined, {
        name: String(args.name || "新接口"),
        protocol: (args.protocol as Protocol) || "http",
        method: (args.method as HttpMethod) || "GET",
        url: String(args.url || ""),
        headers,
        body: args.body === undefined ? undefined : String(args.body),
      });
      return id ? `已新增接口 ${id}` : "新增接口失败";
    }
    const id = String(args.id || "");
    const node = nodes.find((item) => item.id === id);
    if (!node) return `未找到接口 ${id}`;
    if (name === "delete_api") {
      deleteNode(id);
      return `已删除接口 ${node.name}`;
    }
    if (name === "edit_api") {
      if (args.name) renameNode(id, String(args.name));
      const request = workspace.requests.find((item) => item.id === id);
      if (request && (args.url || args.method || args.body))
        updateRequest({
          ...request,
          url: String(args.url || request.url),
          method: (args.method as HttpMethod) || request.method,
          body: args.body === undefined ? request.body : String(args.body),
          updatedAt: new Date().toISOString(),
        });
      return `已更新接口 ${String(args.name || node.name)}`;
    }
    if (name === "test_http_api") {
      const id = String(args.id || "");
      const request = workspace.requests.find((item) => item.id === id);
      if (!request) return `未找到接口 ${id}`;
      if (!window.desktopApi?.httpSend) return "当前环境不支持 HTTP 测试";
      const requestBody = buildRequestBody(request, variables);
      const response = await window.desktopApi.httpSend({
        requestId: `ai-test-http-${crypto.randomUUID()}`,
        method: request.method ?? "GET",
        url: buildRequestUrl(request, variables),
        params: resolveFields(request.params ?? [], variables).map((item) => ({
          ...item,
          enabled: true,
        })),
        headers: buildRequestHeaders(request, variables),
        body: requestBody,
        timeout: 30000,
        followRedirects: true,
        validateCertificates: true,
      });
      return json({
        request: extractRequestSummary(request),
        response,
      });
    }
    if (name === "test_http_api_load") {
      const id = String(args.id || "");
      const request = workspace.requests.find((item) => item.id === id);
      if (!request) return `未找到接口 ${id}`;
      if (!window.desktopApi?.httpSend) return "当前环境不支持 HTTP 压测";
      const concurrency = Math.max(1, Number(args.concurrency) || 3);
      const iterations = Math.max(1, Number(args.iterations) || 12);
      const timeout = Math.max(1000, Number(args.timeout) || 30000);
      const requestBody = buildRequestBody(request, variables);
      const requestPayload = {
        method: request.method ?? "GET",
        url: buildRequestUrl(request, variables),
        params: resolveFields(request.params ?? [], variables).map((item) => ({
          ...item,
          enabled: true,
        })),
        headers: buildRequestHeaders(request, variables),
        body: requestBody,
        timeout,
        followRedirects: true,
        validateCertificates: true,
      };
      const durations: number[] = [];
      let success = 0;
      let failure = 0;
      let cursor = 0;
      const workers = Array.from(
        { length: Math.max(1, concurrency) },
        async () => {
          while (cursor < iterations) {
            const current = cursor;
            cursor += 1;
            if (current >= iterations) break;
            const response = await window.desktopApi.httpSend({
              requestId: `ai-test-http-load-${crypto.randomUUID()}`,
              ...requestPayload,
            });
            if (response.ok) {
              success += 1;
              durations.push(response.durationMs);
            } else {
              failure += 1;
            }
          }
        },
      );
      await Promise.all(workers);
      const sorted = [...durations].sort((a, b) => a - b);
      const avg = durations.length
        ? Math.round(
            durations.reduce((sum, value) => sum + value, 0) /
              durations.length,
          )
        : 0;
      const p95 = sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
        : 0;
      const max = sorted.length ? sorted[sorted.length - 1] : 0;
      return json({
        request: extractRequestSummary(request),
        summary: {
          total: iterations,
          success,
          failure,
          avg,
          p95,
          max,
        },
        concurrency,
        timeout,
      });
    }
    if (name === "test_websocket") {
      const url = replaceEnvironmentVariables(
        String(args.url || ""),
        variables,
      ).trim();
      if (!url) return "WebSocket 地址不能为空";
      const message = String(args.message ?? "");
      const timeout = Math.max(1000, Number(args.timeout) || 5000);
      return await new Promise<string>((resolve) => {
        const frames: Array<{ type: string; body: string; time: string }> = [];
        const now = () =>
          new Date().toLocaleTimeString("zh-CN", { hour12: false });
        let finished = false;
        const finish = (value: string) => {
          if (!finished) {
            finished = true;
            resolve(value);
          }
        };
        try {
          const socket = new WebSocket(url);
          const timer = window.setTimeout(() => {
            socket.close();
            finish(json({ ok: false, error: "连接超时", frames }));
          }, timeout);
          socket.onopen = () => {
            frames.push({ type: "open", body: "连接已建立", time: now() });
            if (message) socket.send(message);
            if (!message)
              window.setTimeout(() => {
                socket.close();
              }, 200);
          };
          socket.onmessage = (event) =>
            frames.push({
              type: "message",
              body: String(event.data),
              time: now(),
            });
          socket.onerror = () =>
            frames.push({ type: "error", body: "连接发生错误", time: now() });
          socket.onclose = () => {
            window.clearTimeout(timer);
            finish(json({ ok: true, url, message, frames }));
          };
        } catch (error) {
          finish(
            json({
              ok: false,
              error:
                error instanceof Error ? error.message : "WebSocket 测试失败",
            }),
          );
        }
      });
    }
    if (name === "test_socket") {
      if (
        !window.desktopApi?.socketConnect ||
        !window.desktopApi?.socketSend ||
        !window.desktopApi?.socketClose
      )
        return "当前环境不支持 Socket 测试";
      const protocol = String(args.protocol || "tcp") as "tcp" | "udp";
      const host = replaceEnvironmentVariables(
        String(args.host || ""),
        variables,
      ).trim();
      const port = Number(args.port || 0);
      const data = replaceEnvironmentVariables(
        String(args.data || ""),
        variables,
      );
      const encoding = String(args.encoding || "utf8") as "utf8" | "hex";
      const timeout = Math.max(1000, Number(args.timeout) || 5000);
      const connectionId = `ai-socket-${crypto.randomUUID()}`;
      const connected = await window.desktopApi.socketConnect({
        connectionId,
        protocol,
        host,
        port,
        timeout,
      });
      if ("error" in connected)
        return json({ ok: false, error: connected.error });
      const sent = await window.desktopApi.socketSend({
        connectionId,
        data,
        encoding,
        host,
        port,
      });
      await window.desktopApi.socketClose(connectionId);
      return json({ ok: sent.ok, protocol, host, port, data, encoding });
    }
    if (name === "bash_exec" || name === "cmd_exec") {
      if (!window.desktopApi?.bashExec) return "当前环境不支持脚本执行";
      const currentPlatform = appInfo?.platform ?? "";
      if (name === "bash_exec" && currentPlatform === "win32")
        return "当前系统不是 macOS/Linux，不能执行 Bash 工具";
      if (name === "cmd_exec" && currentPlatform !== "win32")
        return "当前系统不是 Windows，不能执行 CMD 工具";
      const command = String(args.command || "").trim();
      if (!command) return "命令不能为空";
      if (isNetworkCommand(command) && !options?.networkAuthorized) {
        return "该命令包含网络访问行为，必须先在对话中明确获得用户授权后再执行";
      }
      const result = await window.desktopApi.bashExec({
        command,
        cwd: String(args.cwd || "").trim() || undefined,
        timeout: Number(args.timeout || 30000),
      });
      return json(result);
    }
    return "工具执行完成";
  }

  async function requestModel(
    modelMessages: ModelMessage[],
    onText: (text: string, reasoning?: string) => void,
    toolDefinitions?: ReturnType<typeof buildToolDefinitions>,
  ) {
    if (!window.desktopApi?.httpSend)
      throw new Error("AI 对话需要在 Electron 桌面端运行");
    const activeToolDefinitions = toolDefinitions ?? toolDefinitionsFallback;
    const requestBody = {
      model: modelConfig?.model,
      temperature: modelConfig?.temperature ?? 0.7,
      max_tokens: modelConfig?.maxTokens ?? 2048,
      stream: true,
      ...buildThinkingParams(modelConfig),
      messages: limitContext(
        modelMessages,
        modelConfig?.maxContextTokens ?? 128000,
      ),
      ...(toolsEnabled
        ? { tools: activeToolDefinitions, tool_choice: "auto" }
        : {}),
    };
    const requestId = crypto.randomUUID();
    aiRequestIdRef.current = requestId;
    let buffer = "";
    let content = "";
    let reasoning = "";
    const calls: NonNullable<ModelMessage["tool_calls"]> = [];
    const consumeLine = (line: string) => {
      const value = line.trim();
      if (!value.startsWith("data:")) return;
      const data = value.slice(5).trim();
      if (!data || data === "[DONE]") return;
      try {
        const delta = (
          JSON.parse(data) as {
            choices?: Array<{
              delta?: Record<string, unknown> & {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          }
        ).choices?.[0]?.delta;
        if (!delta) return;
        const thought = extractReasoning(
          delta.reasoning_content ??
            delta.reasoning ??
            delta.thinking ??
            delta.analysis ??
            delta.reasoning_details,
        );
        if (thought) {
          reasoning += thought;
          onText("", reasoning);
        }
        if (typeof delta.content === "string") {
          content += delta.content;
          onText(delta.content, reasoning);
        }
        for (const item of delta.tool_calls ?? []) {
          const call = calls[item.index] ?? {
            id: item.id ?? crypto.randomUUID(),
            type: "function" as const,
            function: { name: "", arguments: "" },
          };
          call.id = item.id ?? call.id;
          call.function.name += item.function?.name ?? "";
          call.function.arguments += item.function?.arguments ?? "";
          calls[item.index] = call;
        }
      } catch {
        /* 非完整 JSON 时等待下一次读取 */
      }
    };
    const consumeChunk = (chunk: string, done = false) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(consumeLine);
      if (done && buffer) {
        consumeLine(buffer);
        buffer = "";
      }
    };
    const unsubscribe = window.desktopApi.onHttpChunk?.((payload) => {
      if (payload.requestId === requestId)
        consumeChunk(payload.chunk, payload.done);
    });
    try {
      const response = await window.desktopApi.httpSend({
        requestId,
        method: "POST",
        url: `${modelConfig?.baseUrl.replace(/\/$/, "")}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(modelConfig?.apiKey
            ? { Authorization: `Bearer ${modelConfig.apiKey}` }
            : {}),
        },
        body: JSON.stringify(requestBody),
        timeout: 120000,
      });
      consumeChunk("", true);
      if (response.ok === false) {
        if (response.error.code === "CANCELED") {
          const error = new Error(response.error.message);
          error.name = "AbortError";
          throw error;
        }
        throw new Error(`模型请求失败：${response.error.message}`);
      }
      if (response.status < 200 || response.status >= 300) {
        let detail = response.body.trim();
        try {
          detail =
            (
              JSON.parse(response.body) as {
                error?: { message?: string };
                message?: string;
              }
            ).error?.message ??
            (JSON.parse(response.body) as { message?: string }).message ??
            detail;
        } catch {
          /* 非 JSON 错误保留原始响应 */
        }
        throw new Error(
          `模型请求失败（${response.status}）${detail ? `：${detail.slice(0, 300)}` : ""}`,
        );
      }
      if (!content && !reasoning && !calls.length) {
        try {
          const message = (
            JSON.parse(response.body) as {
              choices?: Array<{
                message?: Record<string, unknown> & {
                  content?: string | null;
                  tool_calls?: NonNullable<ModelMessage["tool_calls"]>;
                };
              }>;
            }
          ).choices?.[0]?.message;
          content = typeof message?.content === "string" ? message.content : "";
          reasoning = extractReasoning(
            message?.reasoning_content ??
              message?.reasoning ??
              message?.thinking ??
              message?.analysis ??
              message?.reasoning_details,
          );
          if (reasoning) onText("", reasoning);
          if (content) onText(content, reasoning);
          if (message?.tool_calls) calls.push(...message.tool_calls);
        } catch {
          const contentType = response.headers["content-type"] ?? "";
          throw new Error(
            contentType.includes("text/html")
              ? "接口返回了网页内容，请确认接口地址包含正确的 API 路径（通常以 /v1 结尾）"
              : "模型返回内容无法解析",
          );
        }
      }
      return {
        role: "assistant" as const,
        content: content || null,
        ...(calls.length ? { tool_calls: calls } : {}),
      };
    } finally {
      unsubscribe?.();
      if (aiRequestIdRef.current === requestId)
        aiRequestIdRef.current = undefined;
    }
  }

  const toolDefinitionsFallback = buildToolDefinitions([
    "list_directories",
    "get_directory",
    "get_directory_details",
    "create_directory",
    "edit_directory",
    "delete_directory",
    "list_apis",
    "get_api_details",
    "create_api",
    "edit_api",
    "delete_api",
    "get_app_version",
    "get_usage_help",
    "test_http_api",
    "test_http_api_load",
    "test_websocket",
    "test_socket",
  ]);

  async function generateConversationTitle(userText: string) {
    const fallback = normalizeConversationTitle("", userText);
    if (
      !lightModelConfig?.baseUrl.trim() ||
      !lightModelConfig.model.trim() ||
      !window.desktopApi?.httpSend
    )
      return fallback;
    try {
      const response = await window.desktopApi.httpSend({
        method: "POST",
        url: `${lightModelConfig.baseUrl.replace(/\/$/, "")}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          ...(lightModelConfig.apiKey
            ? { Authorization: `Bearer ${lightModelConfig.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: lightModelConfig.model,
          temperature: lightModelConfig.temperature,
          max_tokens: Math.min(64, Math.max(16, lightModelConfig.maxTokens)),
          stream: false,
          messages: [
            {
              role: "system",
              content:
                "根据用户问题生成简洁准确的中文会话标题，不超过20个汉字。只输出标题，不加引号、标点或解释。",
            },
            { role: "user", content: userText },
          ],
        }),
        timeout: 30000,
      });
      if (
        response.ok === false ||
        response.status < 200 ||
        response.status >= 300
      )
        return fallback;
      const content =
        (
          JSON.parse(response.body) as {
            choices?: Array<{ message?: { content?: string } }>;
          }
        ).choices?.[0]?.message?.content ?? "";
      return normalizeConversationTitle(content, fallback);
    } catch {
      return fallback;
    }
  }

  async function runAgent(
    userText: string,
    append: (message: Message) => void,
  ) {
    const networkAuthorized = hasNetworkAuthorization(userText);
    const scriptToolName = getScriptToolName(appInfo?.platform);
    const activeToolNames = [
      "list_directories",
      "get_directory",
      "get_directory_details",
      "create_directory",
      "edit_directory",
      "delete_directory",
      "list_apis",
      "get_api_details",
      "create_api",
      "edit_api",
      "delete_api",
      "get_app_version",
      "get_usage_help",
      "test_http_api",
      "test_http_api_load",
      "test_websocket",
      "test_socket",
      ...(scriptToolName ? [scriptToolName] : []),
    ] as ToolName[];
    const toolDefinitions = toolsEnabled
      ? buildToolDefinitions(activeToolNames)
      : [];
    const runtimeContext = appInfo
      ? {
          应用信息: {
            名称: appInfo.name,
            版本: appInfo.version,
            平台: appInfo.platform,
            架构: appInfo.arch,
            系统类型: appInfo.osType,
            系统版本: appInfo.osRelease,
          },
        }
      : {};
    const contextText = `\n当前运行时上下文：${json(runtimeContext)}${
      toolsEnabled
        ? `\n当前工作区上下文：${json({ directories: nodes.filter((n) => n.type === "folder").map(({ id, name, parentId }) => ({ id, name, parentId })), apis: nodes.filter((n) => n.type === "api").map(({ id, name, method, protocol, parentId }) => ({ id, name, method, protocol, parentId })) })}`
        : ""
    }`;
    const toolCatalogText = toolsEnabled
      ? `\n工具清单：${buildToolCatalog(activeToolNames)}`
      : "";
    const modelMessages: ModelMessage[] = [
      {
        role: "system",
        content: `你是 API-forge 的接口测试助手。${toolsEnabled ? `你必须通过工具完成工作区操作，工具结果返回后继续推理。需要用户确认的破坏性操作（删除）先询问，不要直接调用。脚本工具仅允许执行查询类命令；凡是包含网络访问的命令，必须先在对话中获得用户明确授权，再调用工具。${networkAuthorized ? "当前用户已明确授权网络查询，可以执行网络访问类查询命令。" : "当前用户尚未授权网络查询，遇到网络访问命令必须先请求授权。"} 当前设备运行在 ${appInfo?.platform ?? "未知平台"} 上，脚本工具已按平台动态暴露：${scriptToolName ?? "未就绪"}.` : "当前为普通问答模式，不要调用工具。"}${contextText}${toolCatalogText}`,
      },
      { role: "user", content: userText },
    ];
    while (true) {
      let streamedText = "";
      let streamedReasoning = "";
      const streamingId = crypto.randomUUID();
      const reasoningId = crypto.randomUUID();
      const modelMessage = await requestModel(
        modelMessages,
        (chunk, thought) => {
          streamedText += chunk;
          streamedReasoning = thought ?? streamedReasoning;
          if (streamedReasoning.trim())
            append({
              id: reasoningId,
              role: "reasoning",
              content: streamedReasoning,
              reasoningDone: false,
            });
          if (streamedText.trim())
            append({
              id: streamingId,
              role: "assistant",
              content: streamedText,
            });
        },
        toolDefinitions,
      );
      modelMessages.push(modelMessage);
      if (streamedReasoning.trim())
        append({
          id: reasoningId,
          role: "reasoning",
          content: streamedReasoning,
          reasoningDone: true,
        });
      const calls = modelMessage.tool_calls ?? [];
      if (!calls.length) {
        if (!streamedText.trim() && modelMessage.content?.trim())
          append({
            id: streamingId,
            role: "assistant",
            content: modelMessage.content,
          });
        return;
      }
      for (const call of calls) {
        const toolName = call.function.name as ToolName;
        if (!toolLabels[toolName]) {
          modelMessages.push({
            role: "tool",
            tool_call_id: call.id,
            name: toolName,
            content: "未知工具",
          });
          continue;
        }
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<
            string,
            unknown
          >;
        } catch {
          args = {};
        }
        append({
          id: crypto.randomUUID(),
          role: "tool",
          tool: toolName,
          content: formatToolCallMessage(toolName, args),
        });
        const result = await runTool(toolName, args, { networkAuthorized });
        append({
          id: crypto.randomUUID(),
          role: "tool",
          tool: toolName,
          content: `Observation：${result}`,
        });
        modelMessages.push({
          role: "tool",
          tool_call_id: call.id,
          name: toolName,
          content: result,
        });
      }
    }
  }

  async function copyMessage(message: Message) {
    await navigator.clipboard?.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(
      () =>
        setCopiedMessageId((current) =>
          current === message.id ? undefined : current,
        ),
      1500,
    );
  }

  async function submit(textOverride?: string, baseMessages = messages) {
    const text = (textOverride ?? input).trim();
    if (!text || busy) return;
    if (!activeConversation) return;
    shouldFollowRef.current = true;
    const editingIndex = editingMessageId
      ? baseMessages.findIndex((message) => message.id === editingMessageId)
      : -1;
    const userMessage =
      editingIndex >= 0
        ? { ...baseMessages[editingIndex], content: text }
        : { id: crypto.randomUUID(), role: "user" as const, content: text };
    let transcript =
      editingIndex >= 0
        ? [...baseMessages.slice(0, editingIndex), userMessage]
        : [...baseMessages, userMessage];
    setEditingMessageId(undefined);
    persistMessages(transcript);
    setInput("");
    setBusy(true);
    const shouldGenerateTitle = activeConversation.title === "新对话";
    if (shouldGenerateTitle)
      renameConversationTitle(
        activeConversation.id,
        normalizeConversationTitle("", text),
      );
    const titleTask = shouldGenerateTitle
      ? generateConversationTitle(text).then((title) =>
          renameConversationTitle(activeConversation.id, title),
        )
      : Promise.resolve();
    const append = (message: Message) => {
      transcript = transcript.some((item) => item.id === message.id)
        ? transcript.map((item) => (item.id === message.id ? message : item))
        : [...transcript, message];
      persistMessages(transcript);
    };
    try {
      await Promise.all([runAgent(text, append), titleTask]);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        append({
          id: crypto.randomUUID(),
          role: "assistant",
          content: `AI 执行失败：${error instanceof Error ? error.message : "未知错误"}`,
        });
    }
    aiRequestIdRef.current = undefined;
    setBusy(false);
  }
  function stopAgent() {
    const requestId = aiRequestIdRef.current;
    if (requestId) void window.desktopApi?.httpCancel(requestId);
  }

  function editMessage(index: number) {
    if (busy) return;
    const message = messages[index];
    if (!message || message.role !== "user") return;
    setEditingMessageId(message.id);
    setInput(message.content);
    setHistoryIndex(-1);
  }

  function cancelEdit() {
    setEditingMessageId(undefined);
    setInput("");
  }

  function getCurrentConversationTranscript() {
    const currentConversation =
      conversationsRef.current.find((item) => item.id === activeConversationId) ??
      conversationsRef.current[0];
    return currentConversation
      ? buildConversationExport([currentConversation])
      : "# AI 工作台对话记录\n\n（暂无会话）";
  }

  async function copyCurrentConversation() {
    const transcript = getCurrentConversationTranscript();
    try {
      await navigator.clipboard?.writeText(transcript);
      setExportFeedback("copied");
      window.setTimeout(() => setExportFeedback(undefined), 1600);
    } catch {
      setExportFeedback(undefined);
    }
  }

  function exportCurrentConversation() {
    const transcript = getCurrentConversationTranscript();
    const blob = new Blob([transcript], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ai-workspace-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportFeedback("exported");
    window.setTimeout(() => setExportFeedback(undefined), 1600);
  }

  if (!aiReady)
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#0b0f14] p-6 text-zinc-500">
        <div className="max-w-md text-center">
          <Sparkles className="mx-auto mb-4 h-10 w-10 text-zinc-700" />
          <h1 className="text-sm font-semibold text-zinc-400">
            AI 对话暂不可用
          </h1>
          <p className="mt-2 text-xs leading-6">
            请先在大模型配置中启用服务，并填写接口地址和模型名称。
          </p>
          <NavLink
            to="/settings"
            className="mt-5 inline-flex h-9 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950"
          >
            <Settings2 className="h-3.5 w-3.5" />
            前往配置
          </NavLink>
        </div>
      </div>
    );

  return (
    <div className="flex h-full min-h-0 bg-[#0b0f14] text-zinc-100">
      <aside className="hidden w-64 shrink-0 border-r border-zinc-800 p-3 md:block">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="h-4 w-4 text-cyan-300" />
          AI 对话
        </div>
        <button
          onClick={createConversation}
          disabled={busy}
          className="mb-4 h-8 w-full rounded border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          新建对话
        </button>
        <div className="space-y-1 text-xs text-zinc-500">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => setActiveConversationId(conversation.id)}
              className={`group flex cursor-pointer items-center gap-2 rounded px-2 py-2 ${conversation.id === activeConversation?.id ? "bg-zinc-800 text-zinc-200" : "hover:bg-zinc-800"}`}
            >
              <span className="min-w-0 flex-1 truncate">
                {conversation.title}
              </span>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  const next = conversations.filter(
                    (item) => item.id !== conversation.id,
                  );
                  const fallback = next[0] ?? {
                    id: crypto.randomUUID(),
                    title: "新对话",
                    messages: [],
                    updatedAt: new Date().toISOString(),
                  };
                  persist(next.length ? next : [fallback]);
                  setActiveConversationId(next[0]?.id ?? fallback.id);
                }}
                className="hidden text-zinc-500 hover:text-rose-300 group-hover:block"
                title="删除对话"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-5">
          <div>
            <h1 className="text-sm font-semibold">AI 工作台</h1>
            <p className="text-[11px] text-zinc-500">
              基于当前工作区上下文执行操作
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void copyCurrentConversation()}
              disabled={
                !activeConversation || activeConversation.messages.length === 0
              }
              className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              title="复制当前会话上下文"
            >
              {exportFeedback === "copied" ? (
                <Check className="h-3.5 w-3.5 text-emerald-300" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {exportFeedback === "copied" ? "已复制" : "复制当前"}
            </button>
            <button
              onClick={exportCurrentConversation}
              disabled={
                !activeConversation || activeConversation.messages.length === 0
              }
              className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              title="导出当前会话上下文"
            >
              {exportFeedback === "exported" ? (
                <Check className="h-3.5 w-3.5 text-emerald-300" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {exportFeedback === "exported" ? "已导出" : "导出"}
            </button>
          </div>
        </header>
        <div
          ref={messagesContainerRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            shouldFollowRef.current =
              target.scrollHeight - target.scrollTop - target.clientHeight < 48;
          }}
          className="min-h-0 flex-1 space-y-4 overflow-auto p-5"
        >
          {messages.length === 0 && (
            <div className="mx-auto mt-20 max-w-lg text-center text-sm text-zinc-500">
              <Bot className="mx-auto mb-3 h-9 w-9 text-cyan-300" />
              <p>
                告诉我你想做什么，例如“列出订单目录下的接口”或“新增接口
                用户登录”。
              </p>
            </div>
          )}
          {messages.map((m, index) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
            >
              <div>
                {m.role === "reasoning" ? (
                  <div className="ai-reasoning-panel">
                    <button
                      onClick={() =>
                        setExpandedToolIds((current) => {
                          const next = new Set(current);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })
                      }
                      className="ai-tool-toggle"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {m.reasoningDone ? "思考内容" : "思考中"}
                      </span>
                      {expandedToolIds.has(m.id) ? (
                        <ChevronDown className="ml-auto h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="ml-auto h-3.5 w-3.5" />
                      )}
                    </button>
                    {expandedToolIds.has(m.id) && (
                      <div
                        ref={(element) => {
                          reasoningContentRefs.current[m.id] = element;
                        }}
                        onScroll={(event) => {
                          const target = event.currentTarget;
                          reasoningFollowRef.current =
                            target.scrollHeight -
                              target.scrollTop -
                              target.clientHeight <
                            24;
                        }}
                        className="ai-tool-detail ai-reasoning-markdown"
                      >
                        <MarkdownText value={m.content} />
                      </div>
                    )}
                  </div>
                ) : m.role === "tool" ? (
                  <div className="ai-tool-panel">
                    <button
                      onClick={() =>
                        setExpandedToolIds((current) => {
                          const next = new Set(current);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })
                      }
                      className="ai-tool-toggle"
                    >
                      <Wrench className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {m.content.startsWith("Observation")
                          ? "工具结果"
                          : "调用工具"}
                      </span>
                      {expandedToolIds.has(m.id) ? (
                        <ChevronDown className="ml-auto h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="ml-auto h-3.5 w-3.5" />
                      )}
                    </button>
                    {expandedToolIds.has(m.id) && (
                      <pre className="ai-tool-detail">{m.content}</pre>
                    )}
                  </div>
                ) : (
                  <div className={`ai-message ai-message-${m.role}`}>
                    {m.role === "assistant" ? (
                      <MarkdownText value={m.content} />
                    ) : (
                      m.content
                    )}
                  </div>
                )}
                {m.role !== "tool" && (
                  <div
                    className={`mt-1 flex items-center gap-1 ${m.role === "user" ? "justify-end" : ""}`}
                  >
                    <button
                      onClick={() => void copyMessage(m)}
                      className="flex h-6 items-center gap-1 rounded px-2 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      title="复制消息"
                    >
                      {copiedMessageId === m.id ? (
                        <Check className="h-3 w-3 text-emerald-300" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedMessageId === m.id ? "已复制" : "复制"}
                    </button>
                    {m.role === "user" && (
                      <button
                        onClick={() => editMessage(index)}
                        disabled={busy}
                        className="flex h-6 items-center gap-1 rounded px-2 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
                        title="编辑并重新提问"
                      >
                        <RotateCcw className="h-3 w-3" />
                        重新提问
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="border-t border-zinc-800 p-4">
          <div className="mx-auto max-w-4xl rounded-lg border border-zinc-700 bg-[#111821] p-2">
            {editingMessageId && (
              <div className="mb-2 flex items-center justify-between px-2 text-[11px] text-amber-300">
                <span>正在编辑历史消息</span>
                <button
                  onClick={cancelEdit}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  取消
                </button>
              </div>
            )}
            <textarea
              value={input}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              onChange={(e) => {
                setInput(e.target.value);
                if (!editingMessageId) setHistoryIndex(-1);
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.nativeEvent.isComposing ||
                    isComposingRef.current ||
                    e.keyCode === 229)
                ) {
                  return;
                }
                if (
                  e.key === "ArrowUp" &&
                  !e.shiftKey &&
                  !editingMessageId &&
                  promptHistory.length
                ) {
                  e.preventDefault();
                  const next = Math.min(
                    historyIndex + 1,
                    promptHistory.length - 1,
                  );
                  setHistoryIndex(next);
                  setInput(promptHistory[next]);
                  return;
                }
                if (
                  e.key === "ArrowDown" &&
                  !e.shiftKey &&
                  !editingMessageId &&
                  historyIndex >= 0
                ) {
                  e.preventDefault();
                  const next = historyIndex - 1;
                  setHistoryIndex(next);
                  setInput(next >= 0 ? promptHistory[next] : "");
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="输入指令，AI 将规划并执行工具..."
              className="min-h-16 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-zinc-600"
            />
            <div className="flex items-center justify-between">
              <button
                onClick={() => setToolsEnabled((value) => !value)}
                className={`flex h-8 items-center gap-2 rounded border px-3 text-[11px] ${toolsEnabled ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
                title={
                  toolsEnabled
                    ? "已开启工具调用，消息会携带工作区上下文"
                    : "已关闭工具调用，当前为普通问答"
                }
              >
                <Wrench className="h-3.5 w-3.5" />
                工具 {toolsEnabled ? "已开启" : "已关闭"}
              </button>
              <div className="flex items-center gap-3">
                <div
                  className={`context-gauge context-gauge-${contextTone}`}
                  tabIndex={0}
                  role="img"
                  aria-label={`上下文占用 ${contextTokens.toLocaleString()} / ${contextLimit.toLocaleString()} Token，${contextPercent}%`}
                >
                  <div
                    className="context-gauge-ring"
                    style={{
                      background: `conic-gradient(var(--context-color) ${contextRatio * 360}deg, var(--context-track) 0deg)`,
                    }}
                  >
                    <span className="context-gauge-center" />
                  </div>
                  <div className="context-gauge-tooltip" role="tooltip">
                    <span>上下文用量</span>
                    <strong>
                      {contextTokens.toLocaleString()} /{" "}
                      {contextLimit.toLocaleString()} Token
                    </strong>
                    <span>已使用 {contextPercent}%</span>
                  </div>
                </div>
                <button
                  onClick={busy ? stopAgent : () => void submit()}
                  disabled={!busy && !input.trim()}
                  className="flex h-8 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950 disabled:opacity-40"
                >
                  {busy ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {busy ? "停止" : editingMessageId ? "重新提问" : "发送"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
