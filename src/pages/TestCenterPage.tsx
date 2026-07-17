import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  FlaskConical,
  History,
  Layers3,
  Play,
  Plus,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  useWorkspaceStore,
  getWorkspaceVariables,
  replaceEnvironmentVariables,
} from "@/stores/workspace-store";
import type {
  ApiTreeNode,
  HttpFieldItem,
  HttpMethod,
  HttpSendResult,
  RequestDefinition,
  RequestHistoryItem,
} from "@/shared/ipc-contracts";
import { ThemedSelect } from "@/components/common/ThemedSelect";
import { StatusPill } from "@/components/common/StatusPill";

type TabKey = "single" | "scenario" | "load" | "report";

type ScenarioStep = {
  id: string;
  requestId: string;
  name: string;
};

type AssertionItem = {
  id: string;
  enabled: boolean;
  type: "status" | "contains" | "json-path";
  value: string;
  expected?: string;
};

type TestSummary = {
  ok: boolean;
  title: string;
  details: string[];
};

function cloneFields(
  fields: HttpFieldItem[] | undefined,
  fallbackPrefix: "param" | "header",
): HttpFieldItem[] {
  if (!fields?.length) return [];
  return fields.map((item, index) => ({
    id: item.id ?? `${fallbackPrefix}-${index}`,
    key: item.key,
    value: item.value,
    enabled: item.enabled,
  }));
}

function formatBody(body: unknown) {
  if (typeof body !== "string") return "";
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function summarizeHistory(item: RequestHistoryItem) {
  const status = item.status ? `${item.status}` : "失败";
  const cost = item.durationMs ? `${item.durationMs} ms` : "-";
  return `${item.method ?? item.protocol.toUpperCase()} ${item.url} · ${status} · ${cost}`;
}

function isHttpSendError(
  result: HttpSendResult,
): result is Extract<HttpSendResult, { ok: false }> {
  return result.ok === false;
}

function getErrorMessage(result: HttpSendResult) {
  return isHttpSendError(result) ? result.error.message : "";
}

function findApiNode(
  nodes: RequestDefinition[] | undefined,
  requestId?: string,
) {
  return nodes?.find((item) => item.id === requestId);
}

function buildHttpMethodOptions() {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
    (value) => ({ value, label: value }),
  );
}

function flattenApiTree(
  nodes: ApiTreeNode[],
  parents: string[] = [],
): Array<{ id: string; label: string }> {
  return nodes.flatMap((node) => {
    if (node.type === "folder")
      return flattenApiTree(node.children ?? [], [...parents, node.name]);
    return [{ id: node.id, label: [...parents, node.name].join(" / ") }];
  });
}

function parseJsonBody(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readJsonPath(root: unknown, path: string): unknown {
  const normalized = path.trim();
  if (!normalized) return undefined;
  const tokens = normalized
    .replace(/^\$\.?/, "")
    .split(".")
    .filter(Boolean);
  let current: unknown = root;
  for (const token of tokens) {
    if (current == null) return undefined;
    const arrayMatch = token.match(/^([^[\]]+)(\[(\d+)\])?$/);
    if (!arrayMatch) return undefined;
    const [, key, , index] = arrayMatch;
    if (typeof current !== "object" || current === null || !(key in current))
      return undefined;
    current = (current as Record<string, unknown>)[key];
    if (index !== undefined) {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(index)];
    }
  }
  return current;
}

function createDefaultAssertions(): AssertionItem[] {
  return [
    { id: "assert-status", enabled: true, type: "status", value: "200" },
    {
      id: "assert-body",
      enabled: false,
      type: "contains",
      value: "",
      expected: "",
    },
  ];
}

function readDraft(
  key: string,
):
  | {
      method?: HttpMethod;
      url?: string;
      body?: string;
      params?: HttpFieldItem[];
      headers?: HttpFieldItem[];
      assertions?: AssertionItem[];
    }
  | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw
      ? (JSON.parse(raw) as {
          method?: HttpMethod;
          url?: string;
          body?: string;
          params?: HttpFieldItem[];
          headers?: HttpFieldItem[];
          assertions?: AssertionItem[];
        })
      : undefined;
  } catch {
    return undefined;
  }
}

