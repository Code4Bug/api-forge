import { Link2, Send, Trash2, Unplug } from 'lucide-react'
import { VariableEditor } from '@/components/common/VariableEditor'
import { useEffect, useMemo, useState } from 'react'
import { StatusPill } from '@/components/common/StatusPill'
import { VariableInput } from '@/components/common/VariableInput'
import { getWorkspaceVariables, replaceEnvironmentVariables, useWorkspaceStore } from '@/stores/workspace-store'
import { useTheme } from '@/hooks/useTheme'
import { ThemedSelect } from '@/components/common/ThemedSelect'

type Frame = { direction: 'IN' | 'OUT' | 'ERROR' | 'SYSTEM'; type: string; body: string; time: string }
const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })

export default function WebSocketPage() {
  const { monacoTheme: editorTheme } = useTheme()
  const workspace = useWorkspaceStore((state) => state.workspace)
  const variables = useMemo(() => getWorkspaceVariables(workspace, workspace?.preferences.activeEnvironmentId ?? ''), [workspace])
  const editorVariables = useMemo(() => ({
    ...variables,
    ...Object.fromEntries((workspace?.processVariables ?? []).map((item) => [item.key, item.currentValue ?? '待获取'])),
  }), [variables, workspace?.processVariables])
  const [url, setUrl] = useState('ws://127.0.0.1:8787/ws/market')
  const [message, setMessage] = useState('{"type":"subscribe","channel":"orders"}')
  const [messageType, setMessageType] = useState<'text' | 'json'>('json')
  const [status, setStatus] = useState<'CLOSED' | 'OPEN' | 'CONNECTING'>('CLOSED')
  const [frames, setFrames] = useState<Frame[]>([])
  const [socket, setSocket] = useState<WebSocket | null>(null)
  useEffect(() => {
    const configuredUrl = variables.ws_url
    if (configuredUrl && url === 'ws://127.0.0.1:8787/ws/market') setUrl(`${configuredUrl}/ws/market`)
  }, [variables.ws_url])
  const add = (direction: Frame['direction'], type: string, body: string) => setFrames((items) => [{ direction, type, body, time: now() }, ...items])
  useEffect(() => () => socket?.close(), [socket])
  const connect = () => {
    if (socket && status !== 'CLOSED') { socket.close(); setSocket(null); setStatus('CLOSED'); return }
    try {
      setStatus('CONNECTING'); const ws = new WebSocket(url); setSocket(ws)
      ws.onopen = () => { setStatus('OPEN'); add('SYSTEM', 'open', '连接已建立') }
      ws.onmessage = (event) => add('IN', 'message', String(event.data))
      ws.onerror = () => { add('ERROR', 'error', '连接发生错误'); setStatus('CLOSED') }
      ws.onclose = () => { add('SYSTEM', 'close', '连接已关闭'); setStatus('CLOSED'); setSocket(null) }
    } catch (error) { add('ERROR', 'error', error instanceof Error ? error.message : '地址无效'); setStatus('CLOSED') }
  }
  const send = () => {
    if (!socket || status !== 'OPEN') { add('ERROR', 'send', '请先建立连接'); return }
    let payload = replaceEnvironmentVariables(message, variables)
    if (messageType === 'json') {
      try { payload = JSON.stringify(JSON.parse(message)) }
      catch { add('ERROR', 'send', 'JSON 格式无效，请检查消息内容'); return }
    }
    socket.send(payload); add('OUT', messageType, payload)
  }
  const transformJsonMessage = (compact: boolean) => {
    try { setMessage(JSON.stringify(JSON.parse(message), null, compact ? 0 : 2)) }
    catch { add('ERROR', 'format', 'JSON 格式无效，请检查消息内容') }
  }
  return <div className="grid h-full grid-cols-[520px_minmax(0,1fr)] overflow-hidden bg-[#0b0f14]">
    <aside className="border-r border-zinc-800 p-4"><div className="mb-4 flex items-center justify-between"><div><h1 className="text-sm font-semibold">WebSocket 测试</h1><p className="text-xs text-zinc-500">连接、发送消息并查看帧日志</p></div><StatusPill tone={status === 'OPEN' ? 'green' : status === 'CONNECTING' ? 'amber' : 'red'}>{status}</StatusPill></div>
      <label className="mb-2 block text-xs text-zinc-400">连接地址</label><div className="flex w-full gap-3"><div className="min-w-0 flex-1"><VariableInput value={url} variables={variables} onChange={setUrl} className="h-10 w-full rounded border border-zinc-700 bg-zinc-950 px-3 text-xs outline-none" /></div><button onClick={connect} className="flex h-10 w-24 shrink-0 items-center justify-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950">{status === 'CLOSED' ? <Link2 className="h-3.5 w-3.5" /> : <Unplug className="h-3.5 w-3.5" />}{status === 'CLOSED' ? '连接' : '断开'}</button></div>
      <div className="mb-2 mt-4 flex items-center justify-between"><label className="block text-xs text-zinc-400">发送消息</label><div className="flex items-center gap-2">{messageType === 'json' && <><button onClick={() => transformJsonMessage(false)} className="h-7 rounded border border-zinc-700 px-2 text-[11px] text-zinc-300 hover:bg-zinc-800">格式化</button><button onClick={() => transformJsonMessage(true)} className="h-7 rounded border border-zinc-700 px-2 text-[11px] text-zinc-300 hover:bg-zinc-800">压缩</button></>}<ThemedSelect size="sm" className="w-24" value={messageType} options={[{ value: 'text' as const, label: '文本' }, { value: 'json' as const, label: 'JSON' }]} onChange={(value) => setMessageType(value as 'text' | 'json')} /></div></div>{messageType === 'json' ? <div className="h-44 overflow-hidden rounded border border-zinc-700 bg-zinc-950"><VariableEditor height="100%" language="json" theme={editorTheme} variables={editorVariables} value={message} onChange={(value) => setMessage(value ?? '')} options={{ minimap: { enabled: false }, lineNumbers: 'on', tabSize: 2, wordWrap: 'on', padding: { top: 12, bottom: 12 }, fontSize: 12 }} /></div> : <VariableInput multiline value={message} variables={variables} onChange={setMessage} className="h-44 w-full resize-none rounded border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-300 outline-none" />}<button onClick={send} className="mt-3 flex h-9 items-center gap-2 rounded bg-emerald-400 px-3 text-xs font-semibold text-zinc-950"><Send className="h-3.5 w-3.5" />发送消息</button>
    </aside><section className="flex min-w-0 flex-col"><div className="flex h-12 items-center justify-between border-b border-zinc-800 px-4"><div className="text-xs font-medium text-zinc-300">帧日志 ({frames.length})</div><button onClick={() => setFrames([])} className="rounded p-2 text-zinc-400 hover:bg-zinc-800" title="清空"><Trash2 className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-auto p-4"><div className="overflow-hidden rounded border border-zinc-800"><table className="w-full text-left text-xs"><thead className="bg-zinc-900 text-zinc-500"><tr><th className="px-3 py-2">方向</th><th className="px-3 py-2">类型</th><th className="px-3 py-2">内容</th><th className="px-3 py-2">时间</th></tr></thead><tbody className="divide-y divide-zinc-800">{frames.map((frame, index) => <tr key={`${frame.time}-${index}`} className="bg-zinc-950/60"><td className="px-3 py-2"><StatusPill tone={frame.direction === 'IN' ? 'blue' : frame.direction === 'ERROR' ? 'red' : frame.direction === 'SYSTEM' ? 'amber' : 'green'}>{frame.direction}</StatusPill></td><td className="px-3 py-2 text-zinc-300">{frame.type}</td><td className="px-3 py-2 font-mono text-zinc-400">{frame.body}</td><td className="px-3 py-2 font-mono text-zinc-500">{frame.time}</td></tr>)}</tbody></table></div></div></section></div>
}
