import { useCallback, useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { joinDue, splitDue } from '../utils/due'
import { patch, type Item, type List, type Priority } from '../utils/db'
import { DatePicker, PriorityPicker, TimePicker } from './ItemFields'

// Task fields that are dropped when the checkbox is turned off, kept for undo
type Dropped = { due: string | null; priority: Priority; doneAt: number | null }

export default function ItemDetail({ item, lists, onClose }: { item: Item; lists: List[]; onClose: () => void }) {
  const [title, setTitle] = useState(item.title)
  const [body, setBody] = useState(item.body)
  const [isTask, setIsTask] = useState(item.isTask)
  const [listId, setListId] = useState(item.listId ?? '')
  const [dueDate, setDueDate] = useState(() => splitDue(item.due).date)
  const [dueTime, setDueTime] = useState(() => splitDue(item.due).time)
  const [priority, setPriority] = useState<Priority>(item.priority)
  const [preview, setPreview] = useState(false)
  const [dropped, setDropped] = useState<Dropped | null>(null)
  const [closing, setClosing] = useState(false)
  const droppedTimer = useRef<number | undefined>(undefined)

  const close = useCallback(() => setClosing(true), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  function saveDue(date: string, time: string) {
    const t = date ? time : ''
    setDueDate(date)
    setDueTime(t)
    patch(item.uid, { due: joinDue(date, t) })
  }

  function savePriority(p: Priority) {
    setPriority(p)
    patch(item.uid, { priority: p })
  }

  function setTask(on: boolean) {
    setIsTask(on)
    if (on) {
      patch(item.uid, { isTask: true })
      return
    }
    const kept: Dropped = { due: joinDue(dueDate, dueTime), priority, doneAt: item.doneAt }
    setDueDate('')
    setDueTime('')
    setPriority(0)
    patch(item.uid, { isTask: false, due: null, priority: 0, doneAt: null })
    if (kept.due || kept.priority || kept.doneAt) {
      setDropped(kept)
      window.clearTimeout(droppedTimer.current)
      droppedTimer.current = window.setTimeout(() => setDropped(null), 5000)
    }
  }

  function undoDrop() {
    if (!dropped) return
    const parts = splitDue(dropped.due)
    setIsTask(true)
    setDueDate(parts.date)
    setDueTime(parts.time)
    setPriority(dropped.priority)
    patch(item.uid, { isTask: true, ...dropped })
    setDropped(null)
  }

  const html = preview ? DOMPurify.sanitize(marked.parse(body, { async: false }) as string) : ''

  return (
    <div
      className={`sheet${closing ? ' closing' : ''}`}
      role="dialog"
      aria-label="Edit item"
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bar">
        <button onClick={close}>Back</button>
        <button onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button>
      </div>
      <input
        className="sheet-title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          patch(item.uid, { title: e.target.value })
        }}
        aria-label="Title"
      />
      {isTask && (
        <div className="fields">
          <div className="field due-field">
            <span>Due</span>
            <DatePicker value={dueDate} onChange={(date) => saveDue(date, dueTime)} />
          </div>
          {dueDate && (
            <div className="field time-field">
              <span>Time</span>
              <TimePicker value={dueTime} onChange={(time) => saveDue(dueDate, time)} />
            </div>
          )}
          <div className="field priority-field">
            <span>Priority</span>
            <PriorityPicker value={priority} onChange={savePriority} />
          </div>
        </div>
      )}
      {preview ? (
        <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            patch(item.uid, { body: e.target.value })
          }}
          placeholder="Write a note. Markdown works."
          aria-label="Note"
        />
      )}
      <div className="bar">
        <label>
          <input type="checkbox" checked={isTask} onChange={(e) => setTask(e.target.checked)} /> Checkbox
        </label>
        <select
          value={listId}
          aria-label="List"
          onChange={(e) => {
            setListId(e.target.value)
            patch(item.uid, { listId: e.target.value || null })
          }}
        >
          <option value="">No list</option>
          {lists.map((l) => (
            <option key={l.uid} value={l.uid}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {dropped && (
        <div className="undo" role="status">
          <span>Turned into a note</span>
          <button onClick={undoDrop}>Undo</button>
        </div>
      )}
    </div>
  )
}
