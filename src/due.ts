// Deadlines are stored as local floating time (see Item.due in db.ts):
// 'YYYY-MM-DD' for a date, 'YYYY-MM-DDTHH:MM' for a date with a time.

// The app is English-only, but dates follow the person's regional format when it is English.
const LOCALE = navigator.language.startsWith('en') ? navigator.language : 'en'
const DAY_MS = 86_400_000

export function joinDue(date: string, time: string): string | null {
  if (!date) return null
  return time ? `${date}T${time}` : date
}

export function splitDue(due: string | null): { date: string; time: string } {
  return { date: due?.slice(0, 10) ?? '', time: due?.slice(11, 16) ?? '' }
}

function hasTime(due: string) {
  return due.length > 10
}

function toDate(due: string): Date {
  const [y, m, d] = due.slice(0, 10).split('-').map(Number)
  const [h, min] = hasTime(due) ? due.slice(11, 16).split(':').map(Number) : [0, 0]
  return new Date(y, m - 1, d, h, min)
}

// Whole calendar days from now to the date (DST-safe)
function dayDiff(date: Date, now: Date) {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((a - b) / DAY_MS)
}

// "Today", "Tomorrow", "Tue", "Dec 4", "Jan 15, 2027", plus ", 3:00 PM" when a time is set
export function formatDue(due: string, now: number): string {
  const d = toDate(due)
  const n = new Date(now)
  const diff = dayDiff(d, n)
  let day: string
  if (diff === 0) day = 'Today'
  else if (diff === 1) day = 'Tomorrow'
  else if (diff === -1) day = 'Yesterday'
  else if (diff > 1 && diff < 7) day = d.toLocaleDateString(LOCALE, { weekday: 'short' })
  else if (d.getFullYear() === n.getFullYear()) day = d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })
  else day = d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', year: 'numeric' })
  if (!hasTime(due)) return day
  return `${day}, ${d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' })}`
}

// A date-only deadline is overdue from the next day; one with a time is overdue once that time passes
export function isOverdue(due: string, now: number): boolean {
  if (!hasTime(due)) return dayDiff(toDate(due), new Date(now)) < 0
  return toDate(due).getTime() < now
}