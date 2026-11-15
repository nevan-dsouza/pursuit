import { useState } from 'react'
import { useStore, uid } from './store'
import type { Goal } from './types'
import { daysLeftLabel, fmtDay, fmtDur, today } from './dates'
import { doneTasks, logsByDay, newTask, queue, setQueue, updateTask } from './logic'
import { Grid } from './Grid'

export function Goals() {
  const { s, set } = useStore()
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [creating, setCreating] = useState(s.goals.length === 0)
  const goal = s.goals.find((g) => g.id === s.selectedGoalId) ?? s.goals[0]

  const create = () => {
    if (!title.trim() || !deadline) return
    const g: Goal = { id: uid(), title: title.trim(), startDate: today(), deadline, createdAt: Date.now() }
    set((st) => ({ ...st, goals: [...st.goals, g], selectedGoalId: g.id }))
    setTitle('')
    setDeadline('')
    setCreating(false)
  }

  return (
    <div className="goals-page">
      <aside className="goal-list">
        <div className="side-label">Goals</div>
        {s.goals.map((g) => (
          <button key={g.id} className={`goal-item ${g.id === goal?.id && !creating ? 'on' : ''}`} onClick={() => (set((st) => ({ ...st, selectedGoalId: g.id })), setCreating(false))}>
            <span className="gi-title">{g.title}</span>
            <span className="gi-meta">{daysLeftLabel(g.deadline)}</span>
          </button>
        ))}
        <button className={`goal-item new ${creating ? 'on' : ''}`} onClick={() => setCreating(true)}>
          + New goal
        </button>
      </aside>

      <section className="goal-detail">
        {creating || !goal ? (
          <div className="create-goal">
            <h2>New goal</h2>
            <p className="muted">
              A goal is the <b>big picture</b>: what you want to achieve by a date. You'll set milestones along the way and break the work into small tasks.
            </p>
            <input className="bare-input big" autoFocus placeholder="e.g. Pass the GCP Data Engineer exam" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
            <label className="field inline">
              <span>Deadline</span>
              <input type="date" min={today()} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <div className="btn-row">
              <button className="primary" disabled={!title.trim() || !deadline} onClick={create}>
                Create goal
              </button>
              {s.goals.length > 0 && (
                <button className="link" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <GoalDetail key={goal.id} goal={goal} />
        )}
      </section>
    </div>
  )
}

function GoalDetail({ goal }: { goal: Goal }) {
  const { s, set, toast, by } = useStore()
  const t = today()
  const clamp = (d: string) => (d < goal.startDate ? goal.startDate : d > goal.deadline ? goal.deadline : d)
  const [day, setDay] = useState(clamp(t))
  const [msText, setMsText] = useState('')
  const [logText, setLogText] = useState('')
  const [taskText, setTaskText] = useState('')
  const [taskMs, setTaskMs] = useState('')
  const [drag, setDrag] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const milestones = s.milestones.filter((m) => m.goalId === goal.id).sort((a, b) => (a.date < b.date ? -1 : 1))
  const msByDay = new Map<string, string[]>()
  for (const m of milestones) msByDay.set(m.date, [...(msByDay.get(m.date) ?? []), m.title])
  const dayMilestones = milestones.filter((m) => m.date === day)
  const dayLogs = s.logs.filter((l) => l.goalId === goal.id && l.date === day).sort((a, b) => a.createdAt - b.createdAt)
  const q = queue(s, goal.id)
  const done = doneTasks(s, goal.id)
  const allTasks = s.tasks.filter((x) => x.goalId === goal.id)
  const taskTitle = (id: string | null) => (id ? s.tasks.find((x) => x.id === id)?.title : undefined)

  const patchGoal = (p: Partial<Goal>) => set((st) => ({ ...st, goals: st.goals.map((g) => (g.id === goal.id ? { ...g, ...p } : g)) }))
  const addMilestone = () => {
    if (!msText.trim()) return
    set((st) => ({ ...st, milestones: [...st.milestones, { id: uid(), goalId: goal.id, date: day, title: msText.trim(), done: false, createdAt: Date.now() }] }))
    setMsText('')
  }
  const addLog = () => {
    if (!logText.trim()) return
    set((st) => ({ ...st, logs: [...st.logs, { id: uid(), goalId: goal.id, date: day, text: logText.trim(), taskId: null, createdAt: Date.now(), ...(by ? { by } : {}) }] }))
    setLogText('')
  }
  const addTask = () => {
    if (!taskText.trim()) return
    set((st) => ({ ...st, tasks: [...st.tasks, newTask(goal.id, taskText.trim(), { milestoneId: taskMs || null })] }))
    setTaskText('')
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
      selectedGoalId: null,
    }))
    toast('Goal deleted')
  }

  return (
    <div className="detail">
      <header className="detail-head">
        <input className="title-input" value={goal.title} onChange={(e) => patchGoal({ title: e.target.value })} />
        <div className="detail-meta">
          <label className="field inline compact">
            <span>Deadline</span>
            <input type="date" min={goal.startDate} value={goal.deadline} onChange={(e) => e.target.value && patchGoal({ deadline: e.target.value })} />
          </label>
          <span className="pill-stat">{daysLeftLabel(goal.deadline)}</span>
          <span className="pill-stat">
            {milestones.filter((m) => m.done).length}/{milestones.length} milestones
          </span>
          <span className="pill-stat">
            {done.length}/{allTasks.length} tasks
          </span>
          <div className="spacer" />
          <button className="danger small-btn" onClick={delGoal} onBlur={() => setConfirmDel(false)}>
            {confirmDel ? 'Click again to delete' : 'Delete goal'}
          </button>
        </div>
      </header>

      <div className="card">
        <Grid start={goal.startDate} deadline={goal.deadline} counts={logsByDay(s, goal.id)} milestones={msByDay} selected={day} onSelect={setDay} />

        <div className="day-panel">
          <div className="day-title">
            {fmtDay(day)}
            {day === t && <span className="today-chip">today</span>}
            {day === goal.deadline && <span className="goal-chip">goal deadline</span>}
          </div>
          <div className="day-cols">
            <div>
              <div className="side-label">Milestones</div>
              {dayMilestones.map((m) => (
                <div key={m.id} className="line-item">
                  <span className="mdot inline" />
                  <span className={m.done ? 'struck' : ''}>{m.title}</span>
                  <button className="icon" title="Delete milestone" onClick={() => set((st) => ({ ...st, milestones: st.milestones.filter((x) => x.id !== m.id), tasks: st.tasks.map((x) => (x.milestoneId === m.id ? { ...x, milestoneId: null } : x)) }))}>
                    ×
                  </button>
                </div>
              ))}
              <input className="line-input" placeholder="Add a milestone for this day…" value={msText} onChange={(e) => setMsText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMilestone()} />
            </div>
            <div>
              <div className="side-label">Logs</div>
              {dayLogs.map((l) => (
                <div key={l.id} className="line-item log-item">
                  <span>
                    {l.by && <span className="log-by">{l.by} · </span>}
                    {l.taskId && <span className="log-src">{taskTitle(l.taskId) ?? 'Task'} · </span>}
                    {l.text}
                  </span>
                  <button className="icon" title="Delete log" onClick={() => set((st) => ({ ...st, logs: st.logs.filter((x) => x.id !== l.id) }))}>
                    ×
                  </button>
                </div>
              ))}
              {day <= t ? (
                <input className="line-input" placeholder="Log what you did…" value={logText} onChange={(e) => setLogText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLog()} />
              ) : (
                <div className="muted small">Logs can be added for today or earlier.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h3>Tasks</h3>
          <p className="muted small">Small, actionable steps. The top of the queue shows on Home. Drag to reorder.</p>
          <div className="add-task">
            <input placeholder="Add a task…" value={taskText} onChange={(e) => setTaskText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
            <select value={taskMs} onChange={(e) => setTaskMs(e.target.value)} title="Link to a milestone (optional)">
              <option value="">No milestone</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <div className="queue">
            {q.map((x, i) => {
              const m = milestones.find((mm) => mm.id === x.milestoneId)
              return (
                <div
                  key={x.id}
                  className={`q-item ${drag === x.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => setDrag(x.id)}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(x.id)}
                >
                  <span className="handle">⋮⋮</span>
                  <span className="rank">{i + 1}</span>
                  <span className={`q-title ${x.crucial ? 'crucial' : x.important ? 'important' : ''}`}>
                    {x.title}
                    {(m || x.timeMs > 0) && (
                      <span className="q-ms">
                        {m && <>◆ {m.title}</>}
                        {m && x.timeMs > 0 && ' · '}
                        {x.timeMs > 0 && <span className="muted">{fmtDur(x.timeMs)} so far</span>}
                      </span>
                    )}
                  </span>
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
                  <button className="icon" title="Mark done" onClick={() => set((st) => updateTask(st, x.id, { status: 'done', completedAt: Date.now(), ...(by ? { doneBy: by } : {}) }))}>
                    ✓
                  </button>
                  <button
                    className="icon"
                    title="Delete"
                    onClick={() => {
                      set((st) => ({ ...st, tasks: st.tasks.filter((y) => y.id !== x.id), timer: st.timer?.taskId === x.id ? null : st.timer }))
                      toast('Task deleted', { label: 'Undo', run: () => set((st) => ({ ...st, tasks: [...st.tasks, x] })) })
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
                    <button className="icon" title="Reopen" onClick={() => set((st) => ({ ...updateTask(st, x.id, { status: 'open', completedAt: null, order: -Date.now() }) }))}>
                      ↺
                    </button>
                  </div>
                ))}
            </>
          )}
        </div>

        <div className="card">
          <h3>Milestones</h3>
          <p className="muted small">Targets along the way. Click a day on the grid to add one.</p>
          {milestones.map((m) => {
            const mt = allTasks.filter((x) => x.milestoneId === m.id)
            const md = mt.filter((x) => x.status === 'done').length
            return (
              <div key={m.id} className="ms-item">
                <button className={`check ${m.done ? 'on' : ''}`} onClick={() => set((st) => ({ ...st, milestones: st.milestones.map((y) => (y.id === m.id ? { ...y, done: !y.done } : y)) }))}>
                  {m.done ? '✓' : ''}
                </button>
                <button className="ms-body" onClick={() => setDay(m.date)}>
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
      </div>
    </div>
  )
}
