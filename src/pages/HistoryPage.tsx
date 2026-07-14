import { useMemo, useState } from 'react'
import { RotateCcw, Search, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { StatusPill } from '@/components/common/StatusPill'
import type { RequestDefinition, RequestHistoryItem } from '@/shared/ipc-contracts'

function snapshotOf(item: RequestHistoryItem) {
  return item.requestSnapshot as { apiId?: string; request?: Partial<RequestDefinition> }
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const workspace = useWorkspaceStore((state) => state.workspace)
  const clearHistory = useWorkspaceStore((state) => state.clearHistory)
  const updateRequest = useWorkspaceStore((state) => state.updateRequest)
  const setActiveApiId = useWorkspaceStore((state) => state.setActiveApiId)
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState('全部方法')
  const [status, setStatus] = useState('全部状态')
  const [environment, setEnvironment] = useState('全部环境')
  const [selectedId, setSelectedId] = useState<string>()
  const history = workspace?.history ?? []
  const selected = history.find((item) => item.id === selectedId) ?? history[0]
  const filtered = useMemo(() => history.filter((item) => {
    const text = `${item.url} ${item.method ?? item.protocol} ${item.status ?? ''}`.toLowerCase()
    const matchesQuery = !query.trim() || text.includes(query.trim().toLowerCase())
    const matchesMethod = method === '全部方法' || item.method === method
    const matchesStatus = status === '全部状态' || (status === '成功' ? (item.status ?? 0) < 400 : (item.status ?? 0) >= 400)
    const matchesEnvironment = environment === '全部环境' || item.environmentId === environment
    return matchesQuery && matchesMethod && matchesStatus && matchesEnvironment
  }), [history, query, method, status, environment])

  function restore(item: RequestHistoryItem) {
    const snapshot = snapshotOf(item)
    if (snapshot.apiId && snapshot.request) {
      const current = workspace?.requests.find((request) => request.id === snapshot.apiId)
      updateRequest({ ...(current ?? {}), ...snapshot.request, id: snapshot.apiId, protocol: current?.protocol ?? item.protocol, name: current?.name ?? `${item.method ?? item.protocol} 历史请求`, params: snapshot.request.params ?? [], headers: snapshot.request.headers ?? [], url: snapshot.request.url ?? item.url, updatedAt: new Date().toISOString() } as RequestDefinition)
      setActiveApiId(snapshot.apiId)
      navigate('/http')
    }
  }

  return <div className="flex h-full flex-col overflow-hidden bg-[var(--app-bg)]">
    <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-4"><div><h1 className="text-sm font-semibold">请求历史记录</h1><p className="text-xs text-zinc-500">筛选、查看详情并恢复请求快照</p></div><button onClick={clearHistory} disabled={!history.length} className="flex h-9 items-center gap-2 rounded border border-red-500/30 px-3 text-xs text-red-200 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />清空历史</button></div>
    <div className="flex min-h-12 flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2"><label className="flex h-8 w-72 items-center gap-2 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-400"><Search className="h-3.5 w-3.5" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索路径、方法、状态" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-600" /></label><select value={method} onChange={(event) => setMethod(event.target.value)} className="h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-300"><option>全部方法</option>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-300"><option>全部状态</option><option>成功</option><option>失败</option></select><select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-300"><option value="全部环境">全部环境</option>{workspace?.environments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] overflow-hidden"><section className="min-w-0 overflow-auto p-4"><div className="overflow-hidden rounded border border-zinc-800"><table className="w-full text-left text-xs"><thead className="bg-zinc-900 text-zinc-500"><tr><th className="px-3 py-2">方法</th><th className="px-3 py-2">URL</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">耗时</th><th className="px-3 py-2">环境</th><th className="px-3 py-2">时间</th></tr></thead><tbody className="divide-y divide-zinc-800">{filtered.map((item) => <tr key={item.id} onClick={() => setSelectedId(item.id)} className={`cursor-pointer text-zinc-300 ${selected?.id === item.id ? 'bg-cyan-400/10' : 'bg-zinc-950/60 hover:bg-zinc-900'}`}><td className="px-3 py-2 font-semibold text-emerald-300">{item.method ?? item.protocol.toUpperCase()}</td><td className="max-w-[420px] truncate px-3 py-2 font-mono text-cyan-200">{item.url}</td><td className="px-3 py-2"><StatusPill tone={(item.status ?? 0) >= 400 || !item.status ? 'red' : 'green'}>{item.status ?? '失败'}</StatusPill></td><td className="px-3 py-2 font-mono text-zinc-400">{item.durationMs ?? '-'} ms</td><td className="px-3 py-2 text-zinc-400">{workspace?.environments.find((env) => env.id === item.environmentId)?.name ?? item.environmentId}</td><td className="px-3 py-2 font-mono text-zinc-500">{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody></table>{!filtered.length && <div className="p-10 text-center text-xs text-zinc-500">暂无匹配的请求记录</div>}</div></section>
      <aside className="min-w-0 overflow-auto border-l border-zinc-800 p-4">{selected ? <><div className="mb-3 flex items-center justify-between"><div className="text-xs font-medium text-zinc-300">历史详情</div><button onClick={() => restore(selected)} className="flex h-8 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950"><RotateCcw className="h-3.5 w-3.5" />恢复请求</button></div><div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-xs leading-6 text-zinc-300"><div className="text-zinc-500">请求摘要</div><div className="break-all font-mono text-cyan-200">{selected.method ?? selected.protocol.toUpperCase()} {selected.url}</div><div className="mt-3 text-zinc-500">响应摘要</div><pre className="whitespace-pre-wrap break-words font-mono text-zinc-300">{JSON.stringify(selected.responseSnapshot ?? {}, null, 2)}</pre></div></> : <div className="p-6 text-center text-xs text-zinc-500">选择一条历史记录查看详情</div>}</aside>
    </div>
  </div>
}
