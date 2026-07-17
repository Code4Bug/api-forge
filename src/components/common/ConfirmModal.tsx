import { Modal } from '@/components/common/Modal'

type ConfirmModalProps = {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal open={open} title={title} onClose={onCancel} className="max-w-sm">
      <div className="space-y-4 p-5">
        {description && <p className="text-xs leading-6 text-zinc-300">{description}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-9 rounded border border-zinc-700 px-4 text-xs text-zinc-300 hover:bg-zinc-800">
            {cancelText}
          </button>
          <button type="button" onClick={onConfirm} className={`h-9 rounded px-4 text-xs font-semibold ${danger ? 'bg-rose-500 text-white hover:bg-rose-400' : 'bg-cyan-400 text-zinc-950 hover:opacity-90'}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
