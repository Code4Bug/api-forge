import { useMemo, useRef, useState } from 'react'
import { AlertCircle, Braces, Check, Database, Download, Edit3, EyeOff, Plus, Save, Trash2, Upload } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { EnvironmentVariable, ProcessVariable } from '@/shared/ipc-contracts'
import { StatusPill } from '@/components/common/StatusPill'
import { ThemedSelect } from '@/components/common/ThemedSelect'
import { Modal } from '@/components/common/Modal'

const emptyVariable = (): EnvironmentVariable => ({ id: `var-${crypto.randomUUID()}`, key: '', value: '', type: 'text', scope: 'environment' })
const emptyProcessVariable = (): ProcessVariable => ({ id: `process-${crypto.randomUUID()}`, key: '', sourceRequestId: '', jsonPath: '$.' })

export default function EnvironmentPage() {
  const {
    workspace, activeEnvironmentId, setActiveEnvironmentId, createEnvironment, updateEnvironment, deleteEnvironment,
    updateEnvironmentVariable, deleteEnvironmentVariable, updateProcessVariable, deleteProcessVariable, saveNow,
  } = useWorkspaceStore()
  const activeEnvironment = workspace?.environments.find((env) => env.id === activeEnvironmentId) ?? workspace?.environments[0]
  const httpRequests = useMemo(() => workspace?.requests.filter((request) => request.protocol === 'http') ?? [], [workspace?.requests])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeVariableType, setActiveVariableType] = useState<'environment' | 'process'>('environment')
  const [envDialog, setEnvDialog] = useState<{ id?: string; name: string }>()
  const [variableDialog, setVariableDialog] = useState<EnvironmentVariable>()
  const [processDialog, setProcessDialog] = useState<ProcessVariable>()
  const [dialogError, setDialogError] = useState('')

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

  function submitProcessVariable() {
    if (!processDialog?.key.trim()) return setDialogError('请输入变量名')
    if (!processDialog.sourceRequestId) return setDialogError('请选择来源接口')
    if (!processDialog.jsonPath.trim().startsWith('$')) return setDialogError('JSONPath 必须以 $ 开头')
    updateProcessVariable(processDialog)
    setProcessDialog(undefined)
    setDialogError('')
  }

  function exportEnvironments() {
    if (!workspace) return
    const blob = new Blob([JSON.stringify({ version: 2, environments: workspace.environments, processVariables: workspace.processVariables ?? [] }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'api-forge-variables.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importEnvironments(file?: File) {
    if (!file || !workspace) return
    try {
      const parsed = JSON.parse(await file.text()) as { environments?: typeof workspace.environments; processVariables?: ProcessVariable[] } | typeof workspace.environments
      const environments = Array.isArray(parsed) ? parsed : parsed.environments
      if (!Array.isArray(environments) || environments.some((env) => !env.id || !env.name || !Array.isArray(env.variables))) throw new Error('invalid')
      const imported = environments.map((env) => ({ ...env, id: workspace.environments.some((item) => item.id === env.id) ? `env-${crypto.randomUUID()}` : env.id, variables: env.variables.map((item) => ({ ...item, id: `var-${crypto.randomUUID()}` })) }))
      imported.forEach((env) => updateEnvironment(env))
      if (!Array.isArray(parsed)) parsed.processVariables?.forEach((item) => updateProcessVariable({ ...item, id: `process-${crypto.randomUUID()}` }))
      if (imported.length) setActiveEnvironmentId(imported[0].id)
      if (!imported.length) saveNow()
    } catch {
      window.alert('导入文件格式无效，请选择 API Forge 变量 JSON 文件。')
    }
  }

  const processVariables = workspace?.processVariables ?? []
  const sourceName = (requestId: string) => workspace?.requests.find((item) => item.id === requestId)?.name ?? '接口已删除'

  return <div className="flex h-full flex-col overflow-hidden bg-[var(--app-bg)]">
    <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-4"><div><h1 className="text-sm font-semibold">变量管理</h1><p className="text-xs text-zinc-500">维护环境变量和接口响应生成的过程变量</p></div><div className="flex gap-2"><input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { void importEnvironments(event.target.files?.[0]); event.currentTarget.value = '' }} /><button onClick={() => fileInputRef.current?.click()} className="flex h-9 items-center gap-2 rounded border border-zinc-700 px-3 text-xs text-zinc-300"><Upload className="h-3.5 w-3.5" />导入</button><button onClick={exportEnvironments} className="flex h-9 items-center gap-2 rounded border border-zinc-700 px-3 text-xs text-zinc-300"><Download className="h-3.5 w-3.5" />导出</button><button onClick={saveNow} className="flex h-9 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950"><Save className="h-3.5 w-3.5" />保存</button></div></div>
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_320px] overflow-hidden">
      <aside className="min-h-0 overflow-y-auto border-r border-zinc-800 p-3"><div className="mb-2 flex items-center justify-between px-2 text-xs font-medium text-zinc-400"><span>环境列表</span><button onClick={() => setEnvDialog({ name: '' })} className="rounded p-1 text-zinc-400 hover:bg-zinc-800" title="新增环境"><Plus className="h-4 w-4" /></button></div><div className="space-y-1">{workspace?.environments.map((env) => <div key={env.id} className="flex items-center gap-1"><button onClick={() => setActiveEnvironmentId(env.id)} className={env.id === activeEnvironment?.id ? 'h-8 min-w-0 flex-1 rounded bg-cyan-400/15 px-3 text-left text-xs text-cyan-100' : 'h-8 min-w-0 flex-1 rounded px-3 text-left text-xs text-zinc-500 hover:bg-zinc-800'}>{env.name}</button><button onClick={() => setEnvDialog({ id: env.id, name: env.name })} className="rounded p-1 text-zinc-500 hover:bg-zinc-800" title="重命名环境"><Edit3 className="h-3 w-3" /></button><button disabled={workspace.environments.length <= 1} onClick={() => deleteEnvironment(env.id)} className="rounded p-1 text-zinc-500 hover:bg-rose-500/20 disabled:opacity-30" title="删除环境"><Trash2 className="h-3 w-3" /></button></div>)}</div></aside>
      <section className="min-w-0 overflow-auto p-4">
        <div className="mb-4 flex items-center justify-between gap-3"><div className="inline-flex rounded border border-zinc-700 bg-zinc-950 p-1"><button onClick={() => setActiveVariableType('environment')} className={`flex h-7 items-center gap-2 rounded px-3 text-xs ${activeVariableType === 'environment' ? 'bg-cyan-400/15 text-cyan-200' : 'text-zinc-500 hover:text-zinc-300'}`}><Database className="h-3.5 w-3.5" />环境变量</button><button onClick={() => setActiveVariableType('process')} className={`flex h-7 items-center gap-2 rounded px-3 text-xs ${activeVariableType === 'process' ? 'bg-cyan-400/15 text-cyan-200' : 'text-zinc-500 hover:text-zinc-300'}`}><Braces className="h-3.5 w-3.5" />过程变量</button></div><button onClick={() => activeVariableType === 'environment' ? setVariableDialog(emptyVariable()) : setProcessDialog(emptyProcessVariable())} className="flex h-8 items-center gap-2 rounded border border-zinc-700 px-3 text-xs text-zinc-300"><Plus className="h-3.5 w-3.5" />新增变量</button></div>
        {activeVariableType === 'environment' ? <div className="overflow-hidden rounded border border-zinc-800"><table className="w-full text-left text-xs"><thead className="bg-zinc-900 text-zinc-500"><tr><th className="px-3 py-2">键名</th><th className="px-3 py-2">当前值</th><th className="px-3 py-2">类型</th><th className="px-3 py-2">描述</th><th className="px-3 py-2">操作</th></tr></thead><tbody className="divide-y divide-zinc-800">{activeEnvironment?.variables.map((item) => <tr key={item.id} className="bg-zinc-950/60"><td className="px-3 py-2 font-mono text-cyan-200">{item.key}</td><td className="max-w-64 truncate px-3 py-2 font-mono text-zinc-300">{item.type === 'secret' ? '********' : item.value}</td><td className="px-3 py-2">{item.type === 'secret' ? <StatusPill tone="amber"><EyeOff className="mr-1 h-3 w-3" />密钥</StatusPill> : <StatusPill tone="zinc">文本</StatusPill>}</td><td className="px-3 py-2 text-zinc-500">{item.description ?? '-'}</td><td className="px-3 py-2"><button onClick={() => setVariableDialog(item)} className="mr-1 rounded p-1 text-zinc-500 hover:bg-zinc-800" title="编辑变量"><Edit3 className="h-3 w-3" /></button><button onClick={() => deleteEnvironmentVariable(activeEnvironment.id, item.id)} className="rounded p-1 text-zinc-500 hover:bg-rose-500/20" title="删除变量"><Trash2 className="h-3 w-3" /></button></td></tr>)}</tbody></table></div>
          : <div className="overflow-hidden rounded border border-zinc-800"><table className="w-full text-left text-xs"><thead className="bg-zinc-900 text-zinc-500"><tr><th className="px-3 py-2">键名</th><th className="px-3 py-2">来源接口</th><th className="px-3 py-2">JSONPath</th><th className="px-3 py-2">当前值</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">操作</th></tr></thead><tbody className="divide-y divide-zinc-800">{processVariables.map((item) => <tr key={item.id} className="bg-zinc-950/60"><td className="px-3 py-2 font-mono text-cyan-200">{item.key}</td><td className="max-w-48 truncate px-3 py-2 text-zinc-300">{sourceName(item.sourceRequestId)}</td><td className="px-3 py-2 font-mono text-amber-200">{item.jsonPath}</td><td className="max-w-56 truncate px-3 py-2 font-mono text-zinc-300" title={item.currentValue}>{item.currentValue ?? '-'}</td><td className="px-3 py-2">{item.lastError ? <StatusPill tone="red">提取失败</StatusPill> : item.currentValue !== undefined ? <StatusPill tone="green">已获取</StatusPill> : <StatusPill tone="zinc">待调用</StatusPill>}</td><td className="px-3 py-2"><button onClick={() => { setDialogError(''); setProcessDialog(item) }} className="mr-1 rounded p-1 text-zinc-500 hover:bg-zinc-800" title="编辑过程变量"><Edit3 className="h-3 w-3" /></button><button onClick={() => deleteProcessVariable(item.id)} className="rounded p-1 text-zinc-500 hover:bg-rose-500/20" title="删除过程变量"><Trash2 className="h-3 w-3" /></button></td></tr>)}{processVariables.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-600">暂无过程变量</td></tr>}</tbody></table></div>}
      </section>
      <aside className="overflow-y-auto border-l border-zinc-800 p-4"><div className="mb-3 text-xs font-medium text-zinc-300">引用方式</div><div className="rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300"><div className="text-zinc-500">请求中输入</div><div>{'Authorization: Bearer {{access_token}}'}</div><div className="mt-3 text-zinc-500">来源响应路径</div><div className="text-amber-200">$.data.accessToken</div></div><div className="mt-4 text-[11px] leading-5 text-zinc-500"><p>调用来源接口成功后，系统会从 JSON 响应中提取最新值。</p><p className="mt-2">支持点号属性和数组下标，例如 <code className="text-cyan-300">$.data.items[0].id</code>。</p>{activeVariableType === 'process' && processVariables.some((item) => item.lastError) && <div className="mt-4 space-y-2">{processVariables.filter((item) => item.lastError).map((item) => <div key={item.id} className="flex gap-2 rounded border border-rose-500/20 bg-rose-500/5 p-2 text-rose-300"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><strong>{item.key}</strong>：{item.lastError}</span></div>)}</div>}</div></aside>
    </div>
    <Modal open={Boolean(envDialog)} title={envDialog?.id ? '重命名环境' : '新增环境'} onClose={() => setEnvDialog(undefined)} className="max-w-sm">
      {envDialog && <form onSubmit={(event) => { event.preventDefault(); submitEnvironment() }}>
        <input autoFocus value={envDialog.name} onChange={(event) => setEnvDialog({ ...envDialog, name: event.target.value })} className="h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-xs" placeholder="环境名称" />
        <button className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded bg-cyan-400 text-xs font-semibold text-zinc-950"><Check className="h-3.5 w-3.5" />确定</button>
      </form>}
    </Modal>
    <Modal open={Boolean(variableDialog)} title={variableDialog && activeEnvironment?.variables.some((item) => item.id === variableDialog.id) ? '编辑变量' : '新增变量'} onClose={() => setVariableDialog(undefined)} className="max-w-sm">
      {variableDialog && <form onSubmit={(event) => { event.preventDefault(); submitVariable() }}>
        {(['key', 'value', 'description'] as const).map((key) => <label key={key} className="mt-2 block text-xs text-zinc-400">{key === 'key' ? '变量名' : key === 'value' ? '变量值' : '描述'}<input value={variableDialog[key] ?? ''} onChange={(event) => setVariableDialog({ ...variableDialog, [key]: event.target.value })} className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-xs" /></label>)}
        <label className="mt-2 block text-xs text-zinc-400">类型<ThemedSelect className="mt-1" value={variableDialog.type} options={[{ value: 'text' as const, label: '文本' }, { value: 'secret' as const, label: '密钥' }]} onChange={(type) => setVariableDialog({ ...variableDialog, type })} /></label>
        <button className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded bg-cyan-400 text-xs font-semibold text-zinc-950"><Check className="h-3.5 w-3.5" />保存变量</button>
      </form>}
    </Modal>
    <Modal open={Boolean(processDialog)} title={processDialog && processVariables.some((item) => item.id === processDialog.id) ? '编辑过程变量' : '新增过程变量'} onClose={() => { setProcessDialog(undefined); setDialogError('') }} className="max-w-md">
      {processDialog && <form onSubmit={(event) => { event.preventDefault(); submitProcessVariable() }}>
        <label className="block text-xs text-zinc-400">变量名<input autoFocus value={processDialog.key} onChange={(event) => setProcessDialog({ ...processDialog, key: event.target.value })} className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 font-mono text-xs" placeholder="access_token" /></label>
        <label className="mt-3 block text-xs text-zinc-400">来源接口
      <ThemedSelect className="mt-1" value={processDialog.sourceRequestId} options={[{ value: '', label: '请选择 HTTP 接口' }, ...httpRequests.map((request) => ({ value: request.id, label: request.name }))]} onChange={(sourceRequestId) => setProcessDialog({ ...processDialog, sourceRequestId })} />
    </label>
        <label className="mt-3 block text-xs text-zinc-400">响应 JSONPath<input value={processDialog.jsonPath} onChange={(event) => setProcessDialog({ ...processDialog, jsonPath: event.target.value })} className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 font-mono text-xs" placeholder="$.data.accessToken" /></label>
        <label className="mt-3 block text-xs text-zinc-400">描述<input value={processDialog.description ?? ''} onChange={(event) => setProcessDialog({ ...processDialog, description: event.target.value })} className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-xs" /></label>
        {dialogError && <div className="mt-3 text-xs text-rose-300">{dialogError}</div>}
        <button className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded bg-cyan-400 text-xs font-semibold text-zinc-950"><Check className="h-3.5 w-3.5" />保存过程变量</button>
      </form>}
    </Modal>
  </div>
}
