import Dexie, { type Table } from 'dexie'

// 0 none, 1 low, 2 medium, 3 high.
// Export maps this to iCalendar PRIORITY: high = 1, medium = 5, low = 9, none = 0.
export type Priority = 0 | 1 | 2 | 3

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
]

// One kind of thing: a note that can also be a task.
// uid, updatedAt and deletedAt are here so sync can be added later without changing the schema.
export interface Item {
  uid: string
  title: string
  body: string // Markdown
  isTask: boolean // true = has a checkbox
  listId: string | null // which list it lives in
  // Deadline in local "floating" time, like iCalendar DUE without a time zone:
  // 'YYYY-MM-DD' for a date, 'YYYY-MM-DDTHH:MM' for a date with a time.
  due: string | null
  priority: Priority
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
    // v3: deadlines and priority. Fill in defaults for items saved before they existed.
    this.version(3)
      .stores({
        items: 'uid, updatedAt, deletedAt, listId',
        lists: 'uid, updatedAt, deletedAt',
      })
      .upgrade((tx) =>
        tx
          .table('items')
          .toCollection()
          .modify((i) => {
            i.due ??= null
            i.priority ??= 0
          })
      )
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
    due: null,
    priority: 0,
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