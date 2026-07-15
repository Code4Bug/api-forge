import { useEffect, useState } from 'react'
import { Check, Clock3, Droplets, Eye, EyeOff, Leaf, Monitor, Moon, Palette, Save, Sun, Sunset, Waves, Bot } from 'lucide-react'
import { themePresets, useTheme, type Theme, type ThemeConfig } from '@/hooks/useTheme'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { LargeModelConfig } from '@/shared/ipc-contracts'

const themes: Array<{ id: Theme; name: string; description: string; icon: typeof Sun }> = [
  { id: 'dark', name: '深色', description: '适合低光环境', icon: Moon },
  { id: 'light', name: '浅色', description: '清晰明亮的界面', icon: Sun },
  { id: 'system', name: '跟随系统', description: '根据系统偏好自动切换', icon: Monitor },
]

const colorThemes: Array<{ id: Theme; name: string; description: string; icon: typeof Sun }> = [
  { id: 'dim', name: '深色高对比', description: '更强的文字和边界对比', icon: Palette },
  { id: 'ocean', name: '海洋蓝', description: '冷静通透的蓝绿色', icon: Waves },
  { id: 'forest', name: '森林绿', description: '沉稳自然的绿色', icon: Leaf },
  { id: 'violet', name: '紫罗兰', description: '柔和优雅的紫色', icon: Droplets },
  { id: 'sunset', name: '落日橙', description: '温暖明快的橙色', icon: Sunset },
]

