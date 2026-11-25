import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { db, addItem, patch, DEFAULT_IS_TASK, type Item } from './db'
import './style.css'

type Undo = { uid: string; kind: 'done' | 'deleted' } | null

export default function App() {
  const items = useLiveQuery(
    () => db.items.filter((i) => !i.deletedAt).sortBy('createdAt'),
    []
  )
  const [fading, setFading] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<Undo>(null)
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [asTask, setAsTask] = useState(DEFAULT_IS_TASK)
  const [text, setText] = useState('')
  const undoTimer = useRef<number>()

  // Cold start check: time until the list is ready
  useEffect(() => {
    if (items) console.info(`list ready after ${Math.round(performance.now())} ms`)
  }, [!!items])

  function showUndo(u: Undo) {
    setUndo(u)
    window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndo(null), 5000)
  }

  function toggle(item: Item) {
    if (item.doneAt) {
      patch(item.uid, { doneAt: null })
      return
    }
    navigator.vibrate?.(10)
    patch(item.uid, { doneAt: Date.now() })
    // keep the row on screen while the check-off animation plays
    setFading((s) => new Set(s).add(item.uid))
    window.setTimeout(
      () =>
        setFading((s) => {
          const n = new Set(s)
          n.delete(item.uid)
          return n
        }),
      700
    )
    showUndo({ uid: item.uid, kind: 'done' })
  }

  function onUndo() {
    if (!undo) return
    patch(undo.uid, undo.kind === 'done' ? { doneAt: null } : { deletedAt: null })
    setFading((s) => {
      const n = new Set(s)
      n.delete(undo.uid)
      return n
    })
    setUndo(null)
  }

  function remove(uid: string) {
    patch(uid, { deletedAt: Date.now() })
    setOpenUid(null)
    showUndo({ uid, kind: 'deleted' })
  }

  async function submit() {
    await addItem(text, asTask)
    setText('')
  }

  const visible = (items ?? []).filter((i) => !i.doneAt || fading.has(i.uid))
  const open = items?.find((i) => i.uid === openUid)

  return (
    <main>
      <div className="capture">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={asTask ? 'Add a task' : 'Add a note'}
          aria-label="Add an item"
          autoFocus
        />
        <button className="mode" onClick={() => setAsTask(!asTask)} aria-label="Switch between task and note">
          {asTask ? 'Task' : 'Note'}
        </button>
      </div>

      {items && visible.length === 0 && <p className="empty">Nothing here yet. Type above to add something.</p>}

      <ul>
        {visible.map((i) => (
          <li key={i.uid} className={`slot ${i.doneAt ? 'done' : ''}`}>
            <div className="row">
              {i.isTask && (
                <button
                  className="box"
                  aria-label={i.doneAt ? 'Mark as not done' : 'Mark as done'}
                  onClick={() => toggle(i)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M7 12.5l3.5 3.5L17 9" />
                  </svg>
                </button>
              )}
              <button className="title" onClick={() => setOpenUid(i.uid)}>
                {i.title}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {open && <Detail key={open.uid} item={open} onClose={() => setOpenUid(null)} onDelete={() => remove(open.uid)} />}

      {undo && (
        <div className="undo" role="status">
          <span>{undo.kind === 'done' ? 'Marked as done' : 'Deleted'}</span>
          <button onClick={onUndo}>Undo</button>
        </div>
      )}
    </main>
  )
}

function Detail({ item, onClose, onDelete }: { item: Item; onClose: () => void; onDelete: () => void }) {
  // local state so typing never waits on the database
  const [title, setTitle] = useState(item.title)
  const [body, setBody] = useState(item.body)
  const [isTask, setIsTask] = useState(item.isTask)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // saved continuously
  function save(changes: Partial<Item>) {
    patch(item.uid, changes)
  }

  const html = preview ? DOMPurify.sanitize(marked.parse(body, { async: false }) as string) : ''

  return (
    <div className="sheet" role="dialog" aria-label="Edit item">
      <div className="bar">
        <button onClick={onClose}>Back</button>
        <button onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button>
      </div>
      <input
        className="sheet-title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          save({ title: e.target.value })
        }}
        aria-label="Title"
      />
      {preview ? (
        <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            save({ body: e.target.value })
          }}
          placeholder="Write a note. Markdown works."
          aria-label="Note"
        />
      )}
      <div className="bar">
        <label>
          <input
            type="checkbox"
            checked={isTask}
            onChange={(e) => {
              setIsTask(e.target.checked)
              save({ isTask: e.target.checked, doneAt: e.target.checked ? item.doneAt : null })
            }}
          />{' '}
          Checkbox
        </label>
        <button onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}