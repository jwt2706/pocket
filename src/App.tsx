import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { db, addItem, addList, removeList, patch, DEFAULT_IS_TASK, type Item, type List } from './db'
import './styles.css'

type Undo = { uid: string; kind: 'done' | 'deleted' } | null

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="24" y="11" width="16" height="18" rx="3" className="logo-card" />
      <path d="M17 22h30v19a8 8 0 0 1-8 8H25a8 8 0 0 1-8-8z" fill="currentColor" />
      <path d="M22.5 28h19" className="logo-stitch" />
    </svg>
  )
}

export default function App() {
  const items = useLiveQuery(() => db.items.filter((i) => !i.deletedAt).sortBy('createdAt'), [])
  const lists = useLiveQuery(() => db.lists.filter((l) => !l.deletedAt).sortBy('createdAt'), []) ?? []
  const [view, setView] = useState('all') // 'all' | 'notes' | list uid
  const [navOpen, setNavOpen] = useState(false)
  const [fading, setFading] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<Undo>(null)
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [asTask, setAsTask] = useState(DEFAULT_IS_TASK)
  const [text, setText] = useState('')
  const [newList, setNewList] = useState('')
  const undoTimer = useRef<number | undefined>(undefined)

  // Cold start check: time until the list is ready
  useEffect(() => {
    if (items) console.info(`list ready after ${Math.round(performance.now())} ms`)
  }, [!!items])

  const live = items ?? []
  const inView = (id: string) => (i: Item) =>
    id === 'all' ? true : id === 'notes' ? !i.isTask : i.listId === id
  const count = (id: string) => live.filter((i) => inView(id)(i) && !i.doneAt).length
  const currentList = lists.find((l) => l.uid === view)
  const title = view === 'all' ? 'All' : view === 'notes' ? 'Notes' : currentList?.name ?? 'All'

  function go(id: string) {
    setView(id)
    setAsTask(id === 'notes' ? false : DEFAULT_IS_TASK)
    setNavOpen(false)
  }

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
    await addItem(text, asTask, currentList ? currentList.uid : null)
    setText('')
  }

  async function submitList() {
    const uid = await addList(newList)
    setNewList('')
    if (uid) go(uid)
  }

  const visible = live.filter((i) => inView(view)(i) && (!i.doneAt || fading.has(i.uid)))
  const open = live.find((i) => i.uid === openUid)
  const fine = window.matchMedia('(pointer: fine)').matches

  return (
    <div className="app">
      <nav className={`nav ${navOpen ? 'open' : ''}`} aria-label="Views and lists">
        <div className="brand">
          <Logo />
          <span>Pocket</span>
        </div>
        <button className={view === 'all' ? 'on' : ''} onClick={() => go('all')}>
          All <small>{count('all') || ''}</small>
        </button>
        <button className={view === 'notes' ? 'on' : ''} onClick={() => go('notes')}>
          Notes <small>{count('notes') || ''}</small>
        </button>
        <hr />
        {lists.map((l: List) => (
          <button key={l.uid} className={view === l.uid ? 'on' : ''} onClick={() => go(l.uid)}>
            {l.name} <small>{count(l.uid) || ''}</small>
          </button>
        ))}
        <input
          className="new-list"
          value={newList}
          onChange={(e) => setNewList(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitList()}
          placeholder="New list"
          aria-label="New list"
        />
      </nav>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <main>
        <header>
          <button className="menu" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Logo />
          </button>
          <h1>{title}</h1>
          {currentList && (
            <button
              className="quiet"
              onClick={() => {
                removeList(currentList.uid)
                go('all')
              }}
            >
              Delete list
            </button>
          )}
        </header>

        {items && visible.length === 0 && <p className="empty">Empty for now. Add something below.</p>}

        <ul>
          {visible.map((i) => (
            <li key={i.uid} className={`slot ${i.doneAt ? 'done' : ''}`}>
              <div className="row">
                {i.isTask && (
                  <button className="box" aria-label={i.doneAt ? 'Mark as not done' : 'Mark as done'} onClick={() => toggle(i)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                      <path d="M8 12.5l2.8 2.8L16.5 9.5" />
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

        <div className="capture">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={asTask ? 'Add a task' : 'Add a note'}
            aria-label="Add an item"
            autoFocus={fine}
          />
          <button className="quiet" onClick={() => setAsTask(!asTask)} aria-label="Switch between task and note">
            {asTask ? 'Task' : 'Note'}
          </button>
        </div>
      </main>

      {open && <Detail key={open.uid} item={open} lists={lists} onClose={() => setOpenUid(null)} onDelete={() => remove(open.uid)} />}

      {undo && (
        <div className="undo" role="status">
          <span>{undo.kind === 'done' ? 'Marked as done' : 'Deleted'}</span>
          <button onClick={onUndo}>Undo</button>
        </div>
      )}
    </div>
  )
}

function Detail({ item, lists, onClose, onDelete }: { item: Item; lists: List[]; onClose: () => void; onDelete: () => void }) {
  // local state so typing never waits on the database
  const [title, setTitle] = useState(item.title)
  const [body, setBody] = useState(item.body)
  const [isTask, setIsTask] = useState(item.isTask)
  const [listId, setListId] = useState(item.listId ?? '')
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
          patch(item.uid, { title: e.target.value })
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
            patch(item.uid, { body: e.target.value })
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
              patch(item.uid, { isTask: e.target.checked, doneAt: e.target.checked ? item.doneAt : null })
            }}
          />{' '}
          Checkbox
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
        <button onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}