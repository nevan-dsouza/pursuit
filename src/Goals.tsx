import { useRef, useState } from 'react'
import { useStore, uid, type Ws } from './store'
import { SpacePicker } from './SpaceUI'
import { SPACES } from './config'
import type { Goal, State, Task } from './types'
import { addDays, daysLeftLabel, diffDays, fmtDay, fmtDur, today, weekday } from './dates'
import { REPEATS, doneLog, doneOn, doneTasks, doneThisWeek, goalDueLabel, logsByDay, newTask, parseRepeat, queue, repeatLabel, setQueue, toggleRepeatDone, undoneLog, updateTask } from './logic'
import { Grid } from './Grid'

type Kind = 'mine' | 'team'

/** Goals in the order of their tiles: by section, then by position. */
export function sortGoals(s: State): Goal[] {
  const sec = new Map((s.sections ?? []).map((x, i) => [x.id, i + 1]))
  const at = (g: Goal) => (g.sectionId && sec.has(g.sectionId) ? sec.get(g.sectionId)! : 0)
  return [...s.goals].sort((a, b) => at(a) - at(b) || (a.pos ?? a.createdAt) - (b.pos ?? b.createdAt))
}

export type GoalSel = { k: Kind; id: string } | null
export interface GoalNav {
  sel: GoalSel
  setSel: (s: GoalSel) => void
  creating: Kind | null
  setCreating: (k: Kind | null) => void
}

/** Which goal is open, given what was clicked and what exists. */
function useGoalPick({ sel, creating }: GoalNav) {
  const { mine, team } = useStore()
  const wsOf = (k: Kind): Ws | null => (k === 'team' ? team : mine)
  const cur = sel && wsOf(sel.k)?.s.goals.some((g) => g.id === sel.id) ? sel : null
  const none = !mine.s.goals.length && !team?.s.goals.length
  const makeIn: Kind | null = creating && wsOf(creating) ? creating : none ? 'mine' : null
  return { cur, makeIn, wsOf }
}

/** The list of goals: lives in the app sidebar, and at the top of the page on phones. */
export function GoalList({ nav, active = true }: { nav: GoalNav; active?: boolean }) {
  const { mine, team, space } = useStore()
  const { cur, makeIn } = useGoalPick(nav)
  const { setSel, setCreating } = nav
  const item = (k: Kind, g: Goal) => (
    <button key={g.id} className={`goal-item ${active && !makeIn && cur?.k === k && cur.id === g.id ? 'on' : ''}`} onClick={() => (setSel({ k, id: g.id }), setCreating(null))}>
      <span className="gi-title">{g.title}</span>
      <span className="gi-meta">{goalDueLabel(g)}</span>
    </button>
  )
  return (
    <>
      <button className={`goal-item all ${active && !makeIn && !cur ? 'on' : ''}`} onClick={() => (setSel(null), setCreating(null))}>
        All goals
      </button>
      <div className="side-label">My goals</div>
      {sortGoals(mine.s).map((g) => item('mine', g))}
      <button className={`goal-item new ${active && makeIn === 'mine' ? 'on' : ''}`} onClick={() => setCreating('mine')}>
        + New goal
      </button>

      {SPACES && (
        <>
          <div className="side-label space-label">Space</div>
          <SpacePicker />
        </>
      )}
      {team && (
        <>
          {team.s.goals.map((g) => item('team', g))}
          <button className={`goal-item new ${active && makeIn === 'team' ? 'on' : ''}`} onClick={() => setCreating('team')}>
            + New goal in {space?.name ?? 'space'}
          </button>
        </>
      )}
    </>
  )
}

