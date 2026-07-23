import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Gauge,
  History,
  Layers3,
  Play,
  Plus,
  Square,
  Trash2,
  Zap,
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
import { buildHttpSendRequest } from "@/shared/http-request";

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
  checks: Array<{
    label: string;
    ok: boolean;
  }>;
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

function formatBytes(value?: number) {
  if (value === undefined) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatReportTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    durations: number[];
    errors: string[];
    startedAt: string;
    finishedAt: string;
  }>();
  const [lastSummary, setLastSummary] = useState<TestSummary>();

  const reportData = useMemo(() => {
    const items = history.slice(0, 30);
    const successful = items.filter((item) => item.status !== undefined);
    const failed = items.length - successful.length;
    const durations = successful
      .map((item) => item.durationMs)
      .filter((value): value is number => value !== undefined);
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const totalDuration = durations.reduce((sum, value) => sum + value, 0);
    const totalSize = successful.reduce(
      (sum, item) => sum + (item.sizeBytes ?? 0),
      0,
    );
    const endpointMap = new Map<
      string,
      { name: string; total: number; success: number; durations: number[] }
    >();

    items.forEach((item) => {
      const endpoint = item.url;
      const current = endpointMap.get(endpoint) ?? {
        name: endpoint,
        total: 0,
        success: 0,
        durations: [],
      };
      current.total += 1;
      if (item.status !== undefined) current.success += 1;
      if (item.durationMs !== undefined) current.durations.push(item.durationMs);
      endpointMap.set(endpoint, current);
    });

    const endpoints = [...endpointMap.values()]
      .map((item) => ({
        ...item,
        successRate: item.total ? Math.round((item.success / item.total) * 100) : 0,
        avg: item.durations.length
          ? Math.round(
              item.durations.reduce((sum, value) => sum + value, 0) /
                item.durations.length,
            )
          : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      items,
      successful,
      failed,
      successRate: items.length ? Math.round((successful.length / items.length) * 100) : 0,
      avg: durations.length ? Math.round(totalDuration / durations.length) : 0,
      p95: sortedDurations.length
        ? sortedDurations[
            Math.min(sortedDurations.length - 1, Math.ceil(sortedDurations.length * 0.95) - 1)
          ]
        : 0,
      max: sortedDurations.at(-1) ?? 0,
      totalSize,
      endpoints,
    };
  }, [history]);

  const loadViewData = useMemo(() => {
    if (!loadResult) return undefined;
    const sorted = [...loadResult.durations].sort((a, b) => a - b);
    const elapsedMs =
      new Date(loadResult.finishedAt).getTime() -
      new Date(loadResult.startedAt).getTime();
    const errorGroups = [...new Set(loadResult.errors)].map((message) => ({
      message,
      count: loadResult.errors.filter((item) => item === message).length,
    }));
    const bucketCount = 8;
    const max = Math.max(loadResult.max, 1);
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const min = Math.round((index / bucketCount) * max);
      const upper = Math.round(((index + 1) / bucketCount) * max);
      const count = loadResult.durations.filter(
        (duration) =>
          duration >= min &&
          (index === bucketCount - 1 ? duration <= upper : duration < upper),
      ).length;
      return { label: `${min}-${upper}`, count };
    });
    return {
      successRate: loadResult.total
        ? Math.round((loadResult.success / loadResult.total) * 100)
        : 0,
      throughput:
        elapsedMs > 0
          ? Math.round((loadResult.total / (elapsedMs / 1000)) * 10) / 10
          : 0,
      min: sorted[0] ?? 0,
      p50: sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0,
      elapsedMs,
      errorGroups,
      buckets,
    };
  }, [loadResult]);

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
      bodyType: selectedRequest?.bodyType,
      formFields: selectedRequest?.formFields,
    };
  }

  function evaluateAssertions(
    result: Extract<HttpSendResult, { ok: true }>,
  ): TestSummary {
    const details: string[] = [];
    const checks: TestSummary["checks"] = [];
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
        checks.push({
          ok: pass,
          label: pass
            ? `状态码 = ${result.status}`
            : `状态码期望 ${expected}，实际 ${result.status}`,
        });
        ok = ok && pass;
      }
      if (assertion.type === "contains") {
        const expected = assertion.value.trim();
        const pass = expected ? bodyText.includes(expected) : true;
        details.push(
          pass ? `响应包含：${expected}` : `响应不包含：${expected}`,
        );
        checks.push({
          ok: pass,
          label: expected
            ? pass
              ? `响应包含“${expected}”`
              : `响应未包含“${expected}”`
            : "内容包含校验未填写期望值",
        });
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
        checks.push({
          ok: pass,
          label: pass
            ? `JSON 路径 ${assertion.value} 校验通过`
            : `JSON 路径 ${assertion.value} 校验失败`,
        });
        ok = ok && pass;
      }
    }
    return {
      ok,
      title: ok ? "测试通过" : "测试未通过",
      details: details.length ? details : ["未配置校验项"],
      checks: checks.length
        ? checks
        : [{ ok: true, label: "未配置校验项，仅记录请求结果" }],
    };
  }

  async function sendRequest(payload: {
    name: string;
    method: HttpMethod;
    url: string;
    params: HttpFieldItem[];
    headers: HttpFieldItem[];
    body?: string;
    bodyType?: RequestDefinition["bodyType"];
    formFields?: NonNullable<RequestDefinition["formFields"]>;
  }) {
    if (!window.desktopApi?.httpSend) throw new Error("当前环境不支持请求发送");
    const requestPayload = buildHttpSendRequest(
      {
        method: payload.method,
        url: payload.url,
        params: payload.params,
        headers: payload.headers,
        body: payload.body,
        bodyType: payload.bodyType,
        formFields: payload.formFields,
      },
      variables,
    );
    const response = await window.desktopApi.httpSend({
      ...requestPayload,
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
        bodyType: selectedRequest?.bodyType,
        formFields: selectedRequest?.formFields,
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
          checks: [{ ok: false, label: getErrorMessage(result) }],
        });
        appendSingleLog(`请求失败：${getErrorMessage(result)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "测试失败";
      appendSingleLog(message);
      setSingleResult({ ok: false, error: { code: "UNKNOWN_ERROR", message } });
      setLastSummary({
        ok: false,
        title: "测试失败",
        details: [message],
        checks: [{ ok: false, label: message }],
      });
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
          bodyType: request.bodyType,
          formFields: request.formFields,
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
    const startedAt = new Date().toISOString();
    try {
      const durations: number[] = [];
      const errors: string[] = [];
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
                bodyType: selectedRequest.bodyType,
                formFields: selectedRequest.formFields,
              });
            if (response.ok) {
              success += 1;
              durations.push(response.durationMs);
            } else {
              failure += 1;
              errors.push(getErrorMessage(response));
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
      setLoadResult({
        total: loadIterations,
        success,
        failure,
        avg,
        p95,
        max,
        durations,
        errors,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
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
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-300">
                <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-violet-300" />
                  最近历史
                </div>
                <span className="text-[10px] font-normal text-zinc-600">
                  {history.length} 条
                </span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-[11px] text-zinc-500">
                {recentHistory.length ? (
                  recentHistory.map((item) => (
                    <div
                      key={item.id}
                      className="rounded bg-zinc-900/70 px-2 py-2"
                    >
                      <div className="truncate text-zinc-400" title={item.url}>
                        {item.method ?? item.protocol.toUpperCase()} {item.url}
                      </div>
                      <div className="mt-1 flex justify-between text-[10px]">
                        <span className={item.status !== undefined ? "text-emerald-400" : "text-rose-400"}>
                          {item.status ?? "失败"}
                        </span>
                        <span>{item.durationMs !== undefined ? `${item.durationMs} ms` : formatReportTime(item.createdAt)}</span>
                      </div>
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
                  <div className="mb-4 rounded border border-cyan-500/15 bg-gradient-to-r from-cyan-400/8 to-transparent p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-semibold">单次测试</h2>
                          {selectedRequest && (
                            <span className="truncate text-[11px] text-cyan-300">
                              {selectedRequest.name}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {selectedRequest?.url || "选择接口后开始配置请求"}
                        </p>
                      </div>
                      <StatusPill tone={singleLoading ? "amber" : singleResult?.ok ? "green" : singleResult ? "red" : "zinc"}>
                        {singleLoading ? "执行中" : singleResult?.ok ? "请求成功" : singleResult ? "请求失败" : "待执行"}
                      </StatusPill>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                      <span className="rounded bg-zinc-950/70 px-2 py-1 text-cyan-200">{method}</span>
                      <span>环境：{activeEnvironmentId || "默认环境"}</span>
                      <span>参数 {params.filter((item) => item.enabled && item.key.trim()).length}</span>
                      <span>请求头 {headers.filter((item) => item.enabled && item.key.trim()).length}</span>
                    </div>
                  </div>
                  <div className="mb-4 flex justify-end">
                    <button
                      onClick={() => void runSingleTest()}
                      disabled={singleLoading || !selectedRequest}
                      className="flex h-9 items-center gap-2 rounded bg-cyan-400 px-4 text-xs font-semibold text-zinc-950 disabled:opacity-40"
                    >
                      {singleLoading ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
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
                          <div className="grid grid-cols-3 gap-2">
                            <div className="rounded bg-emerald-400/8 p-2"><div className="text-[10px] text-zinc-500">状态码</div><div className="mt-1 font-semibold text-emerald-300">{singleResult.status}</div></div>
                            <div className="rounded bg-zinc-950/70 p-2"><div className="text-[10px] text-zinc-500">耗时</div><div className="mt-1 font-semibold text-zinc-200">{singleResult.durationMs} ms</div></div>
                            <div className="rounded bg-zinc-950/70 p-2"><div className="text-[10px] text-zinc-500">响应大小</div><div className="mt-1 font-semibold text-zinc-200">{formatBytes(singleResult.sizeBytes)}</div></div>
                          </div>
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
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                          <History className="h-3.5 w-3.5 text-violet-300" />
                          请求记录
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-600">
                          基于当前结果校验配置生成验证信息
                        </p>
                      </div>
                      {lastSummary && (
                        <StatusPill tone={lastSummary.ok ? "green" : "red"}>
                          {lastSummary.title}
                        </StatusPill>
                      )}
                    </div>
                    <div className="mb-3 rounded bg-zinc-950/70 px-3 py-2 text-[11px]">
                      <div className="truncate text-zinc-300" title={url}>
                        {method} {url || "未配置请求地址"}
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
                        <span>已启用校验 {assertions.filter((item) => item.enabled).length} 条</span>
                        <span>{singleResult ? "已生成结果" : "等待执行"}</span>
                      </div>
                    </div>
                    {lastSummary ? (
                      <div className="space-y-2">
                        {lastSummary.checks.map((check, index) => (
                          <div
                            key={`${check.label}-${index}`}
                            className={`flex items-start gap-2 rounded px-2.5 py-2 text-[11px] ${check.ok ? "bg-emerald-400/6 text-emerald-100" : "bg-rose-400/6 text-rose-100"}`}
                          >
                            {check.ok ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                            ) : (
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
                            )}
                            <span>{check.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded bg-zinc-950/70 px-3 py-3 text-[11px] text-zinc-600">
                        执行请求后，这里会展示每条结果校验的通过状态、期望值与实际结果。
                      </div>
                    )}
                    {singleLogs.length > 0 && (
                      <div className="mt-3 border-t border-zinc-800 pt-3 text-[10px] text-zinc-600">
                        {singleLogs[0]}
                      </div>
                    )}
                    </div>
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
            <section className="space-y-4">
              <div className="flex items-start justify-between rounded border border-amber-500/20 bg-gradient-to-br from-amber-400/10 via-[#111821] to-[#111821] p-5">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-amber-300">
                    <Gauge className="h-3.5 w-3.5" />
                    Load test
                  </div>
                  <h2 className="text-lg font-semibold text-zinc-50">接口压力测试</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    通过并发请求观察接口的吞吐能力、响应延迟与错误情况
                  </p>
                </div>
                <StatusPill tone={loadLoading ? "amber" : loadResult ? "green" : "zinc"}>
                  {loadLoading ? "执行中" : loadResult ? "已完成" : "待执行"}
                </StatusPill>
              </div>

              <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                  <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-zinc-200">
                    <FlaskConical className="h-3.5 w-3.5 text-amber-300" />
                    测试配置
                  </div>
                  <div className="mb-4 rounded bg-zinc-950/70 p-3">
                    <div className="text-[10px] text-zinc-600">测试目标</div>
                    <div className="mt-1 truncate text-xs text-zinc-200">
                      {selectedRequest
                        ? `${selectedRequest.method ?? "GET"} ${selectedRequest.name}`
                        : "请选择接口"}
                    </div>
                    <div className="mt-1 truncate text-[10px] text-zinc-600">
                      {selectedRequest?.url ?? "未选择接口"}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <label className="block text-xs text-zinc-400">
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
                        className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-amber-400/60"
                      />
                    </label>
                    <label className="block text-xs text-zinc-400">
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
                        className="mt-2 h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none focus:border-amber-400/60"
                      />
                    </label>
                  </div>
                  <div className="mt-4 rounded border border-zinc-800 p-3 text-[11px] text-zinc-500">
                    <div className="flex justify-between"><span>预计并发工作数</span><span className="text-zinc-300">{Math.min(loadConcurrency, loadIterations)}</span></div>
                    <div className="mt-2 flex justify-between"><span>当前环境</span><span className="max-w-[150px] truncate text-zinc-300">{activeEnvironmentId || "默认环境"}</span></div>
                  </div>
                  <button
                    onClick={() => void runLoadTest()}
                    disabled={loadLoading || !selectedRequest}
                    className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded bg-amber-300 px-3 text-xs font-semibold text-zinc-950 disabled:opacity-40"
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
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["成功率", loadViewData ? `${loadViewData.successRate}%` : "-", "请求通过比例", "text-emerald-300"],
                      ["吞吐量", loadViewData ? `${loadViewData.throughput} req/s` : "-", "按本次执行耗时估算", "text-cyan-300"],
                      ["P95 延迟", loadResult ? `${loadResult.p95} ms` : "-", "95% 请求低于此值", "text-violet-300"],
                      ["总请求", loadResult?.total ?? loadIterations, "本次计划执行量", "text-amber-300"],
                    ].map(([label, value, hint, color]) => (
                      <div key={label} className="rounded border border-zinc-800 bg-[#111821] p-4">
                        <div className="text-[11px] text-zinc-500">{label}</div>
                        <div className={`mt-2 text-xl font-semibold ${color}`}>{value}</div>
                        <div className="mt-1 text-[10px] text-zinc-600">{hint}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-xs font-semibold text-zinc-200">响应耗时分布</h3>
                          <p className="mt-1 text-[11px] text-zinc-500">根据本次成功请求的耗时样本统计</p>
                        </div>
                        <BarChart3 className="h-4 w-4 text-amber-300" />
                      </div>
                      {loadViewData ? (
                        <div className="flex h-44 items-end gap-2 border-b border-zinc-800 px-2">
                          {loadViewData.buckets.map((bucket) => {
                            const peak = Math.max(...loadViewData.buckets.map((item) => item.count), 1);
                            return (
                              <div key={bucket.label} className="group flex h-full flex-1 flex-col justify-end">
                                <div className="mb-1 text-center text-[10px] text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">{bucket.count}</div>
                                <div className="rounded-t bg-amber-300/75 transition-colors group-hover:bg-amber-200" style={{ height: `${Math.max(bucket.count ? 8 : 2, (bucket.count / peak) * 100)}%` }} />
                                <div className="mt-2 truncate text-center text-[9px] text-zinc-600">{bucket.label}</div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex h-44 items-center justify-center text-xs text-zinc-600">执行压测后显示耗时分布</div>
                      )}
                    </div>

                    <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-cyan-300" />
                        <h3 className="text-xs font-semibold text-zinc-200">延迟概览</h3>
                      </div>
                      <div className="space-y-3 text-xs">
                        {[
                          ["最快", loadViewData ? `${loadViewData.min} ms` : "-"],
                          ["P50 中位数", loadViewData ? `${loadViewData.p50} ms` : "-"],
                          ["平均耗时", loadResult ? `${loadResult.avg} ms` : "-"],
                          ["最大耗时", loadResult ? `${loadResult.max} ms` : "-"],
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between border-b border-zinc-800/70 pb-2 last:border-0 last:pb-0">
                            <span className="text-zinc-500">{label}</span>
                            <span className="font-medium text-zinc-200">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-zinc-200">执行结果</h3>
                        {loadResult && <span className="text-[10px] text-zinc-600">{formatReportTime(loadResult.finishedAt)}</span>}
                      </div>
                      {loadResult ? (
                        <div className="space-y-3">
                          <div className="flex h-3 overflow-hidden rounded-full bg-zinc-800">
                            <div className="bg-emerald-400" style={{ width: `${loadViewData?.successRate ?? 0}%` }} />
                            <div className="bg-rose-400" style={{ width: `${100 - (loadViewData?.successRate ?? 0)}%` }} />
                          </div>
                          <div className="flex justify-between text-[11px]"><span className="text-emerald-300">成功 {loadResult.success}</span><span className="text-rose-300">失败 {loadResult.failure}</span></div>
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
                            <div className="rounded bg-zinc-950/70 p-2">执行时长 <span className="float-right text-zinc-300">{loadViewData?.elapsedMs ?? 0} ms</span></div>
                            <div className="rounded bg-zinc-950/70 p-2">并发配置 <span className="float-right text-zinc-300">{loadConcurrency}</span></div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-xs text-zinc-600">暂无压测结果</div>
                      )}
                    </div>

                    <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
                        <h3 className="text-xs font-semibold text-zinc-200">失败原因</h3>
                      </div>
                      {loadViewData?.errorGroups.length ? (
                        <div className="space-y-2">
                          {loadViewData.errorGroups.slice(0, 4).map((item) => (
                            <div key={item.message} className="flex items-center justify-between gap-3 rounded bg-rose-400/5 px-3 py-2 text-[11px]">
                              <span className="truncate text-rose-200" title={item.message}>{item.message}</span>
                              <span className="shrink-0 text-rose-300">{item.count} 次</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-xs text-zinc-600">{loadResult ? "本次没有失败请求" : "执行压测后显示失败原因"}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {tab === "report" && (
            <section className="space-y-4">
              <div className="flex items-start justify-between rounded border border-cyan-500/20 bg-gradient-to-br from-cyan-400/10 via-[#111821] to-[#111821] p-5">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-cyan-300">
                    <Activity className="h-3.5 w-3.5" />
                    Test report
                  </div>
                  <h2 className="text-lg font-semibold text-zinc-50">测试执行报告</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    汇总最近 30 次请求，帮助快速定位稳定性与性能问题
                  </p>
                </div>
                <div className="text-right text-[11px] text-zinc-500">
                  <div>统计范围</div>
                  <div className="mt-1 text-zinc-300">最近 {reportData.items.length} 次执行</div>
                </div>
              </div>

              {!reportData.items.length ? (
                <div className="rounded border border-zinc-800 bg-[#111821] px-5 py-16 text-center">
                  <BarChart3 className="mx-auto h-8 w-8 text-zinc-700" />
                  <div className="mt-3 text-sm text-zinc-300">暂无可生成的报告</div>
                  <p className="mt-1 text-xs text-zinc-500">先执行一次单次测试、场景测试或压测。</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      ["成功率", `${reportData.successRate}%`, "基于请求是否返回响应", "text-emerald-300"],
                      ["总请求", `${reportData.items.length}`, "最近 30 次执行", "text-cyan-300"],
                      ["平均耗时", `${reportData.avg} ms`, "仅统计成功请求", "text-amber-300"],
                      ["P95 耗时", `${reportData.p95} ms`, "95% 请求低于此值", "text-violet-300"],
                      ["响应总量", formatBytes(reportData.totalSize), "成功请求响应大小", "text-sky-300"],
                    ].map(([label, value, hint, color]) => (
                      <div key={label} className="rounded border border-zinc-800 bg-[#111821] p-4">
                        <div className="text-[11px] text-zinc-500">{label}</div>
                        <div className={`mt-2 text-xl font-semibold ${color}`}>{value}</div>
                        <div className="mt-1 text-[10px] text-zinc-600">{hint}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-xs font-semibold text-zinc-200">最近执行趋势</h3>
                          <p className="mt-1 text-[11px] text-zinc-500">按执行顺序展示响应耗时，越高代表越慢</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-400" />成功</span>
                          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-400" />失败</span>
                        </div>
                      </div>
                      <div className="flex h-44 items-end gap-1.5 border-b border-zinc-800 px-1">
                        {reportData.items
                          .slice(0, 18)
                          .reverse()
                          .map((item) => {
                            const height = item.durationMs
                              ? Math.max(8, Math.round((item.durationMs / Math.max(reportData.max, 1)) * 100))
                              : 8;
                            return (
                              <div key={item.id} className="group relative flex h-full flex-1 items-end">
                                <div
                                  className={`w-full rounded-t-sm transition-opacity group-hover:opacity-70 ${item.status !== undefined ? "bg-emerald-400/75" : "bg-rose-400/75"}`}
                                  style={{ height: `${height}%` }}
                                />
                                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-300 group-hover:block">
                                  {item.durationMs !== undefined ? `${item.durationMs} ms` : "请求失败"}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      <div className="mt-3 flex justify-between text-[10px] text-zinc-600">
                        <span>最新</span>
                        <span>最慢 {reportData.max} ms</span>
                        <span>较早</span>
                      </div>
                    </div>

                    <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                        <h3 className="text-xs font-semibold text-zinc-200">执行状态</h3>
                      </div>
                      <div className="mb-4 flex items-center gap-4">
                        <div className="relative flex h-24 w-24 items-center justify-center rounded-full" style={{ background: `conic-gradient(#34d399 ${reportData.successRate}%, #fb7185 0)` }}>
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#111821] text-lg font-semibold text-zinc-100">{reportData.successRate}%</div>
                        </div>
                        <div className="space-y-3 text-xs">
                          <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />成功 <b className="ml-3 text-zinc-200">{reportData.successful.length}</b></div>
                          <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-rose-400" />失败 <b className="ml-3 text-zinc-200">{reportData.failed}</b></div>
                        </div>
                      </div>
                      <div className="border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
                        最大耗时 <span className="float-right text-zinc-300">{reportData.max} ms</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-zinc-200">接口健康排行</h3>
                        <span className="text-[10px] text-zinc-600">按调用次数排序</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-[11px]">
                          <thead className="border-b border-zinc-800 text-zinc-600">
                            <tr><th className="pb-2 font-normal">接口</th><th className="pb-2 font-normal">调用</th><th className="pb-2 font-normal">成功率</th><th className="pb-2 font-normal">平均耗时</th></tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/70">
                            {reportData.endpoints.map((item) => (
                              <tr key={item.name}>
                                <td className="max-w-[260px] truncate py-3 pr-3 text-zinc-300" title={item.name}>{item.name}</td>
                                <td className="py-3 text-zinc-500">{item.total}</td>
                                <td className="py-3">
                                  <div className="flex items-center gap-2"><span className={item.successRate >= 80 ? "text-emerald-300" : "text-rose-300"}>{item.successRate}%</span><span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800"><i className={`block h-full rounded-full ${item.successRate >= 80 ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: `${item.successRate}%` }} /></span></div>
                                </td>
                                <td className="py-3 text-zinc-500">{item.avg} ms</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded border border-zinc-800 bg-[#111821] p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Clock3 className="h-3.5 w-3.5 text-cyan-300" />
                        <h3 className="text-xs font-semibold text-zinc-200">最新执行</h3>
                      </div>
                      <div className="space-y-2">
                        {reportData.items.slice(0, 6).map((item) => (
                          <div key={item.id} className="rounded bg-zinc-950/70 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[11px] text-zinc-300">{item.method ?? item.protocol.toUpperCase()} {item.url}</span>
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${item.status !== undefined ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>{item.status ?? "失败"}</span>
                            </div>
                            <div className="mt-2 flex justify-between text-[10px] text-zinc-600"><span>{formatReportTime(item.createdAt)}</span><span>{item.durationMs !== undefined ? `${item.durationMs} ms` : "请求未完成"} · {formatBytes(item.sizeBytes)}</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {loadResult && (
                    <div className="rounded border border-cyan-500/20 bg-cyan-400/5 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <FlaskConical className="h-3.5 w-3.5 text-cyan-300" />
                        <h3 className="text-xs font-semibold text-zinc-200">最近一次压测摘要</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-5">
                        <div><span className="text-zinc-500">请求</span><b className="ml-2 text-zinc-200">{loadResult.total}</b></div>
                        <div><span className="text-zinc-500">成功</span><b className="ml-2 text-emerald-300">{loadResult.success}</b></div>
                        <div><span className="text-zinc-500">失败</span><b className="ml-2 text-rose-300">{loadResult.failure}</b></div>
                        <div><span className="text-zinc-500">P95</span><b className="ml-2 text-zinc-200">{loadResult.p95} ms</b></div>
                        <div><span className="text-zinc-500">最大</span><b className="ml-2 text-zinc-200">{loadResult.max} ms</b></div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
