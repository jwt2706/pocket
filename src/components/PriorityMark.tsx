import { PRIORITIES, type Priority } from '../utils/db'

export default function PriorityMark({ level, decorative = false }: { level: Priority; decorative?: boolean }) {
  return (
    <svg
      className={`prio p${level}`}
      viewBox="0 0 12 12"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : `${PRIORITIES[level].label} priority`}
      aria-hidden={decorative}
    >
      {[0, 1, 2].map((n) => (
        <rect key={n} x={1 + n * 4} y={8 - n * 3} width="2.5" height={3 + n * 3} rx="1" className={n < level ? 'on' : ''} />
      ))}
    </svg>
  )
}
