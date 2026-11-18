import type { Goal, State, Task, TodayState } from './types'
import { uid } from './store'
import { addDays, daysLeftLabel, keyOf, today, weekday } from './dates'

export const queue = (s: State, goalId: string) =>
  s.tasks.filter((t) => t.goalId === goalId && t.status === 'open').sort((a, b) => a.order - b.order)

export const doneTasks = (s: State, goalId: string) =>
  s.tasks.filter((t) => t.goalId === goalId && t.status === 'done').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))

/** Rewrite the order of a goal's open tasks to match `ids`. */
export function setQueue(s: State, ids: string[]): State {
  return { ...s, tasks: s.tasks.map((t) => (ids.includes(t.id) ? { ...t, order: ids.indexOf(t.id) } : t)) }
}

export function newTask(goalId: string, title: string, extra: Partial<Task> = {}): Task {
  return {
    id: uid(),
    goalId,
    milestoneId: null,
    parentId: null,
    title,
    crucial: false,
    important: false,
    order: Date.now(),
    status: 'open',
    notesDraft: '',
    poaDraft: '',
    timeMs: 0,
    createdAt: Date.now(),
    completedAt: null,
    ...extra,
  }
}

export const updateTask = (s: State, id: string, patch: Partial<Task>): State => ({
  ...s,
  tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
})

export const timerElapsed = (s: State, now: number) =>
  s.timer ? s.timer.accMs + (s.timer.start ? now - s.timer.start : 0) : 0

/** Add the running timer's time to its task, record the session, and clear the timer. */
export function commitTimer(s: State, by?: string): State {
  if (!s.timer) return s
  const ms = timerElapsed(s, Date.now())
  const t = s.tasks.find((x) => x.id === s.timer!.taskId)
  if (!t) return { ...s, timer: null }
  const sessions = ms >= 1000 ? [...(s.sessions ?? []), { id: uid(), date: today(), ms, goalId: t.goalId, ...(by ? { by } : {}) }] : (s.sessions ?? [])
  return { ...updateTask(s, t.id, { timeMs: t.timeMs + ms }), sessions, timer: null }
}

