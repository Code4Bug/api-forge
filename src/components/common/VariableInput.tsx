import { useMemo, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes, type KeyboardEvent, type UIEvent } from 'react'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string
  variables: Record<string, string>
  onChange: (value: string) => void
  multiline?: boolean
}

export function VariableInput({ value, variables, onChange, multiline = false, className = '', ...props }: Props) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const previewRef = useRef<HTMLDivElement>(null)
  const query = value.match(/\{\{([^{}]*)$/)?.[1] ?? ''
  const suggestions = useMemo(() => Object.keys(variables).filter((key) => key.toLowerCase().includes(query.toLowerCase())), [variables, query])

  function update(next: string) {
    onChange(next)
    setOpen(next.match(/\{\{[^{}]*$/) !== null)
    setIndex(0)
  }

  function insert(key: string) {
    const match = value.match(/\{\{([^{}]*)$/)
    if (!match || match.index === undefined) return
    update(`${value.slice(0, match.index)}{{${key}}}`)
    setOpen(false)
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (!open || suggestions.length === 0) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((current) => (current + 1) % suggestions.length) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((current) => (current - 1 + suggestions.length) % suggestions.length) }
    else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); insert(suggestions[index]) }
    else if (event.key === 'Escape') setOpen(false)
  }

  function syncScroll(event: UIEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (!previewRef.current) return
    previewRef.current.scrollLeft = event.currentTarget.scrollLeft
    previewRef.current.scrollTop = event.currentTarget.scrollTop
  }

  const parts = value.split(/(\{\{[^{}]+\}\})/g)
  // 预览层只负责变量高亮，不能重复真实输入框的边框和背景。
  const previewClassName = className.split(/\s+/).filter((token) => /^(font-|text-(?:xs|sm|base|lg|\[)|leading-|tracking-|p[trblxy]?-[0-9])/.test(token)).join(' ')
  const preview = <div ref={previewRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${multiline ? 'whitespace-pre-wrap break-words' : 'flex items-center whitespace-pre'} ${previewClassName}`}><span>{parts.map((part, partIndex) => part.match(/^\{\{[^{}]+\}\}$/) ? <span key={`${part}-${partIndex}`} style={{ color: 'var(--app-accent)' }}>{part}</span> : <span key={`${part}-${partIndex}`}>{part}</span>)}</span></div>
  const transparentClass = `${className} variable-input-field relative z-10 !bg-transparent !text-transparent caret-[var(--app-text)] selection:bg-cyan-400/30`

  const field = multiline
    ? <textarea {...props as unknown as TextareaHTMLAttributes<HTMLTextAreaElement>} value={value} onChange={(event) => update(event.target.value)} onFocus={() => setOpen(value.match(/\{\{[^{}]*$/) !== null)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onKeyDown={keyDown} onScroll={syncScroll} className={transparentClass} />
    : <input {...props} value={value} onChange={(event) => update(event.target.value)} onFocus={() => setOpen(value.match(/\{\{[^{}]*$/) !== null)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onKeyDown={keyDown} onScroll={syncScroll} className={transparentClass} />

  return <div className="relative min-w-0">
    {preview}
    {field}
    {open && suggestions.length > 0 && <div className="absolute left-0 top-full z-40 mt-1 max-h-44 w-full overflow-auto rounded border border-zinc-700 bg-[#111821] py-1 shadow-xl">
      {suggestions.map((key, suggestionIndex) => <button key={key} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insert(key)} className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs ${suggestionIndex === index ? 'bg-cyan-400/15 text-cyan-100' : 'text-zinc-300 hover:bg-zinc-800'}`}><span>{`{{${key}}}`}</span><span className="ml-3 truncate text-[10px] text-zinc-500">{variables[key]}</span></button>)}
    </div>}
  </div>
}