export default function SettingsPage() {
  const { theme, setTheme, customTheme, saveCustomTheme } = useTheme()
  const { autoSaveEnabled, autoSaveInterval, setAutoSaveSettings, saveNow } = useWorkspaceStore()
  const { workspace, updateLargeModelConfig } = useWorkspaceStore()
  const [customColors, setCustomColors] = useState<ThemeConfig>(customTheme)
  const [modelConfig, setModelConfig] = useState<LargeModelConfig>(workspace?.preferences.largeModel ?? { enabled: false, provider: 'OpenAI 兼容', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 2048 })
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => setCustomColors(customTheme), [customTheme])
  useEffect(() => { if (workspace?.preferences.largeModel) setModelConfig(workspace.preferences.largeModel) }, [workspace?.preferences.largeModel])

  function updateModelConfig(patch: Partial<LargeModelConfig>) {
    const next = { ...modelConfig, ...patch }
    setModelConfig(next)
    updateLargeModelConfig(next)
  }

  function updateCustomColor(key: keyof ThemeConfig, value: string) {
    setCustomColors((current) => ({ ...current, [key]: value }))
  }

  return <div className="flex h-full flex-col overflow-auto bg-[var(--app-bg)]">
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
      <div><h1 className="text-sm font-semibold">系统设置</h1><p className="text-xs text-zinc-500">调整界面外观和工作区保存行为</p></div>
      <button onClick={saveNow} className="flex h-9 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950"><Save className="h-3.5 w-3.5" />立即保存</button>
    </div>
    <div className="mx-auto w-full max-w-3xl space-y-6 p-5">
      <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="mb-4 flex items-center gap-2"><Palette className="h-4 w-4 text-cyan-300" /><h2 className="text-sm font-medium">主题设置</h2></div>
        <div className="mb-3 text-xs font-medium text-zinc-300">默认主题</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {themes.map(({ id, name, description, icon: Icon }) => <button key={id} onClick={() => setTheme(id)} style={{ borderColor: themePresets[id as keyof typeof themePresets]?.accent }} className={`flex items-center gap-3 rounded border p-3 text-left ${theme === id ? 'bg-cyan-400/10' : 'border-zinc-800 hover:border-zinc-600'}`}><span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: themePresets[id as keyof typeof themePresets]?.accent }} /><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{name}</span><span className="mt-1 block text-[11px] text-zinc-500">{description}</span></span><Icon className="h-4 w-4 text-zinc-400" />{theme === id && <Check className="h-4 w-4 text-cyan-300" />}</button>)}
        </div>
        <div className="mt-5 border-t border-zinc-800 pt-4">
          <div className="mb-3 text-xs font-medium text-zinc-300">更多主题色</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {colorThemes.map(({ id, name, description, icon: Icon }) => <button key={id} onClick={() => setTheme(id)} style={{ borderColor: themePresets[id as keyof typeof themePresets]?.accent }} className={`flex items-center gap-3 rounded border p-3 text-left ${theme === id ? 'bg-cyan-400/10' : 'border-zinc-800 hover:border-zinc-600'}`}><span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: themePresets[id as keyof typeof themePresets]?.accent }} /><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{name}</span><span className="mt-1 block text-[11px] text-zinc-500">{description}</span></span><Icon className="h-4 w-4 text-zinc-400" />{theme === id && <Check className="h-4 w-4 text-cyan-300" />}</button>)}
          </div>
          <div className="mt-5 border-t border-zinc-800 pt-4">
            <div className="mb-3 text-xs font-medium text-zinc-300">自定义主题色</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([['background', '背景色'], ['surface', '面板色'], ['raised', '高亮面板'], ['border', '边框色'], ['text', '文字色'], ['accent', '强调色']] as Array<[keyof ThemeConfig, string]>).map(([key, label]) => <label key={key} className="flex items-center justify-between gap-3 text-xs text-zinc-400">{label}<span className="flex items-center gap-2"><input type="color" value={customColors[key]} onChange={(event) => updateCustomColor(key, event.target.value)} className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5" /><code className="w-16 text-right text-[10px] text-zinc-500">{customColors[key]}</code></span></label>)}
          </div>
          <button onClick={() => saveCustomTheme(customColors)} className="mt-4 flex h-9 items-center gap-2 rounded border border-cyan-400/50 px-3 text-xs text-cyan-200 hover:bg-cyan-400/10"><Palette className="h-3.5 w-3.5" />保存并应用自定义主题</button>
        </div>
        </div>
      </section>
      <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="mb-4 flex items-center gap-2"><Bot className="h-4 w-4 text-violet-300" /><h2 className="text-sm font-medium">大模型配置</h2></div>
        <label className="flex items-center justify-between gap-4 text-xs text-zinc-300"><span><span className="block font-medium">启用大模型</span><span className="mt-1 block text-[11px] text-zinc-500">用于智能生成、分析和辅助调试</span></span><input type="checkbox" checked={modelConfig.enabled} onChange={(event) => updateModelConfig({ enabled: event.target.checked })} className="h-4 w-4 accent-violet-400" /></label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([['provider', '服务商', '例如：OpenAI、通义千问'], ['baseUrl', '接口地址', 'https://api.openai.com/v1'], ['model', '模型名称', 'gpt-4o-mini']] as Array<[keyof LargeModelConfig, string, string]>).map(([key, label, placeholder]) => <label key={key} className="text-xs text-zinc-400"><span className="mb-1 block">{label}</span><input value={String(modelConfig[key])} onChange={(event) => updateModelConfig({ [key]: event.target.value })} placeholder={placeholder} disabled={!modelConfig.enabled} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-violet-400 disabled:opacity-50" /></label>)}
          <label className="text-xs text-zinc-400"><span className="mb-1 block">API Key</span><span className="flex h-9 items-center rounded border border-zinc-700 bg-zinc-950 focus-within:border-violet-400"><input type={showApiKey ? 'text' : 'password'} value={modelConfig.apiKey} onChange={(event) => updateModelConfig({ apiKey: event.target.value })} placeholder="sk-..." disabled={!modelConfig.enabled} className="min-w-0 flex-1 bg-transparent px-2 text-xs text-zinc-200 outline-none disabled:opacity-50" /><button type="button" onClick={() => setShowApiKey((value) => !value)} className="p-2 text-zinc-500 hover:text-zinc-200" title={showApiKey ? '隐藏 API Key' : '显示 API Key'}>{showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button></span></label>
          <label className="text-xs text-zinc-400"><span className="mb-1 block">温度（0-2）</span><input type="number" min="0" max="2" step="0.1" value={modelConfig.temperature} onChange={(event) => updateModelConfig({ temperature: Math.min(2, Math.max(0, Number(event.target.value))) })} disabled={!modelConfig.enabled} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-violet-400 disabled:opacity-50" /></label>
          <label className="text-xs text-zinc-400"><span className="mb-1 block">最大 Token 数</span><input type="number" min="1" max="128000" step="1" value={modelConfig.maxTokens} onChange={(event) => updateModelConfig({ maxTokens: Math.max(1, Number(event.target.value)) })} disabled={!modelConfig.enabled} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-violet-400 disabled:opacity-50" /></label>
        </div>
      </section>
      <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="mb-4 flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-300" /><h2 className="text-sm font-medium">定时保存</h2></div>
        <label className="flex items-center justify-between gap-4 text-xs text-zinc-300"><span><span className="block font-medium">自动保存工作区</span><span className="mt-1 block text-[11px] text-zinc-500">按固定间隔保存接口、环境变量和历史记录</span></span><input type="checkbox" checked={autoSaveEnabled} onChange={(event) => setAutoSaveSettings(event.target.checked, autoSaveInterval)} className="h-4 w-4 accent-cyan-400" /></label>
        <label className="mt-4 flex items-center justify-between gap-4 text-xs text-zinc-400">保存间隔<select disabled={!autoSaveEnabled} value={autoSaveInterval} onChange={(event) => setAutoSaveSettings(autoSaveEnabled, Number(event.target.value))} className="h-9 w-36 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200"><option value={30}>每 30 秒</option><option value={60}>每 1 分钟</option><option value={300}>每 5 分钟</option><option value={900}>每 15 分钟</option></select></label>
      </section>
    </div>
  </div>
}