export const poaLines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/^([-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)

export type Outcome = 'progress' | 'skip' | 'done'

/* ---------- Today ---------- */

/** Today's overrides. On a new day: hand-picked tasks and your manual order carry over; "not today" resets. */
export const todayState = (s: State): TodayState =>
  s.today && s.today.date === today() ? s.today : { date: today(), extra: s.today?.extra ?? [], skipped: [], order: s.today?.order ?? null }

export const patchToday = (s: State, f: (t: TodayState) => TodayState): State => ({ ...s, today: f(todayState(s)) })

export const NO_DUE = '9999-12-31'
/** A task is due on its milestone's date, otherwise on its goal's deadline. Tasks of ongoing goals have no due date. */
export const taskDue = (s: State, t: Task) =>
  s.milestones.find((m) => m.id === t.milestoneId)?.date ?? (s.goals.find((g) => g.id === t.goalId)?.deadline || NO_DUE)

export const goalDueLabel = (g: Goal) => (g.inbox ? 'no deadline' : g.ongoing || !g.deadline ? 'ongoing' : daysLeftLabel(g.deadline))

/* ---------- Repeating tasks ---------- */

export const REPEATS: [string, string][] = [
  ['', 'Does not repeat'],
  ['daily', 'Every day'],
  ['weekdays', 'Weekdays'],
  ['5', '5× a week'],
  ['3', '3× a week'],
  ['2', '2× a week'],
  ['1', 'Once a week'],
]
export const repeatLabel = (r: Task['repeat']) => (r === 'daily' ? 'every day' : r === 'weekdays' ? 'weekdays' : r === 1 ? 'once a week' : r ? `${r}× a week` : '')
export const parseRepeat = (v: string): Task['repeat'] => (v === 'daily' || v === 'weekdays' ? v : Number(v) || undefined)
export const doneOn = (t: Task, day: string) => !!t.doneDays?.includes(day)
/** How many times a repeating task was done in the week (Mon to Sun) that holds `day`. */
export function doneThisWeek(t: Task, day = today()) {
  const mon = addDays(day, -weekday(day))
  return (t.doneDays ?? []).filter((d) => d >= mon && d <= addDays(mon, 6)).length
}
/** Is this task something to do today? One-off tasks always are; repeating ones only when their turn has come. */
export function dueToday(t: Task, day = today()) {
  if (!t.repeat) return true
  if (doneOn(t, day)) return false
  if (t.repeat === 'daily') return true
  if (t.repeat === 'weekdays') return weekday(day) < 5
  return doneThisWeek(t, day) < t.repeat
}

/**
 * The Home list: every open task from every goal, minus anything marked "not today".
 * Automatic order: crucial, then important, then nearest due date, then each goal's own queue order.
 * Dragging sets your own order, which is kept (new tasks join at the bottom) until you switch back.
 */
export function todayList(s: State): Task[] {
  const td = todayState(s)
  const skip = new Set(td.skipped)
  const goalPos = new Map(s.goals.map((g, i) => [g.id, i]))
  const rank = (t: Task) => (t.crucial ? 0 : t.important ? 1 : 2)
  const auto = s.tasks
    .filter((t) => t.status === 'open' && !skip.has(t.id) && goalPos.has(t.goalId) && dueToday(t))
    .sort((a, b) => rank(a) - rank(b) || taskDue(s, a).localeCompare(taskDue(s, b)) || goalPos.get(a.goalId)! - goalPos.get(b.goalId)! || a.order - b.order)
  if (!td.order) return auto
  const pos = (id: string) => {
    const i = td.order!.indexOf(id)
    return i < 0 ? 1e9 : i
  }
  return auto
    .map((t, i) => ({ t, i }))
    .sort((a, b) => pos(a.t.id) - pos(b.t.id) || a.i - b.i)
    .map((x) => x.t)
}

/**
 * Close the current work on a task:
 *  - any running timer session is added to the task's time
 *  - Notes become a log on today's box of the goal grid
 *  - each POA line becomes a new task right after this one in the goal's queue
 *  - In progress keeps it in Today, Skip removes it for today, Done completes it
 */
export function finishWork(s0: State, taskId: string, outcome: Outcome, by?: string): { state: State; created: number; logged: boolean } {
  let s = commitTimer(s0, by)
  const t = s.tasks.find((x) => x.id === taskId)
  if (!t) return { state: s, created: 0, logged: false }

  const notes = t.notesDraft.trim()
  // a finished task's plan would otherwise be lost: it is kept with the day's notes
  const plan = outcome === 'done' && !t.repeat ? poaLines(t.poaDraft).join('\n') : ''
  if (notes || plan) s = { ...s, logs: [...s.logs, { id: uid(), goalId: t.goalId, date: today(), text: notes, taskId: t.id, note: true, createdAt: Date.now(), ...(plan ? { poa: plan } : {}), ...(by ? { by } : {}) }] }

  let order = queue(s, t.goalId).map((x) => x.id)
  // the plan stays with the task until it is done; steps become tasks only when you choose
  s = updateTask(s, t.id, outcome === 'done' ? { notesDraft: '', poaDraft: '' } : { notesDraft: '' })

  if (outcome === 'progress') s = updateTask(s, t.id, { inProgress: true })
  if (outcome === 'skip') s = patchToday(s, (td) => ({ ...td, skipped: [...td.skipped, t.id], extra: td.extra.filter((x) => x !== t.id) }))
  if (outcome === 'done' && t.repeat) {
    // a repeating task is never finished for good: it is done for today and comes back by itself
    s = doneLog(updateTask(s, t.id, { doneDays: [...(t.doneDays ?? []).filter((d) => d !== today()), today()], notesDraft: '' }), t, by, true)
    return { state: s, created: 0, logged: !!notes }
  }
  if (outcome === 'done') {
    order = order.filter((x) => x !== t.id)
    s = doneLog(updateTask(s, t.id, { status: 'done', inProgress: false, completedAt: Date.now(), ...(by ? { doneBy: by } : {}) }), t, by)
    s = patchToday(s, (td) => ({ ...td, extra: td.extra.filter((x) => x !== t.id) }))
  }
  s = setQueue(s, order)
  return { state: s, created: 0, logged: !!notes }
}

/** Turn plan steps into tasks, placed right after their parent in the goal's queue (or at `index` if the parent is gone). */
export function addPlanTasks(s: State, parent: Task, titles: string[], index = 0): State {
  const clean = titles.map((x) => x.trim()).filter(Boolean)
  if (!clean.length) return s
  const ids = queue(s, parent.goalId).map((x) => x.id)
  const created = clean.map((title) => newTask(parent.goalId, title, { parentId: parent.id, milestoneId: parent.milestoneId }))
  const at = ids.indexOf(parent.id)
  // parent already done: go after any steps it spawned earlier, so the plan keeps its order
  const lastChild = s.tasks.reduce((m, x) => (x.parentId === parent.id ? Math.max(m, ids.indexOf(x.id)) : m), -1)
  const pos = at >= 0 ? at + 1 : lastChild >= 0 ? lastChild + 1 : Math.min(index, ids.length)
  return setQueue({ ...s, tasks: [...s.tasks, ...created] }, [...ids.slice(0, pos), ...created.map((c) => c.id), ...ids.slice(pos)])
}

/** Finishing a task counts as getting something done, so it is logged on today's box. */
export const doneLog = (s: State, task: Task, by?: string, repeating = false): State => ({
  ...s,
  logs: [...s.logs.filter((l) => !(l.done && l.taskId === task.id && (!repeating || l.date === today()))), { id: uid(), goalId: task.goalId, date: today(), text: `Done: ${task.title}`, taskId: task.id, done: true, createdAt: Date.now(), ...(by ? { by } : {}) }],
})
/** Reopening a task takes its "done" log back. */
export const undoneLog = (s: State, taskId: string): State => ({ ...s, logs: s.logs.filter((l) => !(l.done && l.taskId === taskId)) })
/** Tick or untick a repeating task for today. */
export function toggleRepeatDone(s: State, t: Task, by?: string): State {
  const day = today()
  if (doneOn(t, day)) return { ...updateTask(s, t.id, { doneDays: (t.doneDays ?? []).filter((d) => d !== day) }), logs: s.logs.filter((l) => !(l.done && l.taskId === t.id && l.date === day)) }
  return doneLog(updateTask(s.timer?.taskId === t.id ? commitTimer(s, by) : s, t.id, { doneDays: [...(t.doneDays ?? []), day] }), t, by, true)
}

/** The built-in "To-dos" goal for one-off tasks; created the first time it is needed. */
export function withInbox(s: State): { state: State; id: string } {
  const have = s.goals.find((g) => g.inbox)
  if (have) return { state: s, id: have.id }
  const g: Goal = { id: uid(), title: 'To-dos', startDate: today(), deadline: '', ongoing: true, inbox: true, createdAt: Date.now() }
  return { state: { ...s, goals: [...s.goals, g] }, id: g.id }
}

/** A quick log: one line about something you just got done, counted on today's box of the goal. */
export function addLog(s: State, task: Task, text: string, by?: string): State {
  const t = text.trim()
  if (!t) return s
  return { ...s, logs: [...s.logs, { id: uid(), goalId: task.goalId, date: today(), text: t, taskId: task.id, createdAt: Date.now(), ...(by ? { by } : {}) }] }
}

export function logsByDay(s: State, goalId: string) {
  const m = new Map<string, number>()
  for (const l of s.logs) if (l.goalId === goalId && !l.note) m.set(l.date, (m.get(l.date) ?? 0) + 1)
  return m
}

/* ---------- Streaks and stats ---------- */

/**
 * A day counts as active if you did anything in Pursuit: added a goal, milestone or task, worked on or
 * finished a task, wrote a log, or ran the timer. Days are also remembered in `activeDates`, so deleting
 * a goal later doesn't break the streak.
 */
export function activeDays(s: State) {
  const d = new Set<string>(s.activeDates ?? [])
  const stamp = (ts?: number | null) => ts && d.add(keyOf(new Date(ts)))
  for (const g of s.goals) stamp(g.createdAt)
  for (const m of s.milestones) stamp(m.createdAt)
  for (const t of s.tasks) stamp(t.createdAt)
  for (const l of s.logs) if (!l.ext) d.add(l.date)
  for (const x of s.sessions ?? []) d.add(x.date)
  for (const t of s.tasks) if (t.status === 'done' && t.completedAt) d.add(keyOf(new Date(t.completedAt)))
  for (const t of s.tasks) for (const x of t.doneDays ?? []) d.add(x)
  return d
}

export function streaks(s: State) {
  const days = activeDays(s)
  const t = today()
  // current: counts back from today, or from yesterday if today hasn't started yet
  let k = days.has(t) ? t : addDays(t, -1)
  let current = 0
  while (days.has(k)) {
    current++
    k = addDays(k, -1)
  }
  let best = 0
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue // not the start of a run
    let n = 1
    while (days.has(addDays(d, n))) n++
    best = Math.max(best, n)
  }
  return { current, best, activeToday: days.has(t), total: days.size }
}

/** Per-day numbers for the last `n` days, oldest first. */
export function recentDays(s: State, n: number) {
  const t = today()
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(t, i - n + 1)
    return {
      date,
      done: s.tasks.filter((x) => (x.status === 'done' && x.completedAt && keyOf(new Date(x.completedAt)) === date) || doneOn(x, date)).length,
      ms: (s.sessions ?? []).filter((x) => x.date === date).reduce((a, x) => a + x.ms, 0),
      logs: s.logs.filter((l) => l.date === date && !l.note && !l.ext).length,
    }
  })
}

/** Your own workspace plus your share of a space's activity, for a streak that counts both. */
export function withMySpaceWork(mine: State, team: State | null, by?: string): State {
  if (!team || !by) return mine
  return {
    ...mine,
    logs: [...mine.logs, ...team.logs.filter((l) => l.by === by)],
    sessions: [...(mine.sessions ?? []), ...(team.sessions ?? []).filter((x) => x.by === by)],
    tasks: [...mine.tasks, ...team.tasks.filter((t) => t.status === 'done' && t.doneBy === by)],
  }
}
