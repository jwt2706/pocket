import { useEffect, useRef, useState } from 'react'
import { PRIORITIES, type Priority } from '../utils/db'
import PriorityMark from './PriorityMark'

const DATE_LOCALE = navigator.language.startsWith('en') ? navigator.language : 'en'
const DATE_ORDER = new Intl.DateTimeFormat(DATE_LOCALE, { year: 'numeric', month: 'numeric', day: 'numeric' })
  .formatToParts(new Date(2006, 10, 22))
  .flatMap((part) => (part.type === 'day' || part.type === 'month' || part.type === 'year' ? [part.type] : []))
const DATE_PLACEHOLDER = new Intl.DateTimeFormat(DATE_LOCALE, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
  new Date(2026, 5, 15)
)

function parseDateEntry(value: string): string | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim())
  let year: number
  let month: number
  let day: number
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else {
    const regional = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/.exec(value.trim())
    if (!regional) return null
    const parts: { day?: number; month?: number; year?: number } = {}
    DATE_ORDER.forEach((part, index) => {
      parts[part] = Number(regional[index + 1])
    })
    year = parts.year ?? 0
    month = parts.month ?? 0
    day = parts.day ?? 0
  }
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null

  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatDateEntry(value: string): string {
  return dateFromISO(value).toLocaleDateString(DATE_LOCALE, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function dateFromISO(value: string): Date {
  const parsed = parseDateEntry(value)
  if (!parsed) return new Date()
  const [year, month, day] = parsed.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function DatePicker({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const wrapper = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState(value ? formatDateEntry(value) : '')
  const [month, setMonth] = useState(() => {
    const date = value ? dateFromISO(value) : new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const [open, setOpen] = useState(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setInputValue(value ? formatDateEntry(value) : '')
    setInvalid(false)
    if (value) {
      const date = dateFromISO(value)
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const today = formatISODate(new Date())
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const days = [
    ...Array.from({ length: monthStart.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  function chooseDate(date: string) {
    onChange(date)
    setInputValue(formatDateEntry(date))
    setInvalid(false)
    setOpen(false)
  }

  function editDate(text: string) {
    setInputValue(text)
    setInvalid(false)
    if (!text.trim()) {
      onChange('')
      return
    }
    const parsed = parseDateEntry(text)
    if (parsed) onChange(parsed)
  }

  function validateEntry() {
    if (!inputValue.trim()) {
      onChange('')
      setInvalid(false)
      return
    }
    const parsed = parseDateEntry(inputValue)
    if (parsed) {
      onChange(parsed)
      setInputValue(formatDateEntry(parsed))
      setInvalid(false)
    } else {
      setInvalid(true)
    }
  }

  return (
    <div
      className="date-picker"
      ref={wrapper}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <div className="date-input">
        <input
          type="text"
          inputMode="numeric"
          value={inputValue}
          placeholder={DATE_PLACEHOLDER}
          aria-label="Due date"
          aria-invalid={invalid}
          aria-describedby={invalid ? 'due-date-error' : undefined}
          onChange={(e) => editDate(e.target.value)}
          onBlur={validateEntry}
        />
        <button
          type="button"
          className="calendar-toggle"
          aria-label={open ? 'Close calendar' : 'Open calendar'}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((shown) => !shown)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="3" y="5" width="14" height="12" rx="2" />
            <path d="M6 3v4m8-4v4M3 9h14" />
          </svg>
        </button>
      </div>
      {invalid && (
        <span className="date-error" id="due-date-error">
          Enter a valid date in the shown format.
        </span>
      )}
      {open && (
        <div className="date-popover" role="dialog" aria-label="Choose due date">
          <div className="calendar-header">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m12 4-6 6 6 6" />
              </svg>
            </button>
            <strong>{month.toLocaleDateString(DATE_LOCALE, { month: 'long', year: 'numeric' })}</strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m8 4 6 6-6 6" />
              </svg>
            </button>
          </div>
          <div className="calendar-grid" role="group" aria-label="Calendar">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, index) => (
              <span
                className="calendar-weekday"
                key={day}
                aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index]}
              >
                {day}
              </span>
            ))}
            {days.map((day, index) => {
              if (day === null) return <span key={`blank-${index}`} />
              const date = formatISODate(new Date(month.getFullYear(), month.getMonth(), day))
              return (
                <button
                  type="button"
                  key={day}
                  className={`${date === value ? 'selected' : ''}${date === today ? ' today' : ''}`}
                  aria-pressed={date === value}
                  aria-current={date === today ? 'date' : undefined}
                  onClick={() => chooseDate(date)}
                >
                  {day}
                </button>
              )
            })}
          </div>
          <div className="calendar-footer">
            <button type="button" onClick={() => chooseDate(today)}>Today</button>
            <button type="button" onClick={() => chooseDate('')}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

function parseTimeEntry(value: string): string | null {
  const text = value.trim().replace(/\./g, '').replace(/\s+/g, ' ')
  const twelveHour = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(text)
  const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(text)
  if (!twelveHour && !twentyFourHour) return null

  let hour = Number(twelveHour?.[1] ?? twentyFourHour?.[1])
  const minute = Number(twelveHour?.[2] ?? twentyFourHour?.[2])
  if (minute > 59) return null
  if (twelveHour) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (twelveHour[3].toUpperCase() === 'PM' ? 12 : 0)
  } else if (hour > 23) {
    return null
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function formatTimeEntry(value: string): string {
  const [hour, minute] = value.split(':').map(Number)
  return new Date(2026, 0, 1, hour, minute).toLocaleTimeString(DATE_LOCALE, { hour: 'numeric', minute: '2-digit' })
}

function storedTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const QUICK_TIMES = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  const minute = index % 2 ? '30' : '00'
  return `${String(hour).padStart(2, '0')}:${minute}`
})
const TIME_PLACEHOLDER = formatTimeEntry('15:30')

export function TimePicker({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const wrapper = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState(value ? formatTimeEntry(value) : '')
  const [open, setOpen] = useState(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setInputValue(value ? formatTimeEntry(value) : '')
    setInvalid(false)
  }, [value])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function chooseTime(time: string) {
    onChange(time)
    setInputValue(time ? formatTimeEntry(time) : '')
    setInvalid(false)
    setOpen(false)
  }

  function editTime(text: string) {
    setInputValue(text)
    setInvalid(false)
    if (!text.trim()) {
      onChange('')
      return
    }
    const parsed = parseTimeEntry(text)
    if (parsed) onChange(parsed)
  }

  function validateEntry() {
    if (!inputValue.trim()) {
      onChange('')
      setInvalid(false)
      return
    }
    const parsed = parseTimeEntry(inputValue)
    if (parsed) {
      onChange(parsed)
      setInputValue(formatTimeEntry(parsed))
      setInvalid(false)
    } else {
      setInvalid(true)
    }
  }

  return (
    <div
      className="time-picker"
      ref={wrapper}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <div className={`time-input${invalid ? ' invalid' : ''}`}>
        <input
          type="text"
          inputMode="text"
          value={inputValue}
          placeholder={TIME_PLACEHOLDER}
          aria-label="Due time"
          aria-invalid={invalid}
          aria-describedby={invalid ? 'due-time-error' : undefined}
          onChange={(e) => editTime(e.target.value)}
          onBlur={validateEntry}
        />
        <button
          type="button"
          className="calendar-toggle"
          aria-label={open ? 'Close time picker' : 'Open time picker'}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((shown) => !shown)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 5.5V10l3 2" />
          </svg>
        </button>
      </div>
      {invalid && (
        <span className="date-error" id="due-time-error">
          Enter a valid time, like {TIME_PLACEHOLDER}.
        </span>
      )}
      {open && (
        <div className="time-popover" role="dialog" aria-label="Choose due time">
          <strong className="time-popover-title">Quick times</strong>
          <div className="time-options" role="group" aria-label="Times every 30 minutes">
            {QUICK_TIMES.map((time) => (
              <button
                type="button"
                key={time}
                aria-pressed={value === time}
                className={value === time ? 'selected' : ''}
                onClick={() => chooseTime(time)}
              >
                {formatTimeEntry(time)}
              </button>
            ))}
          </div>
          <div className="calendar-footer">
            <button type="button" onClick={() => chooseTime(storedTime(new Date()))}>Now</button>
            <button type="button" onClick={() => chooseTime('')}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function PriorityPicker({ value, onChange }: { value: Priority; onChange: (priority: Priority) => void }) {
  const wrapper = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div
      className="priority-picker"
      ref={wrapper}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className="priority-toggle"
        aria-label={`Priority: ${PRIORITIES[value].label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((shown) => !shown)}
      >
        <PriorityMark level={value} decorative />
        <span>{PRIORITIES[value].label}</span>
        <svg className="priority-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="priority-popover" role="dialog" aria-label="Choose priority">
          {PRIORITIES.map((priority) => (
            <button
              type="button"
              key={priority.value}
              className={value === priority.value ? 'selected' : ''}
              aria-label={`${priority.label} priority`}
              aria-pressed={value === priority.value}
              onClick={() => {
                onChange(priority.value)
                setOpen(false)
              }}
            >
              <PriorityMark level={priority.value} decorative />
              <span>{priority.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
