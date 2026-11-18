/* One goal with everything in it, as a file: readable Markdown, or complete data that Pursuit can import again. */
import type { Goal, Log, Milestone, Session, State, Task } from './types'
import { uid } from './store'
import { fmtDay, fmtDur, today } from './dates'
import { goalDueLabel, queue, repeatLabel } from './logic'

export interface GoalBundle {
  pursuit: 1
  kind: 'goal'
  exportedAt: string
  goal: Goal
  milestones: Milestone[]
  tasks: Task[]
  logs: Log[]
  sessions: Session[]
}

export function goalBundle(s: State, goalId: string): GoalBundle | null {
  const goal = s.goals.find((g) => g.id === goalId)
  if (!goal) return null
  return {
    pursuit: 1,
    kind: 'goal',
    exportedAt: new Date().toISOString(),
    goal,
    milestones: s.milestones.filter((m) => m.goalId === goalId),
    tasks: s.tasks.filter((t) => t.goalId === goalId),
    logs: s.logs.filter((l) => l.goalId === goalId),
    sessions: (s.sessions ?? []).filter((x) => x.goalId === goalId),
  }
}

export function toMarkdown(s: State, b: GoalBundle): string {
  const g = b.goal
  const ms = [...b.milestones].sort((a, c) => (a.date < c.date ? -1 : 1))
  const msOf = (id: string | null) => ms.find((m) => m.id === id)?.title
  const open = queue(s, g.id)
  const done = b.tasks.filter((t) => t.status === 'done').sort((a, c) => (a.completedAt ?? 0) - (c.completedAt ?? 0))
  const focus = b.tasks.reduce((n, t) => n + t.timeMs, 0)
  const line = (t: Task) =>
    [`- [${t.status === 'done' ? 'x' : ' '}] ${t.title}`, t.crucial ? '(crucial)' : t.important ? '(important)' : '', msOf(t.milestoneId) ? `(milestone: ${msOf(t.milestoneId)})` : '', t.repeat ? `(repeats ${repeatLabel(t.repeat)})` : '', t.timeMs ? `(${fmtDur(t.timeMs)})` : '']
      .filter(Boolean)
      .join(' ')
  const days = [...new Set(b.logs.map((l) => l.date))].sort()
  const out: string[] = [`# ${g.title}`, '']
  out.push(g.inbox ? 'One-off to-dos.' : g.ongoing || !g.deadline ? `Ongoing since ${fmtDay(g.startDate)}.` : `${fmtDay(g.startDate)} to ${fmtDay(g.deadline)} (${goalDueLabel(g)}).`)
  out.push(`${done.length} of ${b.tasks.filter((t) => !t.repeat).length} tasks done · ${ms.filter((m) => m.done).length} of ${ms.length} milestones reached${focus ? ` · ${fmtDur(focus)} of focus time` : ''}.`, '')
  if (ms.length) out.push('## Milestones', '', ...ms.map((m) => `- [${m.done ? 'x' : ' '}] ${m.date} · ${m.title}`), '')
  if (open.length) {
    out.push('## Tasks to do', '')
    for (const t of open) {
      out.push(line(t))
      for (const step of t.poaDraft.split('\n').filter((x) => x.trim())) out.push(`  - next: ${step.trim()}`)
      if (t.notesDraft.trim()) out.push(`  - notes: ${t.notesDraft.trim().replace(/\n+/g, ' / ')}`)
    }
    out.push('')
  }
  if (done.length) out.push('## Tasks done', '', ...done.map(line), '')
  if (g.planText?.trim()) out.push('## Plan and context', '', g.planText.trim(), '')
  if (days.length) {
    out.push('## Log', '')
    for (const d of days) {
      out.push(`### ${d}`)
      for (const l of b.logs.filter((x) => x.date === d).sort((a, c) => a.createdAt - c.createdAt)) out.push(`- ${l.by ? `${l.by}: ` : ''}${[l.text.replace(/\n+/g, ' / '), l.poa ? `plan: ${l.poa.replace(/\n+/g, '; ')}` : ''].filter(Boolean).join(' · ')}`)
      out.push('')
    }
  }
  out.push(`_Exported from Pursuit on ${today()}._`, '')
  return out.join('\n')
}

/** Bring an exported goal in as a new goal of your own. Nothing existing is touched, and it is not linked to any sharing. */
export function importBundle(s: State, raw: unknown): { state: State; title: string } {
  const b = raw as GoalBundle
  if (!b || b.pursuit !== 1 || b.kind !== 'goal' || !b.goal?.title) throw new Error('This file is not a goal exported from Pursuit.')
  const gid = uid()
  const map = new Map<string, string>()
  const re = (id: string | null | undefined) => (id ? (map.get(id) ?? null) : null)
  for (const x of [...(b.milestones ?? []), ...(b.tasks ?? [])]) map.set(x.id, uid())
  const { shareId: _a, shareSeen: _b, planId: _c, planSeen: _d, inbox: _e, sectionId: _f, pos: _g, ...rest } = b.goal
  const goal: Goal = { ...rest, id: gid, createdAt: Date.now() }
  return {
    title: goal.title,
    state: {
      ...s,
      goals: [...s.goals, goal],
      milestones: [...s.milestones, ...(b.milestones ?? []).map((m) => ({ ...m, id: map.get(m.id)!, goalId: gid }))],
      tasks: [...s.tasks, ...(b.tasks ?? []).map((t) => ({ ...t, id: map.get(t.id)!, goalId: gid, milestoneId: re(t.milestoneId), parentId: re(t.parentId) }))],
      logs: [...s.logs, ...(b.logs ?? []).map((l) => ({ ...l, id: uid(), goalId: gid, taskId: re(l.taskId), otAt: undefined }))],
      sessions: [...(s.sessions ?? []), ...(b.sessions ?? []).map((x) => ({ ...x, id: uid(), goalId: gid }))],
    },
  }
}

export function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const fileName = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'goal'
