import { useRef, useState } from 'react'
import { Check, Download, Edit3, EyeOff, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { EnvironmentVariable } from '@/shared/ipc-contracts'
import { StatusPill } from '@/components/common/StatusPill'

const emptyVariable = (): EnvironmentVariable => ({ id: `var-${crypto.randomUUID()}`, key: '', value: '', type: 'text', scope: 'environment' })

export default function EnvironmentPage() {
  const { workspace, activeEnvironmentId, setActiveEnvironmentId, createEnvironment, updateEnvironment, deleteEnvironment, updateEnvironmentVariable, deleteEnvironmentVariable, saveNow } = useWorkspaceStore()
  const activeEnvironment = workspace?.environments.find((env) => env.id === activeEnvironmentId) ?? workspace?.environments[0]
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [envDialog, setEnvDialog] = useState<{ id?: string; name: string }>()
  const [variableDialog, setVariableDialog] = useState<EnvironmentVariable>()

  function submitEnvironment() {
    if (!envDialog?.name.trim()) return
    if (envDialog.id) updateEnvironment({ ...workspace!.environments.find((item) => item.id === envDialog.id)!, name: envDialog.name })
    else createEnvironment(envDialog.name)
    setEnvDialog(undefined)
  }

  function submitVariable() {
    if (!activeEnvironment || !variableDialog?.key.trim()) return
    updateEnvironmentVariable(activeEnvironment.id, variableDialog)
    setVariableDialog(undefined)
  }

  function exportEnvironments() {
    if (!workspace) return
    const blob = new Blob([JSON.stringify({ version: 1, environments: workspace.environments }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'api-forge-environments.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importEnvironments(file?: File) {
    if (!file || !workspace) return
    try {
      const parsed = JSON.parse(await file.text()) as { environments?: typeof workspace.environments } | typeof workspace.environments
      const environments = Array.isArray(parsed) ? parsed : parsed.environments
      if (!Array.isArray(environments) || environments.some((env) => !env.id || !env.name || !Array.isArray(env.variables))) throw new Error('invalid')
      const imported = environments.map((env) => ({ ...env, id: workspace.environments.some((item) => item.id === env.id) ? `env-${crypto.randomUUID()}` : env.id, variables: env.variables.map((item) => ({ ...item, id: `var-${crypto.randomUUID()}` })) }))
      imported.forEach((env) => updateEnvironment(env))
      if (imported.length) setActiveEnvironmentId(imported[0].id)
      if (!imported.length) saveNow()
    } catch {
      window.alert('导入文件格式无效，请选择 API Forge 环境 JSON 文件。')
    }
  }

  return <div className="flex h-full flex-col overflow-hidden bg-[var(--app-bg)]">
    <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-4"><div><h1 className="text-sm font-semibold">环境变量管理</h1><p className="text-xs text-zinc-500">维护环境、变量和全局 Headers</p></div><div className="flex gap-2"><input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { void importEnvironments(event.target.files?.[0]); event.currentTarget.value = '' }} /><button onClick={() => fileInputRef.current?.click()} className="flex h-9 items-center gap-2 rounded border border-zinc-700 px-3 text-xs text-zinc-300"><Upload className="h-3.5 w-3.5" />导入</button><button onClick={exportEnvironments} className="flex h-9 items-center gap-2 rounded border border-zinc-700 px-3 text-xs text-zinc-300"><Download className="h-3.5 w-3.5" />导出</button><button onClick={saveNow} className="flex h-9 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950"><Save className="h-3.5 w-3.5" />保存</button></div></div>
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_360px] overflow-hidden"><aside className="min-h-0 overflow-y-auto border-r border-zinc-800 p-3"><div className="mb-2 flex items-center justify-between px-2 text-xs font-medium text-zinc-400"><span>环境列表</span><button onClick={() => setEnvDialog({ name: "" })} className="rounded p-1 text-zinc-400 hover:bg-zinc-800" title="新增环境"><Plus className="h-4 w-4" /></button></div><div className="space-y-1">{workspace?.environments.map((env) => <div key={env.id} className="flex items-center gap-1"><button onClick={() => setActiveEnvironmentId(env.id)} className={env.id === activeEnvironment?.id ? 'h-8 min-w-0 flex-1 rounded bg-cyan-400/15 px-3 text-left text-xs text-cyan-100' : 'h-8 min-w-0 flex-1 rounded px-3 text-left text-xs text-zinc-500 hover:bg-zinc-800'}>{env.name}</button><button onClick={() => setEnvDialog({ id: env.id, name: env.name })} className="rounded p-1 text-zinc-500 hover:bg-zinc-800" title="重命名环境"><Edit3 className="h-3 w-3" /></button><button disabled={workspace.environments.length <= 1} onClick={() => deleteEnvironment(env.id)} className="rounded p-1 text-zinc-500 hover:bg-rose-500/20 disabled:opacity-30" title="删除环境"><Trash2 className="h-3 w-3" /></button></div>)}<button onClick={() => setEnvDialog({ name: '' })} className="rounded p-1 text-zinc-400 hover:bg-zinc-800" title="新增环境"><Plus className="h-4 w-4" /></button></div></aside><section className="min-w-0 overflow-auto p-4"><div className="mb-3 flex items-center justify-between"><div className="text-xs font-medium text-zinc-300">变量表格</div><button onClick={() => setVariableDialog(emptyVariable())} className="flex h-8 items-center gap-2 rounded border border-zinc-700 px-3 text-xs text-zinc-300"><Plus className="h-3.5 w-3.5" />新增变量</button></div><div className="overflow-hidden rounded border border-zinc-800"><table className="w-full text-left text-xs"><thead className="bg-zinc-900 text-zinc-500"><tr><th className="px-3 py-2">键名</th><th className="px-3 py-2">当前值</th><th className="px-3 py-2">类型</th><th className="px-3 py-2">作用域</th><th className="px-3 py-2">描述</th><th className="px-3 py-2">操作</th></tr></thead><tbody className="divide-y divide-zinc-800">{activeEnvironment?.variables.map((item) => <tr key={item.id} className="bg-zinc-950/60"><td className="px-3 py-2 font-mono text-cyan-200">{item.key}</td><td className="px-3 py-2 font-mono text-zinc-300">{item.type === 'secret' ? '********' : item.value}</td><td className="px-3 py-2">{item.type === 'secret' ? <StatusPill tone="amber"><EyeOff className="mr-1 h-3 w-3" />密钥</StatusPill> : <StatusPill tone="zinc">文本</StatusPill>}</td><td className="px-3 py-2 text-zinc-400">{item.scope}</td><td className="px-3 py-2 text-zinc-500">{item.description ?? '-'}</td><td className="px-3 py-2"><button onClick={() => setVariableDialog(item)} className="mr-1 rounded p-1 text-zinc-500 hover:bg-zinc-800" title="编辑变量"><Edit3 className="h-3 w-3" /></button><button onClick={() => deleteEnvironmentVariable(activeEnvironment.id, item.id)} className="rounded p-1 text-zinc-500 hover:bg-rose-500/20" title="删除变量"><Trash2 className="h-3 w-3" /></button></td></tr>)}</tbody></table></div></section><aside className="border-l border-zinc-800 p-4"><div className="mb-3 text-xs font-medium text-zinc-300">地址预览</div><div className="rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300"><div className="text-zinc-500">输入</div><div>{'{{base_url}}/v1/orders/{id}'}</div><div className="mt-3 text-zinc-500">解析后</div><div className="text-emerald-200">{activeEnvironment?.variables.find((item) => item.key === 'base_url')?.value}/v1/orders/1001</div></div><div className="mt-4 text-xs font-medium text-zinc-300">全局 Headers</div></aside></div>
    {envDialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><form onSubmit={(event) => { event.preventDefault(); submitEnvironment() }} className="w-full max-w-sm rounded border border-zinc-700 bg-zinc-950 p-4"><div className="mb-3 flex items-center justify-between text-sm font-semibold">{envDialog.id ? '重命名环境' : '新增环境'}<button type="button" onClick={() => setEnvDialog(undefined)}><X className="h-4 w-4" /></button></div><input autoFocus value={envDialog.name} onChange={(event) => setEnvDialog({ ...envDialog, name: event.target.value })} className="h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-xs" placeholder="环境名称" /><button className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded bg-cyan-400 text-xs font-semibold text-zinc-950"><Check className="h-3.5 w-3.5" />确定</button></form></div>}
    {variableDialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><form onSubmit={(event) => { event.preventDefault(); submitVariable() }} className="w-full max-w-sm rounded border border-zinc-700 bg-zinc-950 p-4"><div className="mb-3 flex items-center justify-between text-sm font-semibold">{activeEnvironment?.variables.some((item) => item.id === variableDialog.id) ? '编辑变量' : '新增变量'}<button type="button" onClick={() => setVariableDialog(undefined)}><X className="h-4 w-4" /></button></div>{(['key', 'value', 'description'] as const).map((key) => <label key={key} className="mt-2 block text-xs text-zinc-400">{key === 'key' ? '变量名' : key === 'value' ? '变量值' : '描述'}<input value={variableDialog[key] ?? ''} onChange={(event) => setVariableDialog({ ...variableDialog, [key]: event.target.value })} className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-xs" /></label>)}<label className="mt-2 block text-xs text-zinc-400">类型<select value={variableDialog.type} onChange={(event) => setVariableDialog({ ...variableDialog, type: event.target.value as EnvironmentVariable['type'] })} className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-xs"><option value="text">文本</option><option value="secret">密钥</option></select></label><button className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded bg-cyan-400 text-xs font-semibold text-zinc-950"><Check className="h-3.5 w-3.5" />保存变量</button></form></div>}
  </div>
}
