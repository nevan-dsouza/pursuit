import { useState } from 'react'
import { addDays, diffDays, fmtDay, monthShort, today, weekday } from './dates'

interface Props {
  start: string
  deadline: string
  /** last day drawn, when it is not the deadline (ongoing goals have none) */
  end?: string
  counts: Map<string, number>
  milestones: Map<string, string[]> // date -> titles
  selected: string | null
  onSelect: (date: string) => void
}

const level = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4)

/** GitHub-style grid covering the goal's timeline. Columns = weeks, rows = Mon..Sun. */
export function Grid({ start, deadline, end: last, counts, milestones, selected, onSelect }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const gridStart = addDays(start, -weekday(start))
  const end = last ?? (deadline < start ? start : deadline)
  const gridEnd = addDays(end, 6 - weekday(end))
  const weeks = Math.round((diffDays(gridStart, gridEnd) + 1) / 7)
  const cell = weeks <= 8 ? 30 : weeks <= 16 ? 24 : weeks <= 26 ? 18 : 14 // bigger boxes for shorter goals
  const t = today()

  const cols: string[][] = []
  for (let w = 0; w < weeks; w++) cols.push(Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)))

  return (
    <div className="grid-scroll">
      <div className="grid-wrap" style={{ ['--c' as string]: `${cell}px` }}>
        <div className="grid-days">
          {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div>
          <div className="grid-months">
            {cols.map((c, i) => {
              const firstOfMonth = c.find((d) => d.endsWith('-01'))
              const label = i === 0 ? monthShort(c[6]) : firstOfMonth ? monthShort(firstOfMonth) : ''
              return <span key={i}>{label}</span>
            })}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${weeks}, var(--c))` }} onMouseLeave={() => setTip(null)}>
            {cols.flat().map((d) => {
              const inRange = d >= start && d <= end
              if (!inRange) return <div key={d} className="day blank" onMouseEnter={() => setTip(null)} />
              const ms = milestones.get(d)
              const n = counts.get(d) ?? 0
              const cls = ['day', `p${level(n)}`, d === t && 'today', ms && 'milestone', d === selected && 'sel', d > t && 'future'].filter(Boolean).join(' ')
              const lines = [
                fmtDay(d) + (d === t ? ' · today' : ''),
                ...(d === deadline ? ['Goal deadline'] : []),
                ...(ms ?? []).map((m) => `Milestone: ${m}`),
                ...(n ? [`${n} log${n > 1 ? 's' : ''}`] : []),
              ]
              return (
                <button
                  key={d}
                  className={cls}
                  aria-label={lines.join(', ')}
                  onClick={() => onSelect(d)}
                  onMouseEnter={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    setTip({ x: r.left + r.width / 2, y: r.top, lines })
                  }}
                >
                  {d === deadline ? <span className="diamond" /> : ms ? <span className="mdot" /> : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {tip && (
        <div className="day-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.lines.map((l, i) => (
            <div key={i} className={i ? 'muted' : ''}>
              {l}
            </div>
          ))}
        </div>
      )}
      <div className="grid-legend">
        <span>
          <i className="lg today" /> Today
        </span>
        <span>
          <i className="lg milestone">
            <span className="mdot" />
          </i>{' '}
          Milestone
        </span>
        <span>
          <i className="lg">
            <span className="diamond" />
          </i>{' '}
          Goal
        </span>
        <span className="lg-scale">
          Less {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`lg p${l}`} />)} More
        </span>
      </div>
    </div>
  )
}
