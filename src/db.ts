import Dexie, { type Table } from 'dexie'

// One kind of thing: a note that can also be a task.
// uid, updatedAt and deletedAt are here so sync can be added later without changing the schema.
export interface Item {
  uid: string
  title: string
  body: string // Markdown
  isTask: boolean // true = has a checkbox
  listId: string | null // which list it lives in
  doneAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null // soft delete
}

export interface List {
  uid: string
  name: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

class AppDB extends Dexie {
  items!: Table<Item, string>
  lists!: Table<List, string>
  constructor() {
    super('pocket')
    this.version(1).stores({ items: 'uid, updatedAt, deletedAt' })
    this.version(2).stores({
      items: 'uid, updatedAt, deletedAt, listId',
      lists: 'uid, updatedAt, deletedAt',
    })
  }
}

export const db = new AppDB()

// Quick-add default lives in one place so usability tests can change it
export const DEFAULT_IS_TASK = true

export async function addItem(raw: string, asTask: boolean, listId: string | null) {
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
    listId,
    doneAt: null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  })
}

export function patch(uid: string, changes: Partial<Item>) {
  return db.items.update(uid, { ...changes, updatedAt: Date.now() })
}

export async function addList(name: string) {
  const n = name.trim()
  if (!n) return null
  const t = Date.now()
  const uid = crypto.randomUUID()
  await db.lists.add({ uid, name: n, createdAt: t, updatedAt: t, deletedAt: null })
  return uid
}

export async function removeList(uid: string) {
  const t = Date.now()
  await db.items.where('listId').equals(uid).modify({ listId: null, updatedAt: t })
  await db.lists.update(uid, { deletedAt: t, updatedAt: t })
}