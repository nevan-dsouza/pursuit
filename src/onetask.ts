/*
 * Shared goals with a partner who uses the "onetask" app.
 *
 * onetask shares through one branch of a git repo: a folder per person, one JSON file per shared
 * goal or plan (format version 1). Each person writes only their own folder and reads the others.
 * Pursuit plays by the same rules as the folder ME: it reads the other folders, and writes ME/ only.
 * Nothing is written without the Push button, and history is only ever added to.
 */
import type { Goal, Log, Milestone, State, Task } from './types'
import { uid } from './store'
import { keyOf, today } from './dates'
import { newTask, queue, setQueue } from './logic'

export const OT = { owner: 'kspatel29', repo: 'onetask', branch: 'shared', me: 'Nevan' }
const API = `https://api.github.com/repos/${OT.owner}/${OT.repo}`
const TOKEN = 'pursuit:gh-token' // kept on this device only, never synced

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN) ?? ''
  } catch {
    return ''
  }
}
export const setToken = (t: string) => {
  try {
    if (t) localStorage.setItem(TOKEN, t)
    else localStorage.removeItem(TOKEN)
  } catch {
    /* ignore */
  }
}

/* ---------- the file format ---------- */

interface Entry {
  day: string
  hours: number
  progress: number
  note: string
  created_at: string
}
interface Base {
  version: 1
  id: string
  shared: boolean
  title: string
  saved_at: string
  saved_by: string
  writers: string[]
}
export interface GoalDoc extends Base {
  kind: 'goal'
  description: string
  start: string
  deadline: string
  marks: Record<string, string>
  entries: Entry[]
}
export interface PlanDoc extends Base {
  kind: 'plan'
  body: string
  rings: Record<string, string>
}
export type Doc = GoalDoc | PlanDoc
export interface RemoteFile {
  who: string
  path: string
  sha: string
  text: string
  doc: Doc
}
/** Everything on the branch, as last read. */
export interface Remote {
  files: RemoteFile[]
  skipped: string[]
  at: number
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const stampOk = (t: unknown) => typeof t === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(t) && !Number.isNaN(Date.parse(t))
const ms = (t: string) => Date.parse(t)

/** One file, checked. Null for anything this version does not understand; throws for a broken file. */
function parse(text: string): Doc | null {
  const d = JSON.parse(text)
  if (d.version !== 1 || (d.kind !== 'goal' && d.kind !== 'plan')) return null
  if (typeof d.id !== 'string' || !String(d.title ?? '').trim() || !stampOk(d.saved_at) || !Array.isArray(d.writers)) throw new Error('bad file')
  const base = { version: 1 as const, id: d.id, shared: !!d.shared, title: String(d.title).trim(), saved_at: d.saved_at, saved_by: String(d.saved_by), writers: d.writers.map(String) }
  if (d.kind === 'plan') return { ...base, kind: 'plan', body: String(d.body ?? ''), rings: d.rings ?? {} }
  if (!DAY.test(d.start) || !DAY.test(d.deadline)) throw new Error('bad dates')
  return {
    ...base,
    kind: 'goal',
    description: String(d.description ?? ''),
    start: d.start,
    deadline: d.deadline,
    marks: Object.fromEntries(Object.entries(d.marks ?? {}).filter(([k]) => DAY.test(k)).map(([k, v]) => [k, String(v)])),
    entries: (d.entries ?? [])
      .filter((e: Entry) => DAY.test(e.day) && stampOk(e.created_at))
      .map((e: Entry) => ({ day: e.day, hours: Number(e.hours) || 0, progress: Number(e.progress) || 0, note: String(e.note ?? ''), created_at: e.created_at })),
  }
}

/** The same text onetask writes: keys sorted, one-space indent, a final newline. */
function serialize(doc: Doc): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v
  return JSON.stringify(sort(doc), null, 1) + '\n'
}

/** Local time with its zone, e.g. 2026-11-17T15:20:00+05:30 (a time must carry its zone). */
function iso(t: number): string {
  const d = new Date(t)
  const off = -d.getTimezoneOffset()
  const p = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const local = new Date(t + off * 60000).toISOString().slice(0, 19)
  return `${local}${off >= 0 ? '+' : '-'}${p(Math.trunc(off / 60))}:${p(off % 60)}`
}

/* ---------- GitHub ---------- */

async function gh(path: string, init: RequestInit = {}, raw = false) {
  const token = getToken()
  if (!token) throw new Error('Add your GitHub token first.')
  const r = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers ?? {}) },
  })
  if (r.status === 401) throw new Error('GitHub did not accept the token. Check it has not expired.')
  if (r.status === 403 || r.status === 404) throw new Error(`GitHub refused (${r.status}). Use a classic token with the repo scope, and check you are a collaborator on ${OT.owner}/${OT.repo}.`)
  if (!r.ok) throw new Error(`GitHub returned ${r.status}`)
  return raw ? r.text() : r.json()
}

/** Read every person's files from the shared branch. */
export async function readRemote(): Promise<Remote> {
  const tree = await gh(`/git/trees/${OT.branch}?recursive=1&t=${Date.now()}`)
  const blobs = (tree.tree as { path: string; type: string; sha: string }[]).filter((x) => x.type === 'blob' && /^[^/.][^/]*\/(goal|plan)-[^/]+\.json$/.test(x.path))
  const files: RemoteFile[] = []
  const skipped: string[] = []
  await Promise.all(
    blobs.map(async (b) => {
      try {
        const text = (await gh(`/git/blobs/${b.sha}`, {}, true)) as string
        const doc = parse(text)
        if (doc) files.push({ who: b.path.split('/')[0], path: b.path, sha: b.sha, text, doc })
      } catch {
        skipped.push(b.path)
      }
    }),
  )
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { files, skipped, at: Date.now() }
}

const b64 = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s)
}

/** Write my side: only files in my folder, only the ones that changed, one commit each. */
export async function writeMine(remote: Remote, docs: Doc[]): Promise<number> {
  let n = 0
  for (const doc of docs) {
    const path = `${OT.me}/${doc.kind}-${doc.id}.json`
    const text = serialize(doc)
    const old = remote.files.find((f) => f.path === path)
    if (old && old.text === text) continue
    await gh(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: `${OT.me}: update`, content: b64(text), branch: OT.branch, ...(old ? { sha: old.sha } : {}) }) })
    n++
  }
  return n
}

/* ---------- reading the branch as items ---------- */

export interface Item<D extends Doc = Doc> {
  id: string
  kind: D['kind']
  newest: D // the newest save wins, whoever's it is; a tie goes to the later name
  files: RemoteFile[]
  mine?: RemoteFile
  sharedBy: string[] // partners who still share it
}

export function items(remote: Remote): Item[] {
  const by = new Map<string, RemoteFile[]>()
  for (const f of remote.files) by.set(f.doc.kind + f.doc.id, [...(by.get(f.doc.kind + f.doc.id) ?? []), f])
  return [...by.values()].map((files) => {
    const newest = files.map((f) => f.doc).reduce((a, b) => (ms(b.saved_at) > ms(a.saved_at) || (ms(b.saved_at) === ms(a.saved_at) && b.saved_by > a.saved_by) ? b : a))
    return { id: newest.id, kind: newest.kind, newest, files, mine: files.find((f) => f.who === OT.me), sharedBy: files.filter((f) => f.who !== OT.me && f.doc.shared).map((f) => f.who) }
  })
}

/* ---------- pull: bring shared items into Pursuit ---------- */

const entryText = (e: Entry) => [e.note.trim() || 'Logged time', e.hours ? `${e.hours}h` : '', e.progress ? `progress ${e.progress}` : ''].filter(Boolean).join(' · ')

/** Bring one shared goal into Pursuit, or refresh the one already linked to it. */
export function importGoal(s: State, item: Item<GoalDoc>): State {
  const d = item.newest
  let goal = s.goals.find((g) => g.shareId === item.id)
  let goals = s.goals
  if (!goal) {
    goal = { id: uid(), title: d.title, startDate: d.start, deadline: d.deadline, createdAt: Date.now(), shareId: item.id, shareSeen: d.saved_at }
    goals = [...goals, goal]
  } else if (!goal.shareSeen || ms(d.saved_at) > ms(goal.shareSeen)) {
    // a partner changed it after the version I last saw: theirs wins
    const g = { ...goal, title: d.title, startDate: d.start, deadline: d.deadline, shareSeen: d.saved_at }
    goals = goals.map((x) => (x.id === g.id ? g : x))
    goal = g
  }
  const gid = goal.id

  // marks become milestones (added, never removed)
  const have = new Set(s.milestones.filter((m) => m.goalId === gid).map((m) => m.date + '|' + m.title))
  const marks: Milestone[] = Object.entries(d.marks)
    .flatMap(([date, label]) => label.split(' · ').map((title) => ({ date, title: title.trim() })))
    .filter((m) => m.title && !have.has(m.date + '|' + m.title))
    .map((m) => ({ id: uid(), goalId: gid, date: m.date, title: m.title, done: false, createdAt: Date.now() }))

  // partners' entries are shown as their logs, replaced on every pull; mine are added once
  let logs = s.logs.filter((l) => !(l.goalId === gid && l.ext))
  for (const f of item.files) {
    if (f.doc.kind !== 'goal') continue
    for (const e of f.doc.entries) {
      if (f.who !== OT.me) logs.push({ id: `ot-${f.who}-${e.created_at}`, goalId: gid, date: e.day, text: entryText(e), taskId: null, by: f.who, ext: true, createdAt: ms(e.created_at) })
      else if (!logs.some((l) => l.goalId === gid && l.otAt === e.created_at))
        logs.push({ id: uid(), goalId: gid, date: e.day, text: e.note.trim() || 'Logged time', taskId: null, otAt: e.created_at, hours: e.hours, progress: e.progress, createdAt: ms(e.created_at) })
    }
  }
  logs = [...logs]
  return { ...s, goals, milestones: [...s.milestones, ...marks], logs }
}

/* Tasks travel as a checklist inside a shared plan, because onetask shares goals and plans, not tasks. */
const LINE = /^\s*[-*]\s*\[( |x|X)\]\s+(.+?)\s*$/
export const taskPlanTitle = (goalTitle: string) => `${goalTitle} · tasks`
function checklist(s: State, goalId: string): string {
  const open = queue(s, goalId).map((t) => `- [ ] ${t.title}`)
  const done = s.tasks
    .filter((t) => t.goalId === goalId && t.status === 'done')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 30)
    .map((t) => `- [x] ${t.title}`)
  return [...open, ...done].join('\n')
}

/** A partner edited the task checklist: new lines become tasks, ticked lines are marked done. */
export function importTasks(s: State, goalId: string, plan: PlanDoc): State {
  if (plan.saved_by === OT.me) return s
  let out = s
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  for (const line of plan.body.split('\n')) {
    const m = LINE.exec(line)
    if (!m) continue
    const done = m[1] !== ' '
    const title = m[2]
    const t = out.tasks.find((x) => x.goalId === goalId && same(x.title, title))
    if (!t) {
      const nt: Task = { ...newTask(goalId, title), ...(done ? { status: 'done' as const, completedAt: ms(plan.saved_at), doneBy: plan.saved_by } : {}) }
      out = { ...out, tasks: [...out.tasks, nt] }
      if (!done) out = setQueue(out, [...queue(out, goalId).filter((x) => x.id !== nt.id).map((x) => x.id), nt.id])
    } else if (done && t.status === 'open') {
      out = { ...out, tasks: out.tasks.map((x) => (x.id === t.id ? { ...x, status: 'done' as const, completedAt: ms(plan.saved_at), doneBy: plan.saved_by } : x)) }
    }
  }
  return out
}

/** Refresh everything already linked: goals, partners' logs, and tasks a partner added or ticked. */
export function applyRemote(s: State, remote: Remote): State {
  let out = s
  const all = items(remote)
  for (const it of all) if (it.kind === 'goal' && out.goals.some((g) => g.shareId === it.id)) out = importGoal(out, it as Item<GoalDoc>)
  for (const g of out.goals) {
    if (!g.shareId || !g.taskPlanId) continue
    const plan = all.find((x) => x.kind === 'plan' && x.id === g.taskPlanId)
    if (plan && (!g.taskPlanSeen || ms(plan.newest.saved_at) > ms(g.taskPlanSeen))) {
      out = importTasks(out, g.id, plan.newest as PlanDoc)
      out = { ...out, goals: out.goals.map((x) => (x.id === g.id ? { ...x, taskPlanSeen: plan.newest.saved_at } : x)) }
    }
  }
  return out
}

/* ---------- push: write my side ---------- */

/** A save is stamped with the later of now and one second after the newest version seen, so an edit always wins. */
const stamp = (seen?: string) => iso(Math.max(Date.now(), seen ? ms(seen) + 1000 : 0))
const sameMarks = (a: Record<string, string>, b: Record<string, string>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

/** My files for every goal I share, plus the state with the ids and stamps they were given. */
export function buildMine(s: State, remote: Remote): { docs: Doc[]; state: State } {
  const all = items(remote)
  const docs: Doc[] = []
  let goals = s.goals
  let logs = s.logs
  const patch = (id: string, p: Partial<Goal>) => (goals = goals.map((g) => (g.id === id ? { ...g, ...p } : g)))

  for (const g0 of s.goals) {
    if (!g0.shareId) continue
    const item = all.find((x) => x.kind === 'goal' && x.id === g0.shareId) as Item<GoalDoc> | undefined
    const seen = item?.newest
    const marks: Record<string, string> = {}
    for (const m of s.milestones.filter((x) => x.goalId === g0.id).sort((a, b) => a.createdAt - b.createdAt)) marks[m.date] = marks[m.date] ? `${marks[m.date]} · ${m.title}` : m.title
    const changed = !seen || seen.title !== g0.title || seen.start !== g0.startDate || seen.deadline !== g0.deadline || !sameMarks(seen.marks, marks)
    const saved_at = changed ? stamp(seen?.saved_at) : seen!.saved_at
    const writers = [...new Set([...(item?.files.flatMap((f) => f.doc.writers) ?? []), ...(changed || item?.mine ? [OT.me] : []), OT.me])].sort()

    // my own logs go out as my entries; partners' logs and long notes stay out
    const mine = logs.filter((l) => l.goalId === g0.id && !l.ext && !l.note)
    const entries: Entry[] = mine
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((l) => {
        const at = l.otAt ?? iso(l.createdAt)
        if (!l.otAt) logs = logs.map((x) => (x.id === l.id ? { ...x, otAt: at } : x))
        return { day: l.date, hours: l.hours ?? 0, progress: l.progress ?? 0, note: l.text, created_at: at }
      })
    docs.push({ version: 1, kind: 'goal', id: g0.shareId, shared: true, title: g0.title, description: seen?.description ?? '', start: g0.startDate, deadline: g0.deadline, marks, entries, saved_at, saved_by: changed ? OT.me : seen!.saved_by, writers })
    patch(g0.id, { shareSeen: saved_at })

    // the goal's tasks, as a checklist in a plan of their own
    const planId = g0.taskPlanId ?? crypto.randomUUID()
    const pItem = all.find((x) => x.kind === 'plan' && x.id === planId) as Item<PlanDoc> | undefined
    const body = checklist(s, g0.id)
    const title = taskPlanTitle(g0.title)
    if (!pItem && !body) continue
    const pChanged = !pItem || pItem.newest.body.trim() !== body.trim() || pItem.newest.title !== title
    const pAt = pChanged ? stamp(pItem?.newest.saved_at) : pItem!.newest.saved_at
    docs.push({
      version: 1,
      kind: 'plan',
      id: planId,
      shared: true,
      title,
      body,
      rings: (pItem?.mine?.doc as PlanDoc | undefined)?.rings ?? {},
      saved_at: pAt,
      saved_by: pChanged ? OT.me : pItem!.newest.saved_by,
      writers: [...new Set([...(pItem?.files.flatMap((f) => f.doc.writers) ?? []), OT.me])].sort(),
    })
    patch(g0.id, { taskPlanId: planId, taskPlanSeen: pAt })
  }
  return { docs, state: { ...s, goals, logs } }
}

/** Start or stop sharing one of my goals. Stopping leaves the files on the branch as they were. */
export const shareGoal = (s: State, goalId: string, on: boolean): State => ({
  ...s,
  goals: s.goals.map((g) => (g.id === goalId ? (on ? { ...g, shareId: g.shareId ?? crypto.randomUUID() } : { ...g, shareId: undefined, shareSeen: undefined, taskPlanId: undefined, taskPlanSeen: undefined }) : g)),
  logs: on ? s.logs : s.logs.filter((l) => !(l.goalId === goalId && l.ext)),
})

export const describe = (d: Doc) => (d.kind === 'goal' ? `${d.start} to ${d.deadline}` : `${d.body.split('\n').filter((x) => x.trim()).length} lines`)
export const dayOf = (t: string) => keyOf(new Date(ms(t)))
export const isToday = (t: string) => dayOf(t) === today()
export type { Log }
