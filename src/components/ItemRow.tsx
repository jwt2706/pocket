import { useRef } from 'react'
import { formatDue, isOverdue } from '../utils/due'
import type { Item, Priority } from '../utils/db'
import PriorityMark from './PriorityMark'

const LONG_PRESS_MS = 500

type ItemRowProps = {
  item: Item
  now: number
  leaving: boolean
  onToggle: () => void
  onOpen: () => void
  onAskDelete: () => void
}

export default function ItemRow({ item, now, leaving, onToggle, onOpen, onAskDelete }: ItemRowProps) {
  const timer = useRef<number | undefined>(undefined)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const held = useRef(false)

  function cancel() {
    window.clearTimeout(timer.current)
    origin.current = null
  }

  function hold() {
    cancel()
    held.current = true
    navigator.vibrate?.(15)
    onAskDelete()
  }

  const due = item.isTask ? item.due : null
  const late = !!due && !item.doneAt && isOverdue(due, now)
  const priority: Priority = item.isTask ? item.priority : 0

  return (
    <li className={`slot${item.doneAt ? ' done' : ''}${leaving ? ' leaving' : ''}`}>
      <div
        className="row"
        onPointerDown={(e) => {
          held.current = false
          if (e.button !== 0) return
          origin.current = { x: e.clientX, y: e.clientY }
          timer.current = window.setTimeout(hold, LONG_PRESS_MS)
        }}
        onPointerMove={(e) => {
          const o = origin.current
          if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) cancel()
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          e.preventDefault()
          if (!held.current) hold()
        }}
        onClickCapture={(e) => {
          if (held.current) {
            held.current = false
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onKeyDown={(e) => {
          held.current = false
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault()
            onAskDelete()
          }
        }}
      >
        {item.isTask && (
          <button className="box" aria-label={item.doneAt ? 'Mark as not done' : 'Mark as done'} onClick={onToggle}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
              <path d="M8 12.5l2.8 2.8L16.5 9.5" />
            </svg>
          </button>
        )}
        <button className="title" onClick={onOpen}>
          <span className="text">{item.title}</span>
          {(due || priority > 0) && (
            <span className="meta">
              {due && (
                <span className={`due${late ? ' late' : ''}`}>
                  {late && <span className="sr-only">Overdue: </span>}
                  {formatDue(due, now)}
                </span>
              )}
              {priority > 0 && <PriorityMark level={priority} />}
            </span>
          )}
        </button>
      </div>
    </li>
  )
}
