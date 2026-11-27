import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  db,
  addItem,
  addList,
  removeList,
  patch,
  DEFAULT_IS_TASK,
  PRIORITIES,
  type Item,
  type List,
  type Priority,
} from './db'
import { formatDue, isOverdue, joinDue, splitDue } from './due'
import './styles.css'

type Undo = { uid: string; kind: 'done' | 'deleted' } | null
type AllTab = 'open' | 'done'

// How long a press must last to count as "press and hold"
const LONG_PRESS_MS = 500
const THEME_KEY = 'pocket-theme'

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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [allTab, setAllTab] = useState<AllTab>('open') // tabs in the All view
  const [showDone, setShowDone] = useState(false) // completed section at the bottom of a list
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = window.localStorage.getItem(THEME_KEY)
    return savedTheme === 'dark' || (savedTheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })
  const [fading, setFading] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<Undo>(null)
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [confirmUid, setConfirmUid] = useState<string | null>(null)
  const [asTask, setAsTask] = useState(DEFAULT_IS_TASK)
  const [text, setText] = useState('')
  const [newList, setNewList] = useState('')
  const [now, setNow] = useState(() => Date.now()) // for "Today" and overdue, refreshed every minute
  const undoTimer = useRef<number | undefined>(undefined)

  // Cold start check: time until the list is ready
  useEffect(() => {
    if (items) console.info(`list ready after ${Math.round(performance.now())} ms`)
  }, [!!items])

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [darkMode])

  const live = items ?? []
  const inView = (id: string) => (i: Item) =>
    id === 'all' ? true : id === 'notes' ? !i.isTask : i.listId === id
  const count = (id: string) => live.filter((i) => inView(id)(i) && !i.doneAt).length
  const currentList = lists.find((l) => l.uid === view)
  const title = view === 'all' ? 'All' : view === 'notes' ? 'Notes' : currentList?.name ?? 'All'

  function go(id: string) {
    setView(id)
    setSettingsOpen(false)
    setAllTab('open')
    setAsTask(id === 'notes' ? false : DEFAULT_IS_TASK)
    setNavOpen(false)
  }

  function toggleSidebar() {
    if (window.matchMedia('(min-width: 760px)').matches) {
      setSidebarCollapsed((collapsed) => !collapsed)
    } else {
      setNavOpen((open) => !open)
    }
  }

  function openSettings() {
    setSettingsOpen(true)
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
    setConfirmUid(null)
    setOpenUid(null)
    showUndo({ uid, kind: 'deleted' })
  }

  async function submit() {
    await addItem(text, asTask, currentList ? currentList.uid : null)
    setText('')
    setAllTab('open') // so the new item is visible
  }

  async function submitList() {
    const uid = await addList(newList)
    setNewList('')
    if (uid) go(uid)
  }

  const openItems = live.filter((i) => inView(view)(i) && (!i.doneAt || fading.has(i.uid)))
  const doneItems = live
    .filter((i) => inView(view)(i) && i.isTask && i.doneAt && !fading.has(i.uid))
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)) // most recently completed first
  const doneTab = view === 'all' && allTab === 'done'
  const shown = doneTab ? doneItems : openItems
  const doneSection = !!currentList && doneItems.length > 0

  let empty = ''
  if (items) {
    if (doneTab) {
      if (doneItems.length === 0) empty = 'Nothing completed yet.'
    } else if (openItems.length === 0) {
      empty = doneItems.length ? 'All done.' : 'Empty for now. Add something below.'
    }
  }

  const opened = live.find((i) => i.uid === openUid)
  const confirming = live.find((i) => i.uid === confirmUid)
  const fine = window.matchMedia('(pointer: fine)').matches

  const row = (i: Item) => (
    <Row
      key={i.uid}
      item={i}
      now={now}
      leaving={fading.has(i.uid)}
      onToggle={() => toggle(i)}
      onOpen={() => setOpenUid(i.uid)}
      onAskDelete={() => setConfirmUid(i.uid)}
    />
  )

  return (
    <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <nav className={`nav${navOpen ? ' open' : ''}${sidebarCollapsed ? ' collapsed' : ''}`} aria-label="Views and lists">
        <div className="brand">
          <div className="brand-name">
            <Logo />
            <span>Pocket</span>
          </div>
          <button className="sidebar-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
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
        <button
          className={`settings-link${settingsOpen ? ' on' : ''}`}
          onClick={openSettings}
          aria-label="Settings"
          title="Settings"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 2.8h4l.6 2.1a7.8 7.8 0 0 1 1.8.8l2-.9 2 3.5-1.6 1.6a7.8 7.8 0 0 1 0 2.1l1.6 1.6-2 3.5-2-.9a7.8 7.8 0 0 1-1.8.8l-.6 2.1h-4l-.6-2.1a7.8 7.8 0 0 1-1.8-.8l-2 .9-2-3.5 1.6-1.6a7.8 7.8 0 0 1 0-2.1L3.6 8.3l2-3.5 2 .9a7.8 7.8 0 0 1 1.8-.8l.6-2.1Z" />
            <circle cx="12" cy="11" r="3" />
          </svg>
        </button>
      </nav>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <button
        className={`edge-toggle${navOpen ? ' nav-open' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
        onClick={toggleSidebar}
        aria-label="Open sidebar"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <main>
        <header>
          <h1>{settingsOpen ? 'Settings' : title}</h1>
          {!settingsOpen && currentList && (
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

        {settingsOpen ? (
          <section className="settings" aria-label="Settings">
            <h2>Appearance</h2>
            <label className="setting-row">
              <span>
                <strong>Dark mode</strong>
                <small>Use a darker color theme</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={darkMode}
                onChange={(e) => setDarkMode(e.target.checked)}
                aria-label="Dark mode"
              />
              <span className="setting-switch" aria-hidden="true" />
            </label>
          </section>
        ) : (
          <>
            {view === 'all' && (
              <div className="tabs" role="tablist" aria-label="Filter">
                <button role="tab" aria-selected={allTab === 'open'} onClick={() => setAllTab('open')}>
                  To do
                </button>
                <button role="tab" aria-selected={allTab === 'done'} onClick={() => setAllTab('done')}>
                  Completed <small>{doneItems.length || ''}</small>
                </button>
              </div>
            )}

            {empty && <p className="empty">{empty}</p>}

            <ul>{shown.map(row)}</ul>

            {doneSection && (
              <>
                <button className="done-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                  Completed <small>{doneItems.length}</small>
                </button>
                {showDone && <ul aria-label="Completed">{doneItems.map(row)}</ul>}
              </>
            )}

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
          </>
        )}
      </main>

      {opened && <Detail key={opened.uid} item={opened} lists={lists} onClose={() => setOpenUid(null)} />}

      {confirming && (
        <ConfirmDelete item={confirming} onCancel={() => setConfirmUid(null)} onConfirm={() => remove(confirming.uid)} />
      )}

      {undo && (
        <div className="undo" role="status">
          <span>{undo.kind === 'done' ? 'Marked as done' : 'Deleted'}</span>
          <button onClick={onUndo}>Undo</button>
        </div>
      )}
    </div>
  )
}

type RowProps = {
  item: Item
  now: number
  leaving: boolean
  onToggle: () => void
  onOpen: () => void
  onAskDelete: () => void
}

function Row({ item, now, leaving, onToggle, onOpen, onAskDelete }: RowProps) {
  const timer = useRef<number | undefined>(undefined)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const held = useRef(false) // a hold just happened: swallow the click that follows it

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
          if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) cancel() // it's a scroll or drag
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          // right-click on desktop, or the system long-press on touch
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

// Small signal-bar mark: one, two or three bars; high priority uses the accent color
function PriorityMark({ level }: { level: Priority }) {
  return (
    <svg className={`prio p${level}`} viewBox="0 0 12 12" role="img" aria-label={`${PRIORITIES[level].label} priority`}>
      {[0, 1, 2].map((n) => (
        <rect key={n} x={1 + n * 4} y={8 - n * 3} width="2.5" height={3 + n * 3} rx="1" className={n < level ? 'on' : ''} />
      ))}
    </svg>
  )
}

function ConfirmDelete({ item, onCancel, onConfirm }: { item: Item; onCancel: () => void; onConfirm: () => void }) {
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

// Task fields that are dropped when the checkbox is turned off, kept for undo
type Dropped = { due: string | null; priority: Priority; doneAt: number | null }

function Detail({ item, lists, onClose }: { item: Item; lists: List[]; onClose: () => void }) {
  // local state so typing never waits on the database
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
    const t = date ? time : '' // a time needs a date
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
    // Turning the checkbox off makes it a plain note and drops the task fields, with undo
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
          <label className="field">
            Due
            <input type="date" value={dueDate} onChange={(e) => saveDue(e.target.value, dueTime)} />
          </label>
          {dueDate && (
            <>
              <input type="time" aria-label="Due time" value={dueTime} onChange={(e) => saveDue(dueDate, e.target.value)} />
              <button className="quiet" onClick={() => saveDue('', '')}>
                Clear
              </button>
            </>
          )}
          <label className="field">
            Priority
            <select value={priority} onChange={(e) => savePriority(Number(e.target.value) as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
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