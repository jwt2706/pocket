import Dexie, { type Table } from 'dexie'

// One kind of thing: a note that can also be a task.
// uid, updatedAt and deletedAt are here so sync can be added later without changing the schema.
export interface Item {
  uid: string
  title: string
  body: string // Markdown
  isTask: boolean // true = has a checkbox
  doneAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null // soft delete
}

class AppDB extends Dexie {
  items!: Table<Item, string>
  constructor() {
    super('todo-notes')
    this.version(1).stores({ items: 'uid, updatedAt, deletedAt' })
  }
}

export const db = new AppDB()

// Quick-add default lives in one place so usability tests can change it
export const DEFAULT_IS_TASK = true

export async function addItem(raw: string, asTask: boolean) {
  let title = raw.trim()
  let isTask = asTask
  if (/^note:/i.test(title)) {
    isTask = false
    title = title.replace(/^note:\s*/i, '')
  }
  if (!title) return
  const t = Date.now()
  await db.items.add({
    uid: crypto.randomUUID(),
    title,
    body: '',
    isTask,
    doneAt: null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  })
}

export function patch(uid: string, changes: Partial<Item>) {
  return db.items.update(uid, { ...changes, updatedAt: Date.now() })
}