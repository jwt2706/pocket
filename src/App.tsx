import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  addItem,
  addList,
  removeList,
  patch,
  DEFAULT_IS_TASK,
  type Item,
  type List,
} from './utils/db'
import ItemDetail from './components/ItemDetail'
import ItemRow from './components/ItemRow'
import { ConfirmDelete, ConfirmSettingsChanges } from './components/ConfirmDialogs'
import Logo from './components/Logo'
import './styles.css'

type Undo = { uid: string; kind: 'done' | 'deleted' } | null
type AllTab = 'open' | 'done'

const THEME_KEY = 'pocket-theme'
const ACCENT_KEY = 'pocket-accent'

const ACCENT_OPTIONS = [
  { id: 'amber', name: 'Amber', light: '#e5a228', dark: '#f0b43c' },
  { id: 'blue', name: 'Blue', light: '#2878c7', dark: '#75b7ff' },
  { id: 'green', name: 'Green', light: '#23845b', dark: '#62d39a' },
  { id: 'rose', name: 'Rose', light: '#cc4266', dark: '#ff8da8' },
  { id: 'violet', name: 'Violet', light: '#7454c8', dark: '#b09aff' },
  { id: 'teal', name: 'Teal', light: '#087f8c', dark: '#5bd0d5' },
  { id: 'orange', name: 'Orange', light: '#d65b2a', dark: '#ff9a64' },
  { id: 'slate', name: 'Slate', light: '#526478', dark: '#a8bbce' },
] as const

type AccentId = (typeof ACCENT_OPTIONS)[number]['id']

function readSavedAccent(): AccentId {
  const saved = window.localStorage.getItem(ACCENT_KEY)
  return ACCENT_OPTIONS.find((option) => option.id === saved)?.id ?? 'amber'
}

export default function App() {
  const items = useLiveQuery(() => db.items.filter((i) => !i.deletedAt).sortBy('createdAt'), [])
  const lists = useLiveQuery(() => db.lists.filter((l) => !l.deletedAt).sortBy('createdAt'), []) ?? []
  const [view, setView] = useState('all') // 'all' | 'notes' | list uid
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingView, setPendingView] = useState<string | null>(null)
  const [allTab, setAllTab] = useState<AllTab>('open') // tabs in the All view
  const [showDone, setShowDone] = useState(false) // completed section at the bottom of a list
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [savedDarkMode, setSavedDarkMode] = useState(() => {
    const savedTheme = window.localStorage.getItem(THEME_KEY)
    return savedTheme === 'dark' || (savedTheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })
  const [savedAccent, setSavedAccent] = useState<AccentId>(readSavedAccent)
  const [darkMode, setDarkMode] = useState(savedDarkMode)
  const [accent, setAccent] = useState<AccentId>(savedAccent)
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
    const selectedAccent = ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0]
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.setProperty('--thread-light', selectedAccent.light)
    root.style.setProperty('--thread-dark', selectedAccent.dark)
  }, [darkMode, accent])

  const live = items ?? []
  const settingsDirty = darkMode !== savedDarkMode || accent !== savedAccent
  const inView = (id: string) => (i: Item) =>
    id === 'all' ? true : id === 'notes' ? !i.isTask : i.listId === id
  const count = (id: string) => live.filter((i) => inView(id)(i) && !i.doneAt).length
  const currentList = lists.find((l) => l.uid === view)
  const title = view === 'all' ? 'All' : view === 'notes' ? 'Notes' : currentList?.name ?? 'All'

  function navigate(id: string) {
    setView(id)
    setSettingsOpen(false)
    setAllTab('open')
    setAsTask(id === 'notes' ? false : DEFAULT_IS_TASK)
    setNavOpen(false)
  }

  function go(id: string) {
    if (settingsOpen && settingsDirty) {
      setPendingView(id)
      return
    }
    navigate(id)
  }

  function saveSettings() {
    window.localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light')
    window.localStorage.setItem(ACCENT_KEY, accent)
    setSavedDarkMode(darkMode)
    setSavedAccent(accent)

    if (pendingView !== null) navigate(pendingView)
    setPendingView(null)
  }

  function discardSettings() {
    setDarkMode(savedDarkMode)
    setAccent(savedAccent)
    if (pendingView !== null) navigate(pendingView)
    setPendingView(null)
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
    <ItemRow
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
          {settingsOpen && settingsDirty && (
            <button className="save-settings" onClick={saveSettings}>
              Save
            </button>
          )}
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
            <h2 className="settings-subheading">Accent color</h2>
            <div className="accent-options" role="group" aria-label="Accent color">
              {ACCENT_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={`accent-option${accent === option.id ? ' selected' : ''}`}
                  aria-pressed={accent === option.id}
                  onClick={() => setAccent(option.id)}
                >
                  <span
                    className="accent-swatch"
                    style={{ backgroundColor: darkMode ? option.dark : option.light }}
                    aria-hidden="true"
                  />
                  {option.name}
                </button>
              ))}
            </div>
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

      {opened && <ItemDetail key={opened.uid} item={opened} lists={lists} onClose={() => setOpenUid(null)} />}

      {confirming && (
        <ConfirmDelete item={confirming} onCancel={() => setConfirmUid(null)} onConfirm={() => remove(confirming.uid)} />
      )}

      {pendingView !== null && (
        <ConfirmSettingsChanges
          onCancel={() => setPendingView(null)}
          onDiscard={discardSettings}
          onSave={saveSettings}
        />
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
