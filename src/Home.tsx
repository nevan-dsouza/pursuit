import { useEffect, useRef, useState } from 'react'
import { useStore, type Ws } from './store'
import type { Task, View } from './types'
import { daysLeftLabel, diffDays, fmtClock, fmtDay, fmtDur, keyOf, today } from './dates'
import { addLog, addPlanTasks, commitTimer, finishWork, newTask, poaLines, patchToday, taskDue, timerElapsed, todayList, todayState, updateTask, type Outcome } from './logic'
import { SpacePicker } from './SpaceUI'
import { SPACES } from './config'

type Kind = 'mine' | 'team'
const tone = (t: { crucial: boolean; important: boolean }) => (t.crucial ? 'crucial' : t.important ? 'important' : '')

/** One group of tasks: your own, or the selected space's. Used in the sidebar, and under the task on phones. */
export function TaskGroup({ ws, list, curId, onFocus, emptyText }: { ws: Ws; list: Task[]; curId?: string; onFocus: (id: string) => void; emptyText: string }) {
  const { toast } = useStore()
  const { s, set } = ws
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [goalId, setGoalId] = useState('')
  const [drag, setDrag] = useState<string | null>(null)
  const goalOf = (id: string) => s.goals.find((g) => g.id === id)
  const addGoalId = goalId && goalOf(goalId) ? goalId : s.goals[0]?.id
  const removed = s.tasks.filter((t) => t.status === 'open' && todayState(s).skipped.includes(t.id))

  const reorder = (ids: string[]) => set((st) => patchToday(st, (td) => ({ ...td, order: ids })))
  const drop = (target: string) => {
    if (!drag || drag === target) return
    const ids = list.map((t) => t.id)
    const [moved] = ids.splice(ids.indexOf(drag), 1)
    ids.splice(ids.indexOf(target), 0, moved)
    reorder(ids)
    setDrag(null)
  }
  const moveUp = (id: string) => {
    const ids = list.map((t) => t.id)
    const i = ids.indexOf(id)
    if (i < 1) return
    ;[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]
    reorder(ids)
  }
  const notToday = (id: string) => {
    set((st) => patchToday(st.timer?.taskId === id ? commitTimer(st, ws.by) : st, (td) => ({ ...td, skipped: [...td.skipped, id], extra: td.extra.filter((x) => x !== id) })))
    toast('Removed for today', { label: 'Undo', run: () => set((st) => patchToday(st, (td) => ({ ...td, skipped: td.skipped.filter((x) => x !== id) }))) })
  }
  const bringBack = (id: string) => set((st) => patchToday(st, (td) => ({ ...td, skipped: td.skipped.filter((x) => x !== id) })))
  const create = () => {
    if (!title.trim() || !addGoalId) return
    set((st) => ({ ...st, tasks: [...st.tasks, newTask(addGoalId, title.trim())] }))
    setTitle('')
  }

  return (
    <>
      <div className="tl-scroll">
        {list.map((t, i) => (
          <div
            key={t.id}
            className={`tl-item ${t.id === curId ? 'on' : ''} ${drag === t.id ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDrag(t.id)}
            onDragEnd={() => setDrag(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(t.id)}
            onClick={() => onFocus(t.id)}
            title="Click to focus · drag to reorder"
          >
            <span className="tl-main">
              <span className={`tl-title ${tone(t)}`}>{t.title}</span>
              <span className="tl-meta">
                {goalOf(t.goalId)?.title}
                {t.inProgress && <span className="tl-badge">in progress</span>}
                {s.timer?.taskId === t.id && <span className="tl-live" title="Timer session open" />}
              </span>
            </span>
            {i > 0 && (
              <button
                className="tl-x touch-only"
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
              className="tl-x"
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
      </div>
      {!list.length && <div className="muted small tl-empty">{emptyText}</div>}
      {list.length > 5 && <div className="tl-count">{list.length} tasks<span className="tl-more"> · scroll for more</span></div>}
      {list.length > 1 && todayState(s).order && (
        <div className="tl-order">
          Your order ·{' '}
          <button className="link" onClick={() => set((st) => patchToday(st, (td) => ({ ...td, order: null })))}>
            switch to automatic
          </button>
        </div>
      )}
      {s.goals.length > 0 && (
        <button className="link small tl-add" onClick={() => setAdding(!adding)}>
          {adding ? '− Close' : '+ Add a task'}
        </button>
      )}
      {adding && s.goals.length > 0 && (
        <div className="tl-picker">
          <input autoFocus placeholder="New task…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <select value={addGoalId} onChange={(e) => setGoalId(e.target.value)} title="Goal for the new task">
            {s.goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
          {removed.length > 0 && <div className="side-label">Removed for today</div>}
          {removed.map((t) => (
            <button key={t.id} className="tl-pick" onClick={() => bringBack(t.id)}>
              <span>+</span> <span className={tone(t)}>{t.title}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export type Focus = { k: Kind; id: string } | null

export function Home({ go, now, focus, onFocus, setFocus }: { go: (v: View) => void; now: number; focus: Focus; onFocus: (k: Kind, id: string) => void; setFocus: (f: Focus) => void }) {
  const { mine, team, toast, space } = useStore()
  const [panel, setPanel] = useState<null | 'log' | 'notes' | 'poa'>(null)
  const [logText, setLogText] = useState('')
  const [burst, setBurst] = useState(0)
  const t0 = today()
  const lists: Record<Kind, Task[]> = { mine: todayList(mine.s), team: team ? todayList(team.s) : [] }
  const wsOf = (k: Kind): Ws | null => (k === 'team' ? team : mine)

  // the task in the centre: the one you clicked, else the top of your own list, else the top of the space's
  let cur = focus && lists[focus.k].some((t) => t.id === focus.id) ? focus : null
  if (!cur) cur = lists.mine[0] ? { k: 'mine', id: lists.mine[0].id } : lists.team[0] ? { k: 'team', id: lists.team[0].id } : null
  const ws = cur ? wsOf(cur.k)! : null
  const list = cur ? lists[cur.k] : []
  const task = cur ? list.find((t) => t.id === cur!.id) : undefined

  // one timer at a time, across both lists
  const commitAll = () => {
    if (mine.s.timer) mine.set((st) => commitTimer(st))
    if (team?.s.timer) team.set((st) => commitTimer(st, team.by))
  }
  const doFocus = onFocus

  const act = (outcome: Outcome) => {
    if (!task || !ws || !cur) return
    const i = list.findIndex((t) => t.id === task.id)
    const next = list[i + 1] ?? list[i - 1]
    const spent = task.timeMs + (ws.s.timer?.taskId === task.id ? timerElapsed(ws.s, Date.now()) : 0)
    const steps = outcome === 'done' ? poaLines(task.poaDraft) : []
    const at = ws.s.tasks.filter((t) => t.goalId === task.goalId && t.status === 'open').sort((a, b) => a.order - b.order).findIndex((t) => t.id === task.id)
    const r = finishWork(ws.s, task.id, outcome, ws.by) // for the message only
    ws.set((st) => finishWork(st, task.id, outcome, ws.by).state)
    setFocus(next && next.id !== task.id ? { k: cur.k, id: next.id } : null)
    const label = outcome === 'done' ? (spent > 0 ? `Done · took ${fmtDur(spent)}` : 'Done') : 'Skipped for today'
    toast(
      [label, r.logged && 'notes saved'].filter(Boolean).join(' · '),
      steps.length ? { label: `Add ${steps.length} plan step${steps.length > 1 ? 's' : ''} as task${steps.length > 1 ? 's' : ''}`, run: () => ws.set((st) => addPlanTasks(st, task, steps, Math.max(0, at))) } : undefined,
    )
    setPanel(null)
  }

  // quick log: one line, Enter, done
  const submitLog = () => {
    if (!task || !ws || !logText.trim()) return
    ws.set((st) => addLog(st, task, logText, ws.by))
    setLogText('')
    setBurst((n) => n + 1)
  }

  // plan of action: one box per step
  const steps = task ? task.poaDraft.split('\n') : []
  const stepRefs = useRef<(HTMLInputElement | null)[]>([])
  const focusStep = useRef<number | null>(null)
  useEffect(() => {
    if (focusStep.current !== null) {
      stepRefs.current[focusStep.current]?.focus()
      focusStep.current = null
    }
  })
  const setSteps = (arr: string[]) => task && ws && ws.set((st) => updateTask(st, task.id, { poaDraft: arr.join('\n') }))
  const stepToTask = (i: number) => {
    if (!task || !ws || !steps[i]?.trim()) return
    const title = steps[i]
    const rest = steps.filter((_, k) => k !== i)
    ws.set((st) => addPlanTasks(updateTask(st, task.id, { poaDraft: rest.join('\n') }), task, [title]))
    toast(`Added “${title.trim()}” after this task`)
  }
  const allToTasks = () => {
    if (!task || !ws) return
    const titles = poaLines(task.poaDraft)
    ws.set((st) => addPlanTasks(updateTask(st, task.id, { poaDraft: '' }), task, titles))
    toast(`${titles.length} task${titles.length > 1 ? 's' : ''} added after this one`)
  }

  // timer: nothing runs until Start is pressed
  const timer = task && ws && ws.s.timer?.taskId === task.id ? ws.s.timer : null
  const running = !!timer?.start
  const start = () => {
    if (!task || !ws) return
    commitAll()
    ws.set((st) => ({ ...st, timer: { taskId: task.id, start: Date.now(), accMs: 0 } }))
  }
  const pause = () => ws?.set((st) => (st.timer?.start ? { ...st, timer: { ...st.timer, start: null, accMs: st.timer.accMs + (Date.now() - st.timer.start) } } : st))
  const resume = () => ws?.set((st) => (st.timer ? { ...st, timer: { ...st.timer, start: Date.now() } } : st))
  const stop = () => {
    if (!ws) return
    const ms = timerElapsed(ws.s, Date.now())
    ws.set((st) => commitTimer(st, ws.by))
    toast(`Session saved · ${fmtDur(ms)}`)
  }

  const isToday = (ts: number | null) => !!ts && keyOf(new Date(ts)) === t0
  const doneToday = [...mine.s.tasks, ...(team?.s.tasks ?? [])].filter((t) => t.status === 'done' && isToday(t.completedAt)).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))

  const noGoals = !mine.s.goals.length && !team?.s.goals.length
  const s = ws?.s
  const goal = task && s ? s.goals.find((g) => g.id === task.goalId) : undefined
  const milestone = task?.milestoneId && s ? s.milestones.find((m) => m.id === task.milestoneId) : undefined
  const parent = task?.parentId && s ? s.tasks.find((t) => t.id === task.parentId) : undefined
  const history = task && s ? s.logs.filter((l) => l.taskId === task.id || (parent && l.taskId === parent.id)).sort((a, b) => b.createdAt - a.createdAt) : []
  const todayLogs = task ? history.filter((l) => l.taskId === task.id && l.date === t0 && !l.note) : []
  const goalLogsToday = task && s ? s.logs.filter((l) => l.goalId === task.goalId && l.date === t0 && !l.note).length : 0
  const planCount = task ? poaLines(task.poaDraft).length : 0
  const level = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4)
  const due = task && s ? taskDue(s, task) : ''
  const spentNow = task && s ? task.timeMs + (timer ? timerElapsed(s, now) : 0) : 0

  return (
    <div className={`home ${panel ? 'with-panel' : ''}`}>
      <section className="stage">
        {task && s ? (
          <div className="task-view" key={task.id}>
            <div className="crumb">
              {cur?.k === 'team' && space && <span className="space-tag">{space.name}</span>}
              {goal?.title}
              {milestone && <> › {milestone.title}</>}
            </div>
            <h1 className={`task-title ${tone(task)}`}>{task.title}</h1>
            <div className="task-tags">
              <button className={`tag ${task.crucial ? 'tag-crucial' : ''}`} onClick={() => ws!.set((st) => updateTask(st, task.id, { crucial: !task.crucial }))} title="Crucial">
                ! crucial
              </button>
              <button className={`tag ${task.important ? 'tag-important' : ''}`} onClick={() => ws!.set((st) => updateTask(st, task.id, { important: !task.important }))} title="Important">
                ★ important
              </button>
              <span className={`tag static ${diffDays(t0, due) < 0 ? 'tag-crucial' : ''}`} title={milestone ? 'Milestone date' : 'Goal deadline'}>
                due {fmtDay(due)} · {daysLeftLabel(due)}
              </span>
              {spentNow > 0 && <span className="tag static">{fmtDur(spentNow)} spent</span>}
            </div>
            <div className="outcomes">
              <div className={`oc-timer ${timer ? 'active' : ''}`}>
                {timer ? (
                  <div className="oc-pair" key="on">
                    {running ? (
                      <button className="oc oc-ico" onClick={pause} title="Pause" aria-label="Pause timer">
                        <svg viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" /><rect x="7" y="1.5" width="3" height="9" rx="1" /></svg>
                      </button>
                    ) : (
                      <button className="oc oc-ico" onClick={resume} title="Resume" aria-label="Resume timer">
                        <svg viewBox="0 0 12 12"><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1l-7-4.4a.6.6 0 0 0-.9.5z" /></svg>
                      </button>
                    )}
                    <button className="oc oc-ico" onClick={stop} title="Stop and save this session" aria-label="Stop timer">
                      <svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1.5" /></svg>
                    </button>
                  </div>
                ) : (
                  <button className="oc oc-start" key="off" onClick={start} title="Start the timer for this task">
                    <svg viewBox="0 0 12 12"><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1l-7-4.4a.6.6 0 0 0-.9.5z" /></svg>
                    Start
                  </button>
                )}
              </div>
              <button className="oc" onClick={() => act('skip')} title="Leave it for another day">
                Skip
              </button>
              <button className="oc done" onClick={() => act('done')}>
                Done
              </button>
            </div>
            <div className={`timer-line ${timer ? 'show' : ''} ${running ? 'running' : ''}`} aria-live="off">
              <span className="tl-dot" />
              {timer ? fmtClock(timerElapsed(s, now)) : '0:00'}
              <span className="muted">{running ? '' : ' · paused'}</span>
            </div>
          </div>
        ) : (
          <div className="task-view">
            <h1 className="task-title muted-title">{noGoals ? 'Start with a goal' : doneToday.length ? 'All clear for today' : 'Nothing lined up'}</h1>
            <p className="muted">{noGoals ? 'A goal is the big picture: something you want to achieve by a date.' : 'Add a task to one of your goals and it will show up here.'}</p>
            <button className="primary" onClick={() => go('goals')}>
              {noGoals ? 'Create a goal' : 'Go to Goals'}
            </button>
          </div>
        )}
      </section>

      <div className="mobile-tasks">
        <div className="tl-head">
          <span>My tasks</span>
          <span className="muted small">{fmtDay(t0)}</span>
        </div>
        <TaskGroup ws={mine} list={lists.mine} curId={cur?.k === 'mine' ? cur.id : undefined} onFocus={(id) => doFocus('mine', id)} emptyText={mine.s.goals.length ? 'No open tasks.' : 'Create a goal to add tasks.'} />
        {doneToday.length > 0 && (
          <>
            <div className="side-label tl-done-label">Done today · {doneToday.length}</div>
            {doneToday.map((t) => (
              <div key={t.id} className="tl-done">
                <span className="struck">{t.title}</span>
                <span className="took">{t.timeMs > 0 ? fmtDur(t.timeMs) : ''}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {task && ws && (
        <div className="panel-tabs">
          <button className={panel === 'log' ? 'on' : ''} onClick={() => setPanel(panel === 'log' ? null : 'log')} title="One line about something you just got done">
            Log{todayLogs.length ? ` ${todayLogs.length}` : ''}
          </button>
          <button className={panel === 'notes' ? 'on' : ''} onClick={() => setPanel(panel === 'notes' ? null : 'notes')}>
            Notes{task.notesDraft ? ' •' : ''}
          </button>
          <button className={panel === 'poa' ? 'on' : ''} onClick={() => setPanel(panel === 'poa' ? null : 'poa')}>
            POA{planCount ? ` ${planCount}` : ''}
          </button>
        </div>
      )}

      {task && ws && panel && (
        <aside className="side-panel">
          {panel === 'log' ? (
            <>
              <h3>Log</h3>
              <p className="muted small">Got something done? Type one line and press Enter. Each log makes today's box on the goal brighter.</p>
              <div className="log-entry">
                <input autoFocus value={logText} onChange={(e) => setLogText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitLog()} placeholder="e.g. Extraction script runs end to end" />
                <button className="primary" disabled={!logText.trim()} onClick={submitLog}>
                  Log it
                </button>
              </div>
              <div className="log-meter">
                <span className={`lm-box p${level(goalLogsToday)}`} key={'b' + burst}>
                  {burst > 0 && <i className="lm-ring" />}
                </span>
                <span>
                  <b>{goalLogsToday}</b> log{goalLogsToday === 1 ? '' : 's'} today on {goal?.title}
                </span>
                {burst > 0 && (
                  <span className="lm-plus" key={'p' + burst}>
                    +1
                  </span>
                )}
              </div>
              {history.length > 0 && <div className="side-label">On this task</div>}
              {history.map((l, i) => (
                <div key={l.id} className={`hist ${i === 0 && burst > 0 && l.date === t0 ? 'fresh' : ''}`}>
                  <div className="muted small">
                    {l.date === t0 ? 'Today' : fmtDay(l.date)}
                    {l.by ? ` · ${l.by}` : ''}
                    {l.note ? ' · note' : ''}
                    {l.taskId !== task.id && parent ? ` · from “${parent.title}”` : ''}
                  </div>
                  <p className={l.note ? 'pre' : ''}>{l.text}</p>
                </div>
              ))}
            </>
          ) : panel === 'notes' ? (
            <>
              <h3>Notes</h3>
              <p className="muted small">Optional. More detail for later: where you are, what you found, where you left off. Saved with the task when you pick Skip or Done.</p>
              <textarea autoFocus rows={10} value={task.notesDraft} onChange={(e) => ws.set((st) => updateTask(st, task.id, { notesDraft: e.target.value }))} placeholder="Where you are, what you found, where you left off…" />
              {todayLogs.length > 0 && (
                <button
                  className="link small"
                  onClick={() => {
                    const lines = [...todayLogs].reverse().map((l) => `- ${l.text}`).filter((x) => !task.notesDraft.includes(x))
                    if (lines.length) ws.set((st) => updateTask(st, task.id, { notesDraft: [task.notesDraft.trimEnd(), ...lines].filter(Boolean).join('\n') + '\n' }))
                  }}
                >
                  + Bring in today's {todayLogs.length} log{todayLogs.length > 1 ? 's' : ''}
                </button>
              )}
            </>
          ) : (
            <>
              <h3>Plan of action</h3>
              <p className="muted small">What comes next, one step per box. Press Enter for another step. Turn a step into a task now, or leave it here as your plan.</p>
              <div className="steps">
                {steps.map((v, i) => (
                  <div key={i} className="step">
                    <span className="step-n">{i + 1}</span>
                    <input
                      ref={(el) => {
                        stepRefs.current[i] = el
                      }}
                      autoFocus={i === 0 && steps.length === 1}
                      value={v}
                      placeholder={i === 0 ? 'First next step…' : 'Next step…'}
                      onChange={(e) => setSteps(steps.map((x, k) => (k === i ? e.target.value.replace(/\n/g, ' ') : x)))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && v.trim()) {
                          setSteps([...steps.slice(0, i + 1), '', ...steps.slice(i + 1)])
                          focusStep.current = i + 1
                        } else if (e.key === 'Backspace' && !v && steps.length > 1) {
                          e.preventDefault()
                          setSteps(steps.filter((_, k) => k !== i))
                          focusStep.current = Math.max(0, i - 1)
                        }
                      }}
                    />
                    <button className="step-add" disabled={!v.trim()} onClick={() => stepToTask(i)} title="Add this step as a task, right after this one">
                      + task
                    </button>
                  </div>
                ))}
              </div>
              <div className="btn-row">
                <button
                  className="link small"
                  onClick={() => {
                    setSteps([...steps, ''])
                    focusStep.current = steps.length
                  }}
                >
                  + Add a step
                </button>
                {planCount > 1 && (
                  <button className="link small" onClick={allToTasks}>
                    Add all {planCount} as tasks
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  )
}
