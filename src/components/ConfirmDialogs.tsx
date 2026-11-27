import { useEffect } from 'react'
import type { Item } from '../utils/db'

export function ConfirmDelete({ item, onCancel, onConfirm }: { item: Item; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="confirm-scrim" onClick={onCancel}>
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-text"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">Delete this {item.isTask ? 'task' : 'note'}?</h2>
        <p id="confirm-text">{item.title}</p>
        <div className="confirm-actions">
          <button autoFocus onClick={onCancel}>
            Cancel
          </button>
          <button className="danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmSettingsChanges({
  onCancel,
  onDiscard,
  onSave,
}: {
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="confirm-scrim" onClick={onCancel}>
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="settings-confirm-title"
        aria-describedby="settings-confirm-text"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-confirm-title">Save settings before leaving?</h2>
        <p id="settings-confirm-text">You have unsaved changes.</p>
        <div className="confirm-actions">
          <button autoFocus onClick={onCancel}>
            Keep editing
          </button>
          <button onClick={onDiscard}>Discard</button>
          <button className="primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