export function Goals({ nav }: { nav: GoalNav }) {
  const { space, mine } = useStore()
  const { setSel, setCreating } = nav
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [ongoing, setOngoing] = useState(false)
  const { cur, makeIn, wsOf } = useGoalPick(nav)
  const ws = cur ? wsOf(cur.k) : null
  const goal = cur && ws ? ws.s.goals.find((g) => g.id === cur!.id) : undefined
  const canCreate = !!title.trim() && (ongoing || !!deadline)

  const create = () => {
    if (!canCreate || !makeIn) return
    const g: Goal = {
      id: uid(),
      title: title.trim(),
      startDate: today(),
      deadline: ongoing ? '' : deadline,
      createdAt: Date.now(),
      ...(ongoing ? { ongoing: true } : {}),
    }
    wsOf(makeIn)!.set((st) => ({ ...st, goals: [...st.goals, g] }))
    setSel({ k: makeIn, id: g.id })
    setTitle('')
    setDeadline('')
    setOngoing(false)
    setCreating(null)
  }
  return (
    <div className="goals-page">
      <aside className="goal-list">
        <GoalList nav={nav} />
      </aside>

      <section className="goal-detail">
        {makeIn ? (
          <div className="create-goal">
            <h2>{makeIn === 'team' ? `New goal in ${space?.name ?? 'space'}` : 'New goal'}</h2>
            <p className="muted">
              A goal is the <b>big picture</b>. Give it a deadline if it ends on a date, or make it ongoing if it is something you keep doing, like reading or the gym.
              {makeIn === 'team' && ' Everyone in the space will see it and can work on it.'}
            </p>
            <input
              className="bare-input big"
              autoFocus
              placeholder={ongoing ? 'e.g. Read every day' : 'e.g. Pass the GCP Data Engineer exam'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <div className="seg kind-seg">
              <button className={!ongoing ? 'on' : ''} onClick={() => setOngoing(false)}>
                Ends on a date
              </button>
              <button className={ongoing ? 'on' : ''} onClick={() => setOngoing(true)}>
                Ongoing
              </button>
            </div>
            {!ongoing ? (
              <label className="field inline">
                <span>Deadline</span>
                <input type="date" min={today()} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </label>
            ) : (
              <p className="muted small">No end date. Add tasks that repeat (every day, weekdays, a few times a week) so you never retype them.</p>
            )}
            <div className="btn-row">
              <button className="primary" disabled={!canCreate} onClick={create}>
                Create goal
              </button>
              {(mine.s.goals.length > 0 || cur) && (
                <button className="link" onClick={() => setCreating(null)}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : goal && ws ? (
          <>
            <button className="link small back-all" onClick={() => setSel(null)}>
              ← All goals
            </button>
            <GoalDetail key={cur!.k + goal.id} goal={goal} ws={ws} spaceName={cur!.k === 'team' ? space?.name : undefined} />
          </>
        ) : (
          <Overview open={(id) => setSel({ k: 'mine', id })} create={() => setCreating('mine')} />
        )}
      </section>
    </div>
  )
}

/** All goals as tiles, grouped under sections you name. Drag a tile to reorder it or move it to another section. */
function Overview({ open, create }: { open: (id: string) => void; create: () => void }) {
  const { s, set } = useStore()
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [naming, setNaming] = useState<string | null>(null)
  const [name, setName] = useState('')
  const t = today()
  const sections = s.sections ?? []
  const ids = new Set(sections.map((x) => x.id))
  const inSec = (sec: string | null) => sortGoals(s).filter((g) => (g.sectionId && ids.has(g.sectionId) ? g.sectionId : null) === sec)
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6))

  const move = (goalId: string, sec: string | null, before?: string) =>
    set((st) => {
      const list = inSec(sec)
        .map((g) => g.id)
        .filter((id) => id !== goalId)
      const at = before ? list.indexOf(before) : -1
      list.splice(at < 0 ? list.length : at, 0, goalId)
      return {
        ...st,
        goals: st.goals.map((g) => (list.includes(g.id) ? { ...g, sectionId: sec, pos: list.indexOf(g.id) } : g)),
      }
    })
  const addSection = () => {
    const id = uid()
    set((st) => ({
      ...st,
      sections: [...(st.sections ?? []), { id, name: 'New section' }],
    }))
    setNaming(id)
    setName('')
  }
  const saveName = () => {
    if (naming)
      set((st) => ({
        ...st,
        sections: (st.sections ?? []).map((x) => (x.id === naming ? { ...x, name: name.trim() || x.name } : x)),
      }))
    setNaming(null)
  }

  const tile = (g: Goal, sec: string | null) => {
    const tasks = s.tasks.filter((x) => x.goalId === g.id)
    const open_ = tasks.filter((x) => x.status === 'open' && !x.repeat).length
    const done = tasks.filter((x) => x.status === 'done').length
    const reps = tasks.filter((x) => x.repeat && x.status === 'open')
    const repsDone = reps.filter((x) => doneOn(x, t)).length
    const days = new Set(s.logs.filter((l) => l.goalId === g.id).map((l) => l.date))
    const total = open_ + done
    return (
      <button
        key={g.id}
        className={`tile ${drag === g.id ? 'dragging' : ''} ${g.ongoing ? 'ongoing' : ''}`}
        draggable
        onDragStart={() => setDrag(g.id)}
        onDragEnd={() => (setDrag(null), setOver(null))}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.stopPropagation()
          if (drag && drag !== g.id) move(drag, sec, g.id)
          setOver(null)
        }}
        onClick={() => open(g.id)}
      >
        <span className="tile-title">{g.title}</span>
        <span className="tile-meta">
          {goalDueLabel(g)}
          {reps.length > 0 && ` · ${repsDone}/${reps.length} today`}
          {open_ > 0 && ` · ${open_} to do`}
        </span>
        <span className="tile-week" title="Days with a log in the last 7 days">
          {week.map((d) => (
            <i key={d} className={days.has(d) ? 'on' : ''} />
          ))}
        </span>
        {!g.ongoing && (
          <span className="gs-bar tile-bar">
            <i
              style={{
                width: `${total ? Math.round((done / total) * 100) : 0}%`,
              }}
            />
          </span>
        )}
      </button>
    )
  }
  const group = (sec: string | null, label: React.ReactNode) => (
    <div
      key={sec ?? 'none'}
      className={`tile-sec ${over === (sec ?? 'none') && drag ? 'over' : ''}`}
      onDragOver={(e) => (e.preventDefault(), setOver(sec ?? 'none'))}
      onDrop={() => (drag && move(drag, sec), setOver(null))}
    >
      <div className="tile-sec-head">{label}</div>
      <div className="tiles">
        {inSec(sec).map((g) => tile(g, sec))}
        {!inSec(sec).length && <div className="tile-empty">Drag a goal here</div>}
      </div>
    </div>
  )

  return (
    <div className="overview">
      <header className="page-head">
        <h2>Goals</h2>
        <div className="spacer" />
        <button className="link small" onClick={addSection}>
          + Section
        </button>
        <button className="primary" onClick={create}>
          + New goal
        </button>
      </header>
      {(inSec(null).length > 0 || !sections.length) && group(null, sections.length ? <span className="side-label">No section</span> : null)}
      {sections.map((sec) =>
        group(
          sec.id,
          naming === sec.id ? (
            <input className="sec-name" autoFocus value={name} placeholder="Section name" onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && saveName()} />
          ) : (
            <>
              <button className="side-label sec-title" onClick={() => (setNaming(sec.id), setName(sec.name))} title="Rename">
                {sec.name}
              </button>
              <button
                className="icon sec-del"
                title="Remove this section (its goals stay)"
                onClick={() =>
                  set((st) => ({
                    ...st,
                    sections: (st.sections ?? []).filter((x) => x.id !== sec.id),
                  }))
                }
              >
                ×
              </button>
            </>
          ),
        ),
      )}
      {s.goals.length > 1 && <p className="muted small">Drag a tile to reorder it or move it to another section.</p>}
    </div>
  )
}

