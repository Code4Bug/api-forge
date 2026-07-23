import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileUp } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { ThemedSelect } from "@/components/common/ThemedSelect";
import type { ApiTreeNode, Protocol } from "@/shared/ipc-contracts";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { parseApiImportText } from "@/utils/api-import";

function flattenFolders(nodes: ApiTreeNode[]): ApiTreeNode[] {
  return nodes.flatMap((node) =>
    node.type === "folder"
      ? [node, ...flattenFolders(node.children ?? [])]
      : [],
  );
}

function getImportState(state: unknown) {
  if (!state || typeof state !== "object") return {};
  const record = state as Record<string, unknown>;
  return {
    parentId: typeof record.parentId === "string" ? record.parentId : undefined,
    text: typeof record.text === "string" ? record.text : "",
    source:
      record.source === "clipboard"
        ? ("clipboard" as const)
        : (undefined as "clipboard" | undefined),
  };
}

export default function ApiImportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspace, createApi, updateRequest, setActiveApiId } =
    useWorkspaceStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [parentId, setParentId] = useState<string | undefined>();
  const [source, setSource] = useState<"clipboard" | undefined>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const state = getImportState(location.state);
    setText(state.text);
    setParentId(state.parentId);
    setSource(state.source);
    setStatus("");
  }, [location.key, location.state]);

  const parsed = text ? parseApiImportText(text) : undefined;
  const folders = flattenFolders(workspace?.apiTree ?? []);

  async function handleSubmit() {
    if (!parsed || parsed.items.length === 0 || busy) return;
    setBusy(true);
    setStatus("");
    const folderExists =
      parentId &&
      folders.some((folder) => folder.id === parentId);
    const targetParentId = folderExists ? parentId : undefined;
    const createdIds: string[] = [];
    parsed.items.forEach((item) => {
      const id = createApi(targetParentId, {
        name: item.name,
        protocol: item.protocol,
        method: item.method,
        url: item.url,
        headers: item.headers,
        body: item.body,
      });
      if (!id) return;
      createdIds.push(id);
      updateRequest({
        id,
        name: item.name,
        description: item.description,
        protocol: item.protocol,
        method: item.method,
        url: item.url,
        params: item.params,
        headers: item.headers,
        body: item.body,
        bodyType: item.bodyType,
        formFields: item.formFields,
        folderId: targetParentId,
        updatedAt: new Date().toISOString(),
      });
    });
    if (createdIds.length === 0) {
      setStatus("导入失败");
      setBusy(false);
      return;
    }
    if (source === "clipboard") {
      const clearClipboard = window.desktopApi?.clearClipboard;
      if (clearClipboard) {
        await clearClipboard().catch(() => undefined);
      }
    }
    const activeApiId = createdIds[0];
    setActiveApiId(activeApiId);
    window.dispatchEvent(
      new CustomEvent("api-forge:open-imported-apis", {
        detail: {
          ids: createdIds,
          activeApiId,
          protocol: parsed.items[0]?.protocol ?? ("http" as Protocol),
          source,
        },
      }),
    );
    setStatus(`已导入 ${createdIds.length} 个接口`);
    setBusy(false);
    navigate(`/${parsed.items[0]?.protocol ?? "http"}`);
  }

  return (
    <div className="h-full min-h-0 overflow-auto bg-[#0b0f14] px-5 py-6 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/http")}
            className="inline-flex h-9 items-center gap-2 rounded border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回
          </button>
          <div>
            <h1 className="text-lg font-semibold">导入 API</h1>
            <p className="text-xs text-zinc-500">
              粘贴 cURL、Postman Collection 或 OpenAPI / Swagger JSON，然后导入到指定目录。
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-xl border border-zinc-800 bg-[#111821] p-5 shadow-2xl">
            <label className="block text-xs text-zinc-400">
              导入内容
              <textarea
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="mt-2 min-h-[360px] w-full resize-y rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-400/60"
                placeholder="粘贴 cURL 命令、Postman Collection JSON 或 OpenAPI / Swagger JSON"
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt,.curl,application/json,text/plain"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                void file.text().then((value) => setText(value));
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-9 items-center gap-2 rounded border border-zinc-700 px-4 text-xs text-zinc-300 hover:bg-zinc-800"
            >
                <FileUp className="h-3.5 w-3.5" />
                选择文件
              </button>
              <span className="text-xs text-zinc-500">
                {parsed
                  ? `已识别为 ${parsed.sourceLabel} · ${parsed.items.length} 个接口`
                  : "等待识别导入内容"}
              </span>
            </div>
            {parsed?.items.length ? (
              <div className="mt-4 rounded border border-zinc-700 bg-zinc-950/60 p-3 text-xs text-zinc-300">
                <div className="font-medium text-zinc-100">导入预览</div>
                <ul className="mt-2 space-y-1 text-zinc-400">
                  {parsed.items.slice(0, 4).map((item) => (
                    <li key={item.name}>{item.name}</li>
                  ))}
                  {parsed.items.length > 4 && (
                    <li>还有 {parsed.items.length - 4} 个接口未显示</li>
                  )}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate("/http")}
                className="h-9 rounded border border-zinc-700 px-4 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!parsed?.items.length || busy}
                className="h-9 rounded bg-cyan-400 px-4 text-xs font-semibold text-zinc-950 disabled:opacity-40"
              >
                {busy
                  ? "导入中..."
                  : `导入 ${parsed?.items.length ?? 0} 个接口`}
              </button>
            </div>
            {status && (
              <div className="mt-3 text-xs text-emerald-300">{status}</div>
            )}
          </section>

          <aside className="space-y-4 rounded-xl border border-zinc-800 bg-[#111821] p-5">
            <div className="text-sm font-semibold">目标目录</div>
            <ThemedSelect
              value={parentId ?? ""}
              options={[
                { value: "", label: "根目录" },
                ...folders.map((folder) => ({
                  value: folder.id,
                  label: folder.name,
                })),
              ]}
              onChange={(value) => setParentId(value || undefined)}
            />
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-6 text-zinc-400">
              支持从目录右键直接进入，目录会默认带入这里。
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