function writeDraft(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export default function TestCenterPage() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const activeEnvironmentId = useWorkspaceStore(
    (state) => state.activeEnvironmentId,
  );
  const activeApiId = useWorkspaceStore((state) => state.activeApiId);
  const addHistory = useWorkspaceStore((state) => state.addHistory);
  const apiNodes = useMemo(
    () => flattenApiTree(workspace?.apiTree ?? []),
    [workspace?.apiTree],
  );
  const requestsById = useMemo(
    () =>
      new Map(
        (workspace?.requests ?? []).map((item) => [item.id, item] as const),
      ),
    [workspace?.requests],
  );
  const history = workspace?.history ?? [];
  const variables = useMemo(
    () => getWorkspaceVariables(workspace, activeEnvironmentId),
    [workspace, activeEnvironmentId],
  );
  const [tab, setTab] = useState<TabKey>("single");
  const activeRequestId =
    activeApiId && apiNodes.some((item) => item.id === activeApiId)
      ? activeApiId
      : apiNodes[0]?.id;
  const [selectedRequestId, setSelectedRequestId] = useState<string>(
    activeRequestId ?? "",
  );
  const selectedRequest = useMemo(
    () =>
      requestsById.get(selectedRequestId) ??
      requestsById.get(activeRequestId ?? ""),
    [requestsById, selectedRequestId, activeRequestId],
  );
  const draftKey = selectedRequest
    ? `api-forge:test-draft:${selectedRequest.id}`
    : undefined;
  const [assertions, setAssertions] = useState<AssertionItem[]>(
    createDefaultAssertions,
  );
  const [method, setMethod] = useState<HttpMethod>(
    selectedRequest?.method ?? "GET",
  );
  const [url, setUrl] = useState(selectedRequest?.url ?? "");
  const [params, setParams] = useState<HttpFieldItem[]>(
    cloneFields(selectedRequest?.params, "param"),
  );
  const [headers, setHeaders] = useState<HttpFieldItem[]>(
    cloneFields(selectedRequest?.headers, "header"),
  );
  const [body, setBody] = useState(selectedRequest?.body ?? "");
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleResult, setSingleResult] = useState<HttpSendResult>();
  const [singleNote, setSingleNote] = useState("");
  const [singleLogs, setSingleLogs] = useState<string[]>([]);
  const [scenarioSteps, setScenarioSteps] = useState<ScenarioStep[]>(() =>
    apiNodes
      .slice(0, 2)
      .map((request, index) => ({
        id: `step-${index}`,
        requestId: request.id,
        name: request.label,
      })),
  );
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioResults, setScenarioResults] = useState<
    Array<{
      name: string;
      ok: boolean;
      status?: number;
      durationMs?: number;
      message?: string;
    }>
  >([]);
  const [loadConcurrency, setLoadConcurrency] = useState(3);
  const [loadIterations, setLoadIterations] = useState(12);
  const [loadLoading, setLoadLoading] = useState(false);
  const [loadResult, setLoadResult] = useState<{
    total: number;
    success: number;
    failure: number;
    avg: number;
    p95: number;
    max: number;
  }>();
  const [lastSummary, setLastSummary] = useState<TestSummary>();

  useEffect(() => {
    if (!selectedRequest) return;
    const draft = draftKey ? readDraft(draftKey) : undefined;
    setMethod(draft?.method ?? selectedRequest.method ?? "GET");
    setUrl(draft?.url ?? selectedRequest.url);
    setParams(
      draft?.params
        ? cloneFields(draft.params, "param")
        : cloneFields(selectedRequest.params, "param"),
    );
    setHeaders(
      draft?.headers
        ? cloneFields(draft.headers, "header")
        : cloneFields(selectedRequest.headers, "header"),
    );
    setBody(draft?.body ?? selectedRequest.body ?? "");
    setAssertions(
      draft?.assertions?.length ? draft.assertions : createDefaultAssertions(),
    );
  }, [selectedRequest?.id]);

  useEffect(() => {
    if (selectedRequestId) return;
    setSelectedRequestId(activeRequestId ?? "");
  }, [activeRequestId, selectedRequestId]);

  useEffect(() => {
    if (!scenarioSteps.length && apiNodes.length) {
      setScenarioSteps(
        apiNodes
          .slice(0, 2)
          .map((request, index) => ({
            id: `step-${index}`,
            requestId: request.id,
            name: request.label,
          })),
      );
    }
  }, [apiNodes, scenarioSteps.length]);

  useEffect(() => {
    if (!draftKey || !selectedRequest) return;
    writeDraft(draftKey, { method, url, body, params, headers, assertions });
  }, [
    draftKey,
    selectedRequest?.id,
    method,
    url,
    body,
    params,
    headers,
    assertions,
  ]);

  function appendSingleLog(message: string) {
    setSingleLogs((current) => [message, ...current].slice(0, 8));
  }

  function resolveValue(value: string) {
    return replaceEnvironmentVariables(value, variables);
  }

  function resolveFields(fields: HttpFieldItem[]) {
    return fields
      .filter((item) => item.enabled && item.key.trim())
      .map((item) => ({
        key: resolveValue(item.key),
        value: resolveValue(item.value),
      }));
  }

  function buildRequestSnapshot() {
    return {
      method,
      url,
      params: resolveFields(params),
      headers: resolveFields(headers),
      body,
    };
  }

  function evaluateAssertions(
    result: Extract<HttpSendResult, { ok: true }>,
  ): TestSummary {
    const details: string[] = [];
    const bodyText = result.body ?? "";
    const jsonBody = parseJsonBody(bodyText);
    let ok = true;
    for (const assertion of assertions.filter((item) => item.enabled)) {
      if (assertion.type === "status") {
        const expected = Number(assertion.value);
        const pass = Number.isFinite(expected) && result.status === expected;
        details.push(
          pass
            ? `状态码符合：${result.status}`
            : `状态码不符合：期望 ${expected}，实际 ${result.status}`,
        );
        ok = ok && pass;
      }
      if (assertion.type === "contains") {
        const expected = assertion.value.trim();
        const pass = expected ? bodyText.includes(expected) : true;
        details.push(
          pass ? `响应包含：${expected}` : `响应不包含：${expected}`,
        );
        ok = ok && pass;
      }
      if (assertion.type === "json-path") {
        const actual = readJsonPath(jsonBody, assertion.value);
        const expected = assertion.expected?.trim();
        const pass = expected
          ? String(actual ?? "") === expected
          : actual !== undefined;
        details.push(
          pass
            ? `路径命中：${assertion.value}`
            : `路径失败：${assertion.value}${expected ? `，期望 ${expected}` : ""}`,
        );
        ok = ok && pass;
      }
    }
    return {
      ok,
      title: ok ? "测试通过" : "测试未通过",
      details: details.length ? details : ["未配置校验项"],
    };
  }

  async function sendRequest(payload: {
    name: string;
    method: HttpMethod;
    url: string;
    params: HttpFieldItem[];
    headers: HttpFieldItem[];
    body?: string;
  }) {
    if (!window.desktopApi?.httpSend) throw new Error("当前环境不支持请求发送");
    const response = await window.desktopApi.httpSend({
      method: payload.method,
      url: resolveValue(payload.url),
      params: payload.params
        .filter((item) => item.enabled && item.key.trim())
        .map((item) => ({
          key: resolveValue(item.key),
          value: resolveValue(item.value),
          enabled: item.enabled,
        })),
      headers: Object.fromEntries(
        payload.headers
          .filter((item) => item.enabled && item.key.trim())
          .map((item) => [resolveValue(item.key), resolveValue(item.value)]),
      ),
      body: payload.body ? resolveValue(payload.body) : undefined,
      timeout: 30000,
      followRedirects: true,
      validateCertificates: true,
    });
    addHistory({
      id: `history-${crypto.randomUUID()}`,
      protocol: "http",
      method: payload.method,
      url: resolveValue(payload.url),
      status: response.ok ? response.status : undefined,
      durationMs: response.ok ? response.durationMs : undefined,
      sizeBytes: response.ok ? response.sizeBytes : undefined,
      environmentId: activeEnvironmentId,
      createdAt: new Date().toISOString(),
      requestSnapshot: buildRequestSnapshot(),
      responseSnapshot: response,
    });
    return response;
  }

  async function runSingleTest() {
    setSingleLoading(true);
    setSingleResult(undefined);
    try {
      const result = await sendRequest({
        name: selectedRequest?.name ?? "未命名接口",
        method,
        url,
        params,
        headers,
        body,
      });
      setSingleResult(result);
      if (result.ok) {
        const summary = evaluateAssertions(result);
        setLastSummary(summary);
        appendSingleLog(`请求成功：${result.status} / ${result.durationMs} ms`);
        appendSingleLog(summary.title);
      } else {
        setLastSummary({
          ok: false,
          title: "测试失败",
          details: [getErrorMessage(result)],
        });
        appendSingleLog(`请求失败：${getErrorMessage(result)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "测试失败";
      appendSingleLog(message);
      setSingleResult({ ok: false, error: { code: "UNKNOWN_ERROR", message } });
    } finally {
      setSingleLoading(false);
    }
  }

  async function runScenario() {
    if (!scenarioSteps.length) return;
    setScenarioLoading(true);
    setScenarioResults([]);
    try {
      const results: Array<{
        name: string;
        ok: boolean;
        status?: number;
        durationMs?: number;
        message?: string;
      }> = [];
      for (const step of scenarioSteps) {
        const request = requestsById.get(step.requestId);
        if (!request) {
          results.push({ name: step.name, ok: false, message: "未找到接口" });
          continue;
        }
        const response = await sendRequest({
          name: request.name,
          method: request.method ?? "GET",
          url: request.url,
          params: request.params ?? [],
          headers: request.headers ?? [],
          body: request.body,
        });
        results.push(
          response.ok
            ? {
                name: request.name,
                ok: true,
                status: response.status,
                durationMs: response.durationMs,
              }
            : {
                name: request.name,
                ok: false,
                message: getErrorMessage(response),
              },
        );
      }
      setScenarioResults(results);
    } finally {
      setScenarioLoading(false);
    }
  }

  async function runLoadTest() {
    if (!selectedRequest || loadIterations <= 0) return;
    setLoadLoading(true);
    setLoadResult(undefined);
    try {
      const durations: number[] = [];
      let success = 0;
      let failure = 0;
      let cursor = 0;
      const workers = Array.from(
        { length: Math.max(1, loadConcurrency) },
        async () => {
          while (cursor < loadIterations) {
            const current = cursor;
            cursor += 1;
            if (current >= loadIterations) break;
            const response = await sendRequest({
              name: selectedRequest.name,
              method: selectedRequest.method ?? method,
              url: selectedRequest.url,
              params: selectedRequest.params ?? [],
              headers: selectedRequest.headers ?? [],
              body: selectedRequest.body,
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
            durations.reduce((sum, value) => sum + value, 0) / durations.length,
          )
        : 0;
      const p95 = sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
        : 0;
      const max = sorted.length ? sorted[sorted.length - 1] : 0;
      setLoadResult({ total: loadIterations, success, failure, avg, p95, max });
    } finally {
      setLoadLoading(false);
    }
  }

  const recentHistory = history.slice(0, 8);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0f141b] text-zinc-100">
      <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
        <div>
          <h1 className="text-sm font-semibold">测试中心</h1>
          <p className="text-xs text-zinc-500">
            指定接口测试、场景执行、压测分析与结果回看
          </p>
        </div>
        <div />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-800 p-3">
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
                <Wrench className="h-3.5 w-3.5 text-cyan-300" />
                测试入口
              </div>
              <div className="space-y-1">
                {(
                  [
                    ["single", "单次测试"],
                    ["scenario", "场景测试"],
                    ["load", "压测"],
                    ["report", "报告"],
                  ] as Array<[TabKey, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex h-8 w-full items-center rounded px-3 text-left text-xs ${tab === key ? "bg-cyan-400/12 text-cyan-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
                <Layers3 className="h-3.5 w-3.5 text-emerald-300" />
                接口选择
              </div>
              <ThemedSelect
                className="w-full"
                value={selectedRequestId}
                options={apiNodes.map((request) => ({
                  value: request.id,
                  label: request.label,
                }))}
                onChange={(value) => setSelectedRequestId(String(value))}
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
                <History className="h-3.5 w-3.5 text-violet-300" />
                最近历史
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-[11px] text-zinc-500">
                {recentHistory.length ? (
                  recentHistory.map((item) => (
                    <div
                      key={item.id}
                      className="rounded bg-zinc-900/70 px-2 py-2"
                    >
                      {summarizeHistory(item)}
                    </div>
                  ))
                ) : (
                  <div className="rounded bg-zinc-900/70 px-2 py-2">
                    暂无历史
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-4">
          {tab === "single" && (
            <section className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">单次测试</h2>
                      <p className="text-xs text-zinc-500">
                        基于已保存接口直接发起请求
                      </p>
                    </div>
                    <button
                      onClick={() => void runSingleTest()}
                      disabled={singleLoading || !selectedRequest}
                      className="flex h-9 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950 disabled:opacity-40"
                    >
                      {singleLoading ? (
                        <Square className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {singleLoading ? "执行中" : "开始测试"}
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-zinc-400">
                      方法
                      <ThemedSelect
                        className="mt-2"
                        value={method}
                        options={buildHttpMethodOptions()}
                        onChange={(value) => setMethod(value as HttpMethod)}
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      URL
                      <input
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-100 outline-none focus:border-cyan-400/60"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block text-xs text-zinc-400">
                    Body
                    <textarea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      className="mt-2 min-h-44 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-cyan-400/60"
                    />
                  </label>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="mb-2 text-xs font-medium text-zinc-300">
                        参数
                      </div>
                      <div className="space-y-2">
                        {params.map((item, index) => (
                          <input
                            key={item.id}
                            value={`${item.key}=${item.value}`}
                            onChange={(event) => {
                              const [nextKey = "", ...rest] =
                                event.target.value.split("=");
                              const nextValue = rest.join("=");
                              setParams((current) =>
                                current.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? {
                                        ...entry,
                                        key: nextKey,
                                        value: nextValue,
                                      }
                                    : entry,
                                ),
                              );
                            }}
                            className="h-8 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-[11px] text-zinc-300 outline-none"
                          />
                        ))}
                      </div>
                    </div>
                    <div className="rounded border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="mb-2 text-xs font-medium text-zinc-300">
                        请求头
                      </div>
                      <div className="space-y-2">
                        {headers.map((item, index) => (
                          <input
                            key={item.id}
                            value={`${item.key}: ${item.value}`}
                            onChange={(event) => {
                              const [nextKey = "", ...rest] =
                                event.target.value.split(":");
                              const nextValue = rest.join(":").trimStart();
                              setHeaders((current) =>
                                current.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? {
                                        ...entry,
                                        key: nextKey,
                                        value: nextValue,
                                      }
                                    : entry,
                                ),
                              );
                            }}
                            className="h-8 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-[11px] text-zinc-300 outline-none"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 rounded border border-zinc-800 bg-zinc-950/70 p-3">
                    <div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-300">
                      <span>结果校验</span>
                      <button
                        type="button"
                        onClick={() => setAssertions(createDefaultAssertions())}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        恢复默认
                      </button>
                    </div>
                    <div className="space-y-2">
                      {assertions.map((item, index) => (
                        <div
                          key={item.id}
                          className="grid gap-2 md:grid-cols-[72px_120px_minmax(0,1fr)_auto]"
                        >
                          <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                            <input
                              type="checkbox"
                              checked={item.enabled}
                              onChange={(event) =>
                                setAssertions((current) =>
                                  current.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          enabled: event.target.checked,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            />
                            启用
                          </label>
                          <ThemedSelect
                            value={item.type}
                            options={[
                              { value: "status", label: "状态码" },
                              { value: "contains", label: "内容包含" },
                              { value: "json-path", label: "JSON 路径" },
                            ]}
                            onChange={(value) =>
                              setAssertions((current) =>
                                current.map((entry) =>
                                  entry.id === item.id
                                    ? {
                                        ...entry,
                                        type: value as AssertionItem["type"],
                                      }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <input
                            value={
                              item.type === "json-path"
                                ? item.value
                                : item.type === "contains"
                                  ? item.value
                                  : item.value
                            }
                            onChange={(event) =>
                              setAssertions((current) =>
                                current.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, value: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                            placeholder={
                              item.type === "status"
                                ? "200"
                                : item.type === "contains"
                                  ? "success"
                                  : "$.data.id"
                            }
                            className="h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-[11px] outline-none"
                          />
                          {item.type === "json-path" ? (
                            <input
                              value={item.expected ?? ""}
                              onChange={(event) =>
                                setAssertions((current) =>
                                  current.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          expected: event.target.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                              placeholder="期望值"
                              className="h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-[11px] outline-none"
                            />
                          ) : (
                            <button
                              onClick={() =>
                                setAssertions((current) =>
                                  current.filter(
                                    (entry) => entry.id !== item.id,
                                  ),
                                )
                              }
                              className="h-8 rounded border border-zinc-700 px-3 text-[11px] text-zinc-400 hover:bg-zinc-800"
                            >
                              删除
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() =>
                        setAssertions((current) => [
                          ...current,
                          {
                            id: `assert-${crypto.randomUUID()}`,
                            enabled: true,
                            type: "contains",
                            value: "",
                          },
                        ])
                      }
                      className="mt-3 flex h-8 items-center gap-2 rounded border border-zinc-700 px-3 text-[11px] text-zinc-300 hover:bg-zinc-800"
                    >
                      <Plus className="h-3 w-3" />
                      新增校验
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                    <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                      执行结果
                    </div>
                    {singleResult ? (
                      singleResult.ok ? (
                        <div className="space-y-3 text-xs text-zinc-300">
                          <StatusPill tone="green">
                            {singleResult.status}
                          </StatusPill>
                          <div>耗时：{singleResult.durationMs} ms</div>
                          <div>响应大小：{singleResult.sizeBytes} bytes</div>
                          <pre className="max-h-72 overflow-auto rounded bg-zinc-950 p-3 text-[11px] text-zinc-200">
                            {formatBody(singleResult.body)}
                          </pre>
                        </div>
                      ) : (
                        <div className="rounded border border-rose-500/25 bg-rose-500/6 p-3 text-xs text-rose-200">
                          {getErrorMessage(singleResult)}
                        </div>
                      )
                    ) : (
                      <div className="text-xs text-zinc-500">尚未执行</div>
                    )}
                  </div>
                  <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                    <div className="mb-2 text-xs font-medium text-zinc-300">
                      执行记录
                    </div>
                    <div className="space-y-2 text-[11px] text-zinc-500">
                      {singleLogs.length ? (
                        singleLogs.map((item, index) => (
                          <div
                            key={index}
                            className="rounded bg-zinc-950/70 px-2 py-2"
                          >
                            {item}
                          </div>
                        ))
                      ) : (
                        <div className="rounded bg-zinc-950/70 px-2 py-2">
                          暂无记录
                        </div>
                      )}
                    </div>
                  </div>
                  {lastSummary && (
                    <div
                      className={`rounded border p-4 text-xs ${lastSummary.ok ? "border-emerald-500/25 bg-emerald-500/6 text-emerald-100" : "border-rose-500/25 bg-rose-500/6 text-rose-100"}`}
                    >
                      <div className="mb-2 font-medium">
                        {lastSummary.title}
                      </div>
                      <div className="space-y-1">
                        {lastSummary.details.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {tab === "scenario" && (
            <section className="rounded border border-zinc-800 bg-[#111821] p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">场景测试</h2>
                  <p className="text-xs text-zinc-500">按顺序执行多个接口</p>
                </div>
                <button
                  onClick={() =>
                    setScenarioSteps((current) => [
                      ...current,
                      {
                        id: `step-${crypto.randomUUID()}`,
                        requestId: apiNodes[0]?.id ?? "",
                        name: apiNodes[0]?.label ?? "新步骤",
                      },
                    ])
                  }
                  className="flex h-9 items-center gap-2 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新增步骤
                </button>
              </div>
              <div className="space-y-3">
                {scenarioSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className="grid gap-3 rounded border border-zinc-800 bg-zinc-950/70 p-3 md:grid-cols-[1fr_260px_90px]"
                  >
                    <input
                      value={step.name}
                      onChange={(event) =>
                        setScenarioSteps((current) =>
                          current.map((item) =>
                            item.id === step.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="h-9 rounded border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none"
                    />
                    <ThemedSelect
                      value={step.requestId}
                      options={apiNodes.map((request) => ({
                        value: request.id,
                        label: request.label,
                      }))}
                      onChange={(value) =>
                        setScenarioSteps((current) =>
                          current.map((item) =>
                            item.id === step.id
                              ? { ...item, requestId: String(value) }
                              : item,
                          ),
                        )
                      }
                    />
                    <button
                      onClick={() =>
                        setScenarioSteps((current) =>
                          current.filter((item) => item.id !== step.id),
                        )
                      }
                      className="h-9 rounded border border-rose-500/25 bg-rose-500/6 text-xs text-rose-200 hover:bg-rose-500/12"
                    >
                      删除
                    </button>
                    <div className="md:col-span-3 text-[11px] text-zinc-500">
                      步骤 {index + 1}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-zinc-500">
                  支持按接口顺序编排，后续可继续加断言和变量提取。
                </div>
                <button
                  onClick={() => void runScenario()}
                  disabled={scenarioLoading || !scenarioSteps.length}
                  className="flex h-9 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950 disabled:opacity-40"
                >
                  {scenarioLoading ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {scenarioLoading ? "执行中" : "运行场景"}
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {scenarioResults.length ? (
                  scenarioResults.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      className="flex items-center justify-between rounded bg-zinc-950/70 px-3 py-2 text-xs"
                    >
                      <span>{item.name}</span>
                      <span
                        className={
                          item.ok ? "text-emerald-300" : "text-rose-300"
                        }
                      >
                        {item.ok
                          ? `${item.status} · ${item.durationMs} ms`
                          : (item.message ?? "失败")}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-zinc-500">暂无结果</div>
                )}
              </div>
            </section>
          )}

          {tab === "load" && (
            <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold">压测</h2>
                  <p className="text-xs text-zinc-500">
                    对指定接口做并发和次数压测
                  </p>
                </div>
                <label className="mb-3 block text-xs text-zinc-400">
                  并发数
                  <input
                    type="number"
                    min={1}
                    value={loadConcurrency}
                    onChange={(event) =>
                      setLoadConcurrency(
                        Math.max(1, Number(event.target.value) || 1),
                      )
                    }
                    className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none"
                  />
                </label>
                <label className="mb-4 block text-xs text-zinc-400">
                  请求次数
                  <input
                    type="number"
                    min={1}
                    value={loadIterations}
                    onChange={(event) =>
                      setLoadIterations(
                        Math.max(1, Number(event.target.value) || 1),
                      )
                    }
                    className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none"
                  />
                </label>
                <button
                  onClick={() => void runLoadTest()}
                  disabled={loadLoading || !selectedRequest}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950 disabled:opacity-40"
                >
                  {loadLoading ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {loadLoading ? "压测中" : "开始压测"}
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {(
                    [
                      ["总请求", loadResult?.total ?? loadIterations],
                      ["成功", loadResult?.success ?? 0],
                      ["失败", loadResult?.failure ?? 0],
                      ["平均耗时", loadResult ? `${loadResult.avg} ms` : "-"],
                      ["P95", loadResult ? `${loadResult.p95} ms` : "-"],
                      ["最大耗时", loadResult ? `${loadResult.max} ms` : "-"],
                    ] as Array<[string, string | number]>
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded border border-zinc-800 bg-[#111821] p-4"
                    >
                      <div className="text-[11px] text-zinc-500">{label}</div>
                      <div className="mt-1 text-lg font-semibold text-zinc-100">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
                    <BarChart3 className="h-3.5 w-3.5 text-cyan-300" />
                    结果说明
                  </div>
                  <p className="text-xs leading-6 text-zinc-500">
                    当前版本先提供可用的压测执行和核心指标，后续可以继续加错误分布、耗时分位图和导出报告。
                  </p>
                </div>
              </div>
            </section>
          )}

          {tab === "report" && (
            <section className="rounded border border-zinc-800 bg-[#111821] p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">报告</h2>
                <p className="text-xs text-zinc-500">
                  查看最近执行记录和测试结果摘要
                </p>
              </div>
              <div className="space-y-2">
                {history.length ? (
                  history.slice(0, 12).map((item) => (
                    <div
                      key={item.id}
                      className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-3 text-xs text-zinc-300"
                    >
                      {summarizeHistory(item)}
                    </div>
                  ))
                ) : (
                  <div className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-3 text-xs text-zinc-500">
                    暂无历史记录
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