function GoalDetail({ goal, ws, spaceName }: { goal: Goal; ws: Ws; spaceName?: string }) {
  const { toast } = useStore()
  const { s, set, by } = ws
  const t = today()
  // logs can be older than the goal's start (e.g. brought in from a shared goal): the grid reaches back to show them
  const first = s.logs.reduce((m, l) => (l.goalId === goal.id && l.date < m ? l.date : m), goal.startDate)
  // an ongoing goal has no end: its grid shows the last twelve weeks and runs to the end of next week
  const open = !!goal.ongoing || !goal.deadline
  const from = open && first < addDays(t, -84) ? addDays(t, -84) : first
  const end = open ? addDays(t, 13 - weekday(t)) : goal.deadline
  const clamp = (d: string) => (d < from ? from : d > end ? end : d)
  const [day, setDay] = useState<string | null>(null) // the box picked on the grid
  const [adding, setAdding] = useState<null | 'ms' | 'log'>(null)
  const pick = (d: string | null) => (setDay(d), setAdding(null))
  const [msText, setMsText] = useState('')
  const [logText, setLogText] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const startEdit = (x: { id: string; title: string }) => (setEditId(x.id), setEditText(x.title))
  const saveEdit = () => {
    if (editId && editText.trim()) set((st) => updateTask(st, editId, { title: editText.trim() }))
    setEditId(null)
  }
  const taskInput = useRef<HTMLInputElement>(null)
  const [taskText, setTaskText] = useState('')
  const [taskMs, setTaskMs] = useState('')
  const [taskRep, setTaskRep] = useState('')
  const [newMs, setNewMs] = useState('')
  const [newMsDate, setNewMsDate] = useState('')
  const [msForm, setMsForm] = useState(false)
  const [drag, setDrag] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const milestones = s.milestones.filter((m) => m.goalId === goal.id).sort((a, b) => (a.date < b.date ? -1 : 1))
  const msByDay = new Map<string, string[]>()
  for (const m of milestones) msByDay.set(m.date, [...(msByDay.get(m.date) ?? []), m.title])
  const dayMilestones = milestones.filter((m) => m.date === day)
  const nextMs = milestones.find((m) => !m.done && m.date >= t)
  const dayLogs = s.logs.filter((l) => l.goalId === goal.id && l.date === day).sort((a, b) => a.createdAt - b.createdAt)
  const q = queue(s, goal.id)
  const done = doneTasks(s, goal.id)
  const allTasks = s.tasks.filter((x) => x.goalId === goal.id)
  const taskTitle = (id: string | null) => (id ? s.tasks.find((x) => x.id === id)?.title : undefined)

  const patchGoal = (p: Partial<Goal>) =>
    set((st) => ({
      ...st,
      goals: st.goals.map((g) => (g.id === goal.id ? { ...g, ...p } : g)),
    }))
  const addMilestone = () => {
    if (!msText.trim() || !day) return
    set((st) => ({
      ...st,
      milestones: [
        ...st.milestones,
        {
          id: uid(),
          goalId: goal.id,
          date: day,
          title: msText.trim(),
          done: false,
          createdAt: Date.now(),
        },
      ],
    }))
    setMsText('')
  }
  const addMilestoneOn = () => {
    const date = newMsDate || clamp(t)
    if (!newMs.trim()) return
    set((st) => ({
      ...st,
      milestones: [
        ...st.milestones,
        {
          id: uid(),
          goalId: goal.id,
          date,
          title: newMs.trim(),
          done: false,
          createdAt: Date.now(),
        },
      ],
    }))
    setNewMs('')
    pick(clamp(date))
  }
  const addLog = () => {
    if (!logText.trim() || !day) return
    set((st) => ({
      ...st,
      logs: [
        ...st.logs,
        {
          id: uid(),
          goalId: goal.id,
          date: day,
          text: logText.trim(),
          taskId: null,
          createdAt: Date.now(),
          ...(by ? { by } : {}),
        },
      ],
    }))
    setLogText('')
  }
  const addTask = () => {
    if (!taskText.trim()) return
    const repeat = parseRepeat(taskRep)
    set((st) => ({
      ...st,
      tasks: [
        ...st.tasks,
        newTask(goal.id, taskText.trim(), {
          milestoneId: taskMs || null,
          ...(repeat ? { repeat } : {}),
        }),
      ],
    }))
    setTaskText('')
    setTaskRep('')
  }
  const drop = (target: string) => {
    if (!drag || drag === target) return
    const ids = q.map((x) => x.id)
    const [moved] = ids.splice(ids.indexOf(drag), 1)
    ids.splice(ids.indexOf(target), 0, moved)
    set((st) => setQueue(st, ids))
    setDrag(null)
  }
  const delGoal = () => {
    if (!confirmDel) return setConfirmDel(true)
    set((st) => ({
      ...st,
      goals: st.goals.filter((g) => g.id !== goal.id),
      milestones: st.milestones.filter((m) => m.goalId !== goal.id),
      logs: st.logs.filter((l) => l.goalId !== goal.id),
      tasks: st.tasks.filter((x) => x.goalId !== goal.id),
      timer: st.timer && st.tasks.find((x) => x.id === st.timer!.taskId)?.goalId === goal.id ? null : st.timer,
    }))
    toast('Goal deleted')
  }

  const msCard = (
    <>
      {!goal.inbox && (
        <div className="card">
          <h3>Milestones</h3>
          <p className="muted small">Targets along the way, each on a day. Add one here or by selecting a box on the grid.</p>
          {!msForm && (
            <button className="link small" onClick={() => setMsForm(true)}>
              + Add a milestone
            </button>
          )}
          {msForm && (
            <div className="add-ms">
              <input autoFocus placeholder="e.g. Finish chapter 3" value={newMs} onChange={(e) => setNewMs(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMilestoneOn()} />
              <input type="date" min={from} max={open ? undefined : end} value={newMsDate || clamp(t)} onChange={(e) => setNewMsDate(e.target.value)} title="The day this milestone is due" />
              <button className="primary add-btn" disabled={!newMs.trim()} onClick={addMilestoneOn}>
                Add
              </button>
            </div>
          )}
          {milestones.map((m) => {
            const mt = allTasks.filter((x) => x.milestoneId === m.id)
            const md = mt.filter((x) => x.status === 'done').length
            return (
              <div key={m.id} className="ms-item">
                <button
                  className={`check ${m.done ? 'on' : ''}`}
                  onClick={() =>
                    set((st) => ({
                      ...st,
                      milestones: st.milestones.map((y) => (y.id === m.id ? { ...y, done: !y.done } : y)),
                    }))
                  }
                >
                  {m.done ? '✓' : ''}
                </button>
                <button className="ms-body" onClick={() => pick(clamp(m.date))} title="Show this day on the grid">
                  <span className={m.done ? 'struck' : ''}>{m.title}</span>
                  <span className="muted small">
                    {fmtDay(m.date)} · {daysLeftLabel(m.date)}
                    {mt.length > 0 && ` · ${md}/${mt.length} tasks`}
                  </span>
                </button>
              </div>
            )
          })}
          {!milestones.length && <div className="muted small pad-y">No milestones yet.</div>}
        </div>
      )}
    </>
  )
  const timelineCard = (
    <div className="card timeline">
      <div className="tl-grid">
        <Grid start={from} deadline={goal.deadline} end={end} counts={logsByDay(s, goal.id)} milestones={msByDay} selected={day} onSelect={(d) => pick(d === day ? null : d)} />
      </div>

      <div className="day-side" key={day ?? 'none'}>
        {!day ? (
          <div className="day-rest">
            <div className="day-hint">
              <span className="day-hint-ico" aria-hidden>
                <i />
                <i />
                <i />
                <i className="on" />
              </span>
              <span>
                <b>Select any box on the grid</b> <span className="muted">{goal.inbox ? 'to see or add a log for that day.' : 'to add a milestone or a log for that day.'}</span>
              </span>
            </div>
            {msCard}
          </div>
        ) : (
          <>
            <div className="day-title">
              {fmtDay(day)}
              {day === t && <span className="today-chip">today</span>}
              {!open && day === goal.deadline && <span className="goal-chip">goal deadline</span>}
              <div className="spacer" />
              <button className="icon" onClick={() => pick(null)} title="Close" aria-label="Close this day">
                ×
              </button>
            </div>
            <div className="day-actions">
              {!goal.inbox && (
                <button className={`day-act ${adding === 'ms' ? 'on' : ''}`} onClick={() => setAdding(adding === 'ms' ? null : 'ms')}>
                  <span className="mdot inline" /> Add milestone
                </button>
              )}
              {day <= t ? (
                <button className={`day-act ${adding === 'log' ? 'on' : ''}`} onClick={() => setAdding(adding === 'log' ? null : 'log')}>
                  <span className="lg-dot" /> Add log
                </button>
              ) : (
                <span className="muted small day-note">Logs are for today or earlier.</span>
              )}
            </div>
            {adding === 'ms' && (
              <div className="day-entry">
                <input
                  autoFocus
                  placeholder="What should be reached by this day?"
                  value={msText}
                  onChange={(e) => setMsText(e.target.value)}
                  onKeyDown={(e) => (e.key === 'Enter' ? addMilestone() : e.key === 'Escape' && setAdding(null))}
                />
                <button className="primary" disabled={!msText.trim()} onClick={addMilestone}>
                  Add
                </button>
              </div>
            )}
            {adding === 'log' && (
              <div className="day-entry">
                <input
                  autoFocus
                  placeholder="What did you get done?"
                  value={logText}
                  onChange={(e) => setLogText(e.target.value)}
                  onKeyDown={(e) => (e.key === 'Enter' ? addLog() : e.key === 'Escape' && setAdding(null))}
                />
                <button className="primary" disabled={!logText.trim()} onClick={addLog}>
                  Add
                </button>
              </div>
            )}
            <div className="day-list">
              {dayMilestones.map((m) => (
                <div key={m.id} className="line-item">
                  <span className="mdot inline" />
                  <span className={m.done ? 'struck' : ''}>{m.title}</span>
                  <button
                    className="icon"
                    title="Delete milestone"
                    onClick={() =>
                      set((st) => ({
                        ...st,
                        milestones: st.milestones.filter((x) => x.id !== m.id),
                        tasks: st.tasks.map((x) => (x.milestoneId === m.id ? { ...x, milestoneId: null } : x)),
                      }))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              {dayLogs.map((l) => (
                <div key={l.id} className="line-item log-item">
                  <span className="lg-dot" />
                  <span className={l.note ? 'pre' : ''}>
                    {l.note && <span className="note-tag">note</span>}
                    {l.by && <span className="log-by">{l.by} · </span>}
                    {l.taskId && !l.done && <span className="log-src">{taskTitle(l.taskId) ?? 'Task'} · </span>}
                    {l.text}
                  </span>
                  {!l.ext && (
                    <button
                      className="icon"
                      title="Delete log"
                      onClick={() =>
                        set((st) => ({
                          ...st,
                          logs: st.logs.filter((x) => x.id !== l.id),
                        }))
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {!dayMilestones.length && !dayLogs.length && !adding && <div className="muted small">Nothing on this day yet.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
  const tasksCard = (
    <div className="card tasks-card">
      <h3>Tasks</h3>
      <p className="muted small">Small, actionable steps. They show on Home. Drag to reorder.</p>
      <div className="add-task">
        <input ref={taskInput} placeholder={open ? 'Add a task, e.g. Read 20 pages' : 'Add a task…'} value={taskText} onChange={(e) => setTaskText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
        <button className="primary add-btn" disabled={!taskText.trim()} onClick={() => (addTask(), taskInput.current?.focus())}>
          Add
        </button>
      </div>
      <div className="add-opts">
        {milestones.length > 0 && (
          <label>
            <span>Counts toward</span>
            <select
              value={taskMs}
              onChange={(e) => {
                setTaskMs(e.target.value)
                taskInput.current?.focus()
              }}
            >
              <option value="">The goal itself (no milestone)</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  ◆ {m.title} · {fmtDay(m.date)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Repeats</span>
          <select
            value={taskRep}
            onChange={(e) => {
              setTaskRep(e.target.value)
              taskInput.current?.focus()
            }}
          >
            {REPEATS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tasks-scroll">
        <div className="queue">
          {q.map((x, i) => {
            const m = milestones.find((mm) => mm.id === x.milestoneId)
            return (
              <div
                key={x.id}
                className={`q-item ${drag === x.id ? 'dragging' : ''} ${editId === x.id ? 'editing' : 'clickable'}`}
                title={editId === x.id ? undefined : 'Click to edit'}
                onClick={(e) => {
                  if (editId !== x.id && !(e.target as HTMLElement).closest('button, input, select')) startEdit(x)
                }}
                draggable={editId !== x.id}
                onDragStart={() => setDrag(x.id)}
                onDragEnd={() => setDrag(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(x.id)}
              >
                <span className="handle">⋮⋮</span>
                <span className="rank">{i + 1}</span>
                {editId === x.id ? (
                  <span className="q-edit">
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit()
                        if (e.key === 'Escape') setEditId(null)
                      }}
                    />
                    {milestones.length > 0 && (
                      <select
                        value={x.milestoneId ?? ''}
                        onChange={(e) =>
                          set((st) =>
                            updateTask(st, x.id, {
                              milestoneId: e.target.value || null,
                            }),
                          )
                        }
                        title="What this task counts toward"
                      >
                        <option value="">The goal itself (no milestone)</option>
                        {milestones.map((mm) => (
                          <option key={mm.id} value={mm.id}>
                            {mm.title}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      value={String(x.repeat ?? '')}
                      onChange={(e) =>
                        set((st) =>
                          updateTask(st, x.id, {
                            repeat: parseRepeat(e.target.value),
                          }),
                        )
                      }
                      title="Repeat"
                    >
                      {REPEATS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <button className="primary" onClick={saveEdit}>
                      Save
                    </button>
                  </span>
                ) : (
                  <span className={`q-title ${x.crucial ? 'crucial' : x.important ? 'important' : ''}`}>
                    <span className={x.repeat && doneOn(x, t) ? 'struck' : ''}>{x.title}</span>
                    <span className="q-ms">
                      {m ? <>◆ {m.title}</> : milestones.length > 0 ? <span className="muted">→ the goal itself</span> : null}
                      {x.repeat && (
                        <span className="q-rep">
                          {' '}
                          ↻ {repeatLabel(x.repeat)}
                          {typeof x.repeat === 'number' ? ` · ${doneThisWeek(x, t)}/${x.repeat} this week` : doneOn(x, t) ? ' · done today' : ''}
                        </span>
                      )}
                      {x.timeMs > 0 && <span className="muted"> · {fmtDur(x.timeMs)} so far</span>}
                    </span>
                  </span>
                )}
                {i > 0 && (
                  <button
                    className="icon touch-only"
                    title="Move up"
                    onClick={() => {
                      const ids = q.map((y) => y.id)
                      ;[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]
                      set((st) => setQueue(st, ids))
                    }}
                  >
                    ↑
                  </button>
                )}
                <button className={`icon ${x.crucial ? 'c-on' : ''}`} title="Crucial" onClick={() => set((st) => updateTask(st, x.id, { crucial: !x.crucial }))}>
                  !
                </button>
                <button className={`icon ${x.important ? 'i-on' : ''}`} title="Important" onClick={() => set((st) => updateTask(st, x.id, { important: !x.important }))}>
                  {x.important ? '★' : '☆'}
                </button>
                <button
                  className={`icon ${x.repeat && doneOn(x, t) ? 'd-on' : ''}`}
                  title={x.repeat ? (doneOn(x, t) ? 'Done today. Click to undo' : 'Done for today') : 'Mark done'}
                  onClick={() =>
                    set((st) =>
                      x.repeat
                        ? toggleRepeatDone(st, x, by)
                        : doneLog(
                            updateTask(st, x.id, {
                              status: 'done',
                              completedAt: Date.now(),
                              ...(by ? { doneBy: by } : {}),
                            }),
                            x,
                            by,
                          ),
                    )
                  }
                >
                  ✓
                </button>
                <button
                  className="icon"
                  title="Delete"
                  onClick={() => {
                    set((st) => ({
                      ...st,
                      tasks: st.tasks.filter((y) => y.id !== x.id),
                      timer: st.timer?.taskId === x.id ? null : st.timer,
                    }))
                    toast('Task deleted', {
                      label: 'Undo',
                      run: () => set((st) => ({ ...st, tasks: [...st.tasks, x] })),
                    })
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
          {!q.length && <div className="muted small pad-y">No open tasks.</div>}
        </div>
        {done.length > 0 && (
          <>
            <button className="link small" onClick={() => setShowDone(!showDone)}>
              {showDone ? '▾' : '▸'} Done · {done.length}
            </button>
            {showDone &&
              done.map((x) => (
                <div key={x.id} className="q-item done-item">
                  <span className="struck">{x.title}</span>
                  <span className="took">{[x.doneBy && `by ${x.doneBy}`, x.timeMs > 0 && `took ${fmtDur(x.timeMs)}`].filter(Boolean).join(' · ')}</span>
                  <button
                    className="icon"
                    title="Reopen"
                    onClick={() =>
                      set((st) =>
                        undoneLog(
                          updateTask(st, x.id, {
                            status: 'open',
                            completedAt: null,
                            order: -Date.now(),
                          }),
                          x.id,
                        ),
                      )
                    }
                  >
                    ↺
                  </button>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  )
  const planCard = (
    <>
      {goal.shareId && (
        <div className="card plan-card">
          <div className="bd-head">
            <h3>Plan and context</h3>
            <span className="muted small">Shared with your partner. The tasks above are sent as this plan's checklist.</span>
          </div>
          <textarea
            rows={Math.min(14, Math.max(4, (goal.planText ?? '').split('\n').length + 1))}
            value={goal.planText ?? ''}
            placeholder="Context, roadmap, ideas: whatever you both need to pick this up again."
            onChange={(e) => patchGoal({ planText: e.target.value })}
          />
        </div>
      )}
    </>
  )
  return (
    <div className="detail">
      <header className="detail-head">
        {spaceName && <span className="space-tag">{spaceName}</span>}
        <input className="title-input" value={goal.title} onChange={(e) => patchGoal({ title: e.target.value })} />
        <div className="detail-meta">
          {goal.inbox ? (
            <span className="pill-stat">One-off to-dos that belong to no goal</span>
          ) : open ? (
            <>
              <span className="pill-stat">Ongoing · no end date</span>
              <label className="field inline compact">
                <span>Set a deadline</span>
                <input type="date" min={t} value="" onChange={(e) => e.target.value && patchGoal({ deadline: e.target.value, ongoing: false })} />
              </label>
            </>
          ) : (
            <>
              <label className="field inline compact">
                <span>Deadline</span>
                <input type="date" min={goal.startDate} value={goal.deadline} onChange={(e) => e.target.value && patchGoal({ deadline: e.target.value })} />
              </label>
              <span className="pill-stat">{daysLeftLabel(goal.deadline)}</span>
              <button className="link small" onClick={() => patchGoal({ deadline: '', ongoing: true })} title="Turn this into an ongoing goal with no end date">
                Make ongoing
              </button>
            </>
          )}
          {!goal.inbox && (
            <span className="pill-stat">
              {milestones.filter((m) => m.done).length}/{milestones.length} milestones
            </span>
          )}
          <span className="pill-stat">
            {done.length}/{allTasks.length} tasks
          </span>
          <div className="spacer" />
          <button className="danger small-btn" onClick={delGoal} onBlur={() => setConfirmDel(false)}>
            {confirmDel ? 'Click again to delete' : 'Delete goal'}
          </button>
        </div>
      </header>

      {timelineCard}
      <div className={`bottom ${goal.shareId ? 'split' : ''}`}>
        {tasksCard}
        {planCard}
      </div>
    </div>
  )
}
