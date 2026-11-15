import type { State } from './types'

/** What members of a space share. Everything else (timer, today's order, focus) is each person's own. */
export type Shared = Pick<State, 'goals' | 'milestones' | 'logs' | 'tasks' | 'sessions'>
export type ViewState = Pick<State, 'timer' | 'today' | 'focusId' | 'selectedGoalId'>

const KEYS = ['goals', 'milestones', 'logs', 'tasks', 'sessions'] as const

export const emptyShared = (): Shared => ({ goals: [], milestones: [], logs: [], tasks: [], sessions: [] })
export const normShared = (d: unknown): Shared => {
  const x = (d ?? {}) as Partial<Shared>
  const out = emptyShared()
  for (const k of KEYS) if (Array.isArray(x[k])) (out[k] as unknown[]) = x[k] as unknown[]
  return out
}
export const pickShared = (s: State): Shared => ({ goals: s.goals, milestones: s.milestones, logs: s.logs, tasks: s.tasks, sessions: s.sessions })
export const pickView = (s: State): ViewState => ({ timer: s.timer, today: s.today, focusId: s.focusId, selectedGoalId: s.selectedGoalId })

type Item = { id?: string }
const keyOf = (x: Item) => x.id ?? JSON.stringify(x)

/**
 * Three-way merge, item by item. `base` is the space as both sides last agreed on it.
 *  - changed on one side only: that side's version
 *  - changed on both sides: ours
 *  - added on either side: kept
 *  - deleted on one side: deleted, unless the other side changed it in the meantime
 */
export function merge3(base: Shared, ours: Shared, theirs: Shared): Shared {
  const out = emptyShared()
  for (const k of KEYS) {
    const B = new Map((base[k] as Item[]).map((x) => [keyOf(x), JSON.stringify(x)]))
    const O = new Map((ours[k] as Item[]).map((x) => [keyOf(x), x]))
    const T = new Map((theirs[k] as Item[]).map((x) => [keyOf(x), x]))
    const res: Item[] = []
    for (const [id, t] of T) {
      const b = B.get(id)
      const o = O.get(id)
      if (!o) {
        // new on their side, or deleted on ours (kept only if they changed it since)
        if (b === undefined || JSON.stringify(t) !== b) res.push(t)
        continue
      }
      res.push(b === undefined || JSON.stringify(o) !== b ? o : t)
    }
    for (const [id, o] of O) {
      if (T.has(id)) continue
      const b = B.get(id)
      // new on our side, or deleted on theirs (kept only if we changed it since)
      if (b === undefined || JSON.stringify(o) !== b) res.push(o)
    }
    ;(out[k] as Item[]) = res
  }
  return out
}
