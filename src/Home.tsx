import { useState } from 'react'
import { useStore } from './store'
import type { View } from './types'
import { daysLeftLabel, diffDays, fmtClock, fmtDay, fmtDur, keyOf, today } from './dates'
import { commitTimer, finishWork, newTask, patchToday, queue, taskDue, timerElapsed, todayList, updateTask, type Outcome } from './logic'

export function Home({ go, now }: { go: (v: View) => void; now: number }) {
  const { s, set, toast } = useStore()
  const [panel, setPanel] = useState<null | 'notes' | 'poa'>(null)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [goalId, setGoalId] = useState('')
  const [drag, setDrag] = useState<string | null>(null)

  if (!s.goals.length) {
    return (
      <div className="empty-hero">
        <h1>Start with a goal</h1>
        <p className="muted">A goal is the big picture: something you want to achieve by a date.</p>
        <button className="primary" onClick={() => go('goals')}>
          Create a goal
        </button>
      </div>
    )
  }

  const t0 = today()
  const list = todayList(s)
  const task = list.find((t) => t.id === s.focusId) ?? list[0]
  const inToday = new Set(list.map((t) => t.id))
  const doneToday = s.tasks.filter((t) => t.status === 'done' && t.completedAt && keyOf(new Date(t.completedAt)) === t0).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const goalOf = (id: string) => s.goals.find((g) => g.id === id)
  const addGoalId = goalId || s.goals[0].id

  // switching task ends a running session on the previous one (its time is kept)
  const focus = (id: string) => set((st) => ({ ...(st.timer && st.timer.taskId !== id ? commitTimer(st) : st), focusId: id }))

  const act = (outcome: Outcome) => {
    if (!task) return
    const i = list.findIndex((t) => t.id === task.id)
    const next = outcome === 'progress' ? list[(i + 1) % list.length] : (list[i + 1] ?? list[i - 1])
    const spent = task.timeMs + (s.timer?.taskId === task.id ? timerElapsed(s, Date.now()) : 0)
    const r = finishWork(s, task.id, outcome)
    set(() => ({ ...r.state, focusId: next?.id ?? null }))
    const label = outcome === 'done' ? (spent > 0 ? `Done · took ${fmtDur(spent)}` : 'Done') : outcome === 'skip' ? 'Skipped for today' : 'Progress saved'
    toast([label, r.logged && 'notes logged', r.created && `${r.created} new task${r.created > 1 ? 's' : ''} from POA`].filter(Boolean).join(' · '))
    setPanel(null)
  }

  const notToday = (id: string) => {
    set((st) => patchToday(st.timer?.taskId === id ? commitTimer(st) : st, (td) => ({ ...td, skipped: [...td.skipped, id], extra: td.extra.filter((x) => x !== id) })))
    toast('Removed from today', { label: 'Undo', run: () => set((st) => patchToday(st, (td) => ({ ...td, skipped: td.skipped.filter((x) => x !== id), extra: [...td.extra, id] }))) })
  }
  const pull = (id: string) => set((st) => patchToday(st, (td) => ({ ...td, extra: [...td.extra.filter((x) => x !== id), id], skipped: td.skipped.filter((x) => x !== id) })))
  const create = () => {
    if (!title.trim()) return
    const t = newTask(addGoalId, title.trim())
    set((st) => patchToday({ ...st, tasks: [...st.tasks, t] }, (td) => ({ ...td, extra: [...td.extra, t.id] })))
    setTitle('')
  }
  const drop = (target: string) => {
    if (!drag || drag === target) return
    const ids = list.map((t) => t.id)
    const [moved] = ids.splice(ids.indexOf(drag), 1)
    ids.splice(ids.indexOf(target), 0, moved)
    set((st) => patchToday(st, (td) => ({ ...td, order: ids })))
    setDrag(null)
  }

  const moveUp = (id: string) => {
    const ids = list.map((t) => t.id)
    const i = ids.indexOf(id)
    if (i < 1) return
    ;[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]
    set((st) => patchToday(st, (td) => ({ ...td, order: ids })))
  }

  // timer: nothing runs until Start is pressed
  const mine = task && s.timer?.taskId === task.id ? s.timer : null
  const running = !!mine?.start
  const start = () => task && set((st) => ({ ...commitTimer(st), timer: { taskId: task.id, start: Date.now(), accMs: 0 } }))
  const pause = () => set((st) => (st.timer?.start ? { ...st, timer: { ...st.timer, start: null, accMs: st.timer.accMs + (Date.now() - st.timer.start) } } : st))
  const resume = () => set((st) => (st.timer ? { ...st, timer: { ...st.timer, start: Date.now() } } : st))
  const stop = () => {
    const ms = timerElapsed(s, Date.now())
    set((st) => commitTimer(st))
    toast(`Session saved · ${fmtDur(ms)}`)
  }

  const goal = task ? goalOf(task.goalId) : undefined
  const milestone = task?.milestoneId ? s.milestones.find((m) => m.id === task.milestoneId) : undefined
  const parent = task?.parentId ? s.tasks.find((t) => t.id === task.parentId) : undefined
  const history = task ? s.logs.filter((l) => l.taskId === task.id || (parent && l.taskId === parent.id)).sort((a, b) => b.createdAt - a.createdAt) : []
  const due = task ? taskDue(s, task) : ''
  const spentNow = task ? task.timeMs + (mine ? timerElapsed(s, now) : 0) : 0
  const tone = (t: { crucial: boolean; important: boolean }) => (t.crucial ? 'crucial' : t.important ? 'important' : '')

  return (
    <div className={`home ${panel ? 'with-panel' : ''}`}>
      <aside className="today-list">
        <div className="tl-head">
          <span>Today</span>
          <span className="muted small">{fmtDay(t0)}</span>
        </div>
        {list.map((t, i) => (
          <div
            key={t.id}
            className={`tl-item ${t.id === task?.id ? 'on' : ''} ${drag === t.id ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDrag(t.id)}
            onDragEnd={() => setDrag(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(t.id)}
            onClick={() => focus(t.id)}
          >
            <span className="rank">{i + 1}</span>
            <span className="tl-main">
              <span className={`tl-title ${tone(t)}`}>{t.title}</span>
              <span className="gi-meta">
                {goalOf(t.goalId)?.title}
                {t.inProgress && <span className="tl-badge">in progress</span>}
                {s.timer?.taskId === t.id && <span className="tl-live" title="Timer session open" />}
              </span>
            </span>
            {i > 0 && (
              <button
                className="icon touch-only"
                title="Move up"
                onClick={(e) => {
                  e.stopPropagation()
                  moveUp(t.id)
                }}
              >
                ↑
              </button>
            )}
            <button
              className="icon"
              title="Not today"
              onClick={(e) => {
                e.stopPropagation()
                notToday(t.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
        {!list.length && <div className="muted small pad-y">Nothing lined up for today.</div>}

        <button className="link small tl-add" onClick={() => setAdding(!adding)}>
          {adding ? '− Close' : '+ Add to today'}
        </button>
        {adding && (
          <div className="tl-picker">
            <input placeholder="New task…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
            <select value={addGoalId} onChange={(e) => setGoalId(e.target.value)} title="Goal for the new task">
              {s.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
            {s.goals.map((g) => {
              const rest = queue(s, g.id)
                .filter((t) => !inToday.has(t.id))
                .slice(0, 5)
              if (!rest.length) return null
              return (
                <div key={g.id}>
                  <div className="side-label">{g.title}</div>
                  {rest.map((t) => (
                    <button key={t.id} className="tl-pick" onClick={() => pull(t.id)}>
                      <span>+</span> <span className={tone(t)}>{t.title}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {doneToday.length > 0 && (
          <>
            <div className="side-label tl-done-label">Done today · {doneToday.length}</div>
            {doneToday.map((t) => (
              <div key={t.id} className="tl-done">
                <span className="struck">{t.title}</span>
                {t.timeMs > 0 && <span className="took">{fmtDur(t.timeMs)}</span>}
              </div>
            ))}
          </>
        )}
      </aside>

      <section className="stage">
        {task ? (
          <div className="task-view">
            <div className="crumb">
              {goal?.title}
              {milestone && <> › {milestone.title}</>}
            </div>
            <h1 className={`task-title ${tone(task)}`}>{task.title}</h1>
            <div className="task-tags">
              <button className={`tag ${task.crucial ? 'tag-crucial' : ''}`} onClick={() => set((st) => updateTask(st, task.id, { crucial: !task.crucial }))} title="Crucial">
                ! crucial
              </button>
              <button className={`tag ${task.important ? 'tag-important' : ''}`} onClick={() => set((st) => updateTask(st, task.id, { important: !task.important }))} title="Important">
                ★ important
              </button>
              <span className={`tag static ${diffDays(t0, due) < 0 ? 'tag-crucial' : ''}`} title={milestone ? 'Milestone date' : 'Goal deadline'}>
                due {fmtDay(due)} · {daysLeftLabel(due)}
              </span>
              {spentNow > 0 && <span className="tag static">{fmtDur(spentNow)} spent</span>}
            </div>
            <div className="outcomes">
              <button className="oc" onClick={() => act('progress')}>
                In progress
              </button>
              <button className="oc" onClick={() => act('skip')}>
                Skip
              </button>
              <button className="oc done" onClick={() => act('done')}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="task-view">
            <h1 className="task-title muted-title">{doneToday.length ? 'All clear for today' : 'Nothing lined up'}</h1>
            <p className="muted">Add a task to one of your goals and it will show up here.</p>
            <button className="primary" onClick={() => setAdding(true)}>
              Add to today
            </button>
          </div>
        )}
      </section>

      {task && (
        <div className="panel-tabs">
          <button className={panel === 'notes' ? 'on' : ''} onClick={() => setPanel(panel === 'notes' ? null : 'notes')}>
            Notes{task.notesDraft ? ' •' : ''}
          </button>
          <button className={panel === 'poa' ? 'on' : ''} onClick={() => setPanel(panel === 'poa' ? null : 'poa')}>
            POA{task.poaDraft ? ' •' : ''}
          </button>
        </div>
      )}

      {task && panel && (
        <aside className="side-panel">
          {panel === 'notes' ? (
            <>
              <h3>Notes</h3>
              <p className="muted small">What you worked on. Saved as a log on today's box when you pick In progress, Skip or Done.</p>
              <textarea autoFocus rows={8} value={task.notesDraft} onChange={(e) => set((st) => updateTask(st, task.id, { notesDraft: e.target.value }))} placeholder="Where you are, what you found, where you left off…" />
              {history.length > 0 && (
                <>
                  <div className="side-label">Earlier</div>
                  {history.map((l) => (
                    <div key={l.id} className="hist">
                      <div className="muted small">
                        {fmtDay(l.date)}
                        {l.taskId !== task.id && parent ? ` · from “${parent.title}”` : ''}
                      </div>
                      <p>{l.text}</p>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <h3>Next plan of action</h3>
              <p className="muted small">One next step per line. Each line becomes a new task right after this one in the goal's queue when you pick In progress, Skip or Done.</p>
              <textarea autoFocus rows={8} value={task.poaDraft} onChange={(e) => set((st) => updateTask(st, task.id, { poaDraft: e.target.value }))} placeholder={'e.g.\nWrite the extraction script\nTest it on one workbook'} />
            </>
          )}
        </aside>
      )}

      {task && (
        <div className={`mini-timer ${running ? 'running' : ''}`}>
          {mine ? (
            <>
              <span className="mt-time">{fmtClock(timerElapsed(s, now))}</span>
              {running ? (
                <button className="mt-btn" onClick={pause} title="Pause" aria-label="Pause timer">
                  <svg viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" /><rect x="7" y="1.5" width="3" height="9" rx="1" /></svg>
                </button>
              ) : (
                <button className="mt-btn" onClick={resume} title="Resume" aria-label="Resume timer">
                  <svg viewBox="0 0 12 12"><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1l-7-4.4a.6.6 0 0 0-.9.5z" /></svg>
                </button>
              )}
              <button className="mt-btn" onClick={stop} title="Stop and save this session" aria-label="Stop timer">
                <svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1.5" /></svg>
              </button>
            </>
          ) : (
            <button className="mt-btn" onClick={start} title="Start timer" aria-label="Start timer">
              <svg viewBox="0 0 12 12"><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1l-7-4.4a.6.6 0 0 0-.9.5z" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
