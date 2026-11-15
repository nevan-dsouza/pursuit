export const pad = (n: number) => String(n).padStart(2, '0')

export function keyOf(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parse(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Day key for a timestamp, where the "day" starts at startHour (late-night work counts to the previous day). */
export function dayKey(ts: number, startHour: number) {
  return keyOf(new Date(ts - startHour * 3600000))
}

export const todayKey = (startHour: number) => dayKey(Date.now(), startHour)

export function addDays(key: string, n: number) {
  const d = parse(key)
  d.setDate(d.getDate() + n)
  return keyOf(d)
}

/** b - a in days */
export function diffDays(a: string, b: string) {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/** Monday = 0 */
export const weekday = (key: string) => (parse(key).getDay() + 6) % 7

export const fmtDay = (key: string) =>
  parse(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export function fmtDur(ms: number) {
  if (ms <= 0) return '0m'
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`
}

export function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h ? `${h}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`
}

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export const today = () => keyOf(new Date())

export const monthShort = (key: string) => parse2(key).toLocaleDateString(undefined, { month: 'short' })

function parse2(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysLeftLabel(deadline: string) {
  const n = diffDays(today(), deadline)
  if (n < 0) return `${-n}d overdue`
  if (n === 0) return 'due today'
  return `${n}d left`
}
