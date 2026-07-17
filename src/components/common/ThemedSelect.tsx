import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export type SelectOption<T extends string | number> = {
  value: T
  label: string
  disabled?: boolean
}

type ThemedSelectProps<T extends string | number> = {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  /** 覆盖触发按钮样式，例如方法色 */
  triggerClassName?: string
  /** sm=28px md=32px lg=36px */
  size?: 'sm' | 'md' | 'lg'
  /** 无边框透明底，适合嵌在已有容器内 */
  bare?: boolean
  /** 菜单相对触发按钮左边缘的水平偏移，单位 px */
  menuOffsetX?: number
  'aria-label'?: string
}

type MenuPosition = { top: number; left: number; width: number; maxHeight: number; placement: 'bottom' | 'top' }

export function ThemedSelect<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  className = '',
  triggerClassName = '',
  size = 'lg',
  bare = false,
  menuOffsetX = 0,
  'aria-label': ariaLabel,
}: ThemedSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = options.find((option) => option.value === value)

  const updatePosition = () => {
    const trigger = rootRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportPadding = 8
    const preferredHeight = 240
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
    const spaceAbove = rect.top - viewportPadding
    const placement: 'bottom' | 'top' = spaceBelow < 140 && spaceAbove > spaceBelow ? 'top' : 'bottom'
    const available = placement === 'bottom' ? spaceBelow : spaceAbove
    const maxHeight = Math.max(120, Math.min(preferredHeight, available))
    const top = placement === 'bottom' ? rect.bottom + 4 : rect.top - 4
    setPosition({
      top,
      left: rect.left + menuOffsetX,
      width: Math.max(rect.width, 120),
      maxHeight,
      placement,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const handle = () => updatePosition()
    window.addEventListener('resize', handle)
    window.addEventListener('scroll', handle, true)
    return () => {
      window.removeEventListener('resize', handle)
      window.removeEventListener('scroll', handle, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', keydown)
    }
  }, [open])

  const menu = open && position
    ? createPortal(
      <div
        ref={menuRef}
        id={listId}
        role="listbox"
        className="themed-select-menu"
        style={{
          position: 'fixed',
          top: position.placement === 'bottom' ? position.top : undefined,
          bottom: position.placement === 'top' ? window.innerHeight - position.top : undefined,
          left: position.left,
          width: position.width,
          maxHeight: position.maxHeight,
        }}
      >
        {options.map((option) => (
          <button
            type="button"
            role="option"
            aria-selected={option.value === value}
            disabled={option.disabled}
            key={String(option.value)}
            className={`themed-select-option ${option.value === value ? 'is-selected' : ''}`}
            onClick={() => {
              onChange(option.value)
              setOpen(false)
            }}
          >
            <span className="truncate">{option.label}</span>
            {option.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
        ))}
      </div>,
      document.body,
    )
    : null

  return (
    <div ref={rootRef} className={`themed-select size-${size} ${bare ? 'is-bare' : ''} ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={`themed-select-trigger ${triggerClassName}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <ChevronDown className={`themed-select-chevron ${open ? 'is-open' : ''}`} />
      </button>
      {menu}
    </div>
  )
}
