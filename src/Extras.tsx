import { useState } from 'react'
import { useStore } from './store'
import type { View } from './types'
import { daysLeftLabel, fmtDay, fmtDur, today } from './dates'
import { activeDays, recentDays, streaks } from './logic'
import { Brand } from './Brand'

/* ---------- Sign-in ---------- */

export function Login() {
  const { signIn, useAsGuest } = useStore()
  // Google or Supabase send people back here with an error in the address when sign-in is refused
  const [error] = useState(() => {
    const p = new URLSearchParams(location.hash.replace(/^#/, '') || location.search)
    const msg = p.get('error_description') || p.get('error')
    if (msg) history.replaceState(null, '', location.pathname)
    return msg ? msg.replace(/\+/g, ' ') : ''
  })
  return (
    <div className="login">
      <Brand />
      <h1>Chase big goals, one small task at a time.</h1>
      <p className="muted">Sign in to keep your goals, tasks and notes in sync on every device.</p>
      {error && (
        <div className="banner warn">
          Sign-in didn’t go through: {error}. If Google said “access blocked”, the person who runs this app needs to add your Google address as a test user.
        </div>
      )}
      <button className="google-btn" onClick={signIn}>
        <svg viewBox="0 0 18 18" aria-hidden>
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
        </svg>
        Continue with Google
      </button>
      <button className="link" onClick={useAsGuest}>
        Continue without an account
      </button>
      <p className="muted small login-legal">
        <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a>
      </p>
      <p className="muted small">Without an account, everything is saved on this device only. You can sign in later and your data comes with you.</p>
    </div>
  )
}

/* ---------- Tutorial ---------- */

const STEPS: { title: string; body: string; where?: string }[] = [
  { title: 'Welcome to Pursuit', body: 'Pursuit keeps you moving toward big goals by always showing you the next small thing to do. Here is how it fits together, in about a minute.' },
  { title: '1. Set a goal', body: 'A goal is the big picture: something you want to achieve by a date, like “Pass the exam by 29 Nov”. Creating one draws a grid with a box for every day until the deadline.', where: 'Goals → New goal' },
  { title: '2. Mark milestones', body: 'Milestones are targets along the way. Click any day on the grid and type one. That day gets a blue outline with a white dot; the goal itself is the green diamond; today has a pink outline.', where: 'Goals → click a day on the grid' },
  { title: '3. Add tasks', body: 'Tasks are small pieces of work you can finish in a sitting. They sit in a queue you can reorder. Mark a task ! crucial (red) or ★ important (pink) so it rises to the top of your day.', where: 'Goals → Tasks' },
  { title: '4. Work from Home', body: 'Home lists every open task from all your goals in one place, most urgent first: crucial, then important, then nearest deadline. Drag to set your own order. Click a task to focus on it. Press Start to time it, then pick Skip (not today) or Done.', where: 'Home' },
  { title: '5. Log, Notes and POA', body: 'Got something done? Open Log, type one line and press Enter; each log makes today’s box on the goal a brighter purple. Notes are optional, for more detail. POA is your plan of action: one step per box, and any step can become a task.', where: 'Home → Log / Notes / POA (top right)' },
  { title: '6. Timer, streak and stats', body: 'Press Start on a task when you begin; the time is saved to the task. Use Pursuit every day, even just to add or finish one task, and your streak grows. Open Stats to see how you are doing.', where: 'Flame in the sidebar → Stats' },
]

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1
  return (
    <div className="overlay">
      <div className="tutorial" role="dialog" aria-label="Tutorial">
        <div className="tut-dots">
          {STEPS.map((_, k) => (
            <span key={k} className={k === i ? 'on' : k < i ? 'past' : ''} />
          ))}
        </div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        {step.where && <div className="tut-where">Where: {step.where}</div>}
        <div className="tut-actions">
          <button className="link" onClick={onClose}>
            {last ? '' : 'Skip'}
          </button>
          <div className="btn-row">
            {i > 0 && (
              <button className="secondary" onClick={() => setI(i - 1)}>
                Back
              </button>
            )}
            <button className="primary" onClick={() => (last ? onClose() : setI(i + 1))}>
              {last ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Stats ---------- */

const BADGES = [3, 7, 14, 30, 60, 100, 365]
const dayLetter = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' })
}

export function Stats({ go }: { go: (v: View) => void }) {
  const { mine, team, space } = useStore()
  const [which, setWhich] = useState<'mine' | 'team'>('mine')
  const s = which === 'team' && team ? team.s : mine.s
  const st = streaks(s)
  const week = recentDays(s, 7)
  const two = recentDays(s, 14)
  const doneAll = s.tasks.filter((t) => t.status === 'done')
  const totalMs = s.tasks.reduce((a, t) => a + t.timeMs, 0)
  const weekMs = week.reduce((a, d) => a + d.ms, 0)
  const weekDone = week.reduce((a, d) => a + d.done, 0)
  const timed = doneAll.filter((t) => t.timeMs > 0)
  const maxDone = Math.max(1, ...two.map((d) => d.done))
  const maxMs = Math.max(1, ...two.map((d) => d.ms))
  const active = activeDays(s)
  const t0 = today()
  const atRisk = st.current > 0 && !st.activeToday
  const midnight = new Date()
  midnight.setHours(24, 0, 0, 0)
  const left = fmtDur(Math.max(60000, midnight.getTime() - Date.now()))
  const nextBadge = BADGES.find((n) => n > st.current)

  return (
    <div className="page">
      <h2>Stats</h2>
      {team && space && (
        <div className="seg stats-seg">
          <button className={which === 'mine' ? 'on' : ''} onClick={() => setWhich('mine')}>
            Mine
          </button>
          <button className={which === 'team' ? 'on' : ''} onClick={() => setWhich('team')}>
            {space.name}
          </button>
        </div>
      )}

      <div className={`streak-hero ${st.current ? 'lit' : ''} ${atRisk ? 'risk' : ''}`}>
        <div className="sh-flame">
          <Flame />
          <b key={st.current}>{st.current}</b>
        </div>
        <div className="sh-title">{st.current === 1 ? '1 day streak' : `${st.current} day streak`}</div>
        <div className="sh-sub">
          {st.current === 0
            ? 'Do one thing today, like adding or finishing a task, and your streak starts.'
            : st.activeToday
              ? 'Today is counted. Come back tomorrow to keep it going.'
              : `Do one thing in the next ${left} or the streak resets.`}
        </div>
        <div className="sh-week">
          {week.map((d) => (
            <div key={d.date} className={`sh-day ${active.has(d.date) ? 'done' : ''} ${d.date === t0 ? 'today' : ''}`} title={fmtDay(d.date)}>
              <span className="sh-dot">{active.has(d.date) ? <Flame /> : null}</span>
              <span>{dayLetter(d.date)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card badges-card">
        <div className="bd-head">
          <h3>Milestones</h3>
          {nextBadge && (
            <span className="muted small">
              {nextBadge - st.current} more day{nextBadge - st.current === 1 ? '' : 's'} to the {nextBadge}-day badge
            </span>
          )}
        </div>
        <div className="badges">
          {BADGES.map((n) => (
            <div key={n} className={`badge ${st.best >= n ? 'got' : ''} ${n === nextBadge ? 'next' : ''}`} title={st.best >= n ? `Earned: ${n}-day streak` : `Reach a ${n}-day streak`}>
              <b>{n}</b>
              <span>days</span>
            </div>
          ))}
        </div>
        {nextBadge && (
          <div className="gs-bar bd-bar">
            <i style={{ width: `${Math.min(100, (st.current / nextBadge) * 100)}%` }} />
          </div>
        )}
      </div>

      <div className="stat-grid">
        <Stat n={st.best} label="best streak (days)" />
        <Stat n={st.total} label="active days" />
        <Stat n={weekDone} label="tasks done, last 7 days" />
        <Stat n={doneAll.length} label="tasks done in total" />
        <Stat n={weekMs ? fmtDur(weekMs) : '0m'} label="focus time, last 7 days" />
        <Stat n={totalMs ? fmtDur(totalMs) : '0m'} label="focus time in total" />
        <Stat n={s.logs.filter((l) => !l.note).length} label="logs written" />
        <Stat n={timed.length ? fmtDur(timed.reduce((a, t) => a + t.timeMs, 0) / timed.length) : '–'} label="average time per task" />
      </div>

      <div className="card">
        <h3>Last 14 days</h3>
        <div className="bars">
          {two.map((d) => (
            <div key={d.date} className="bar-col" title={`${fmtDay(d.date)} · ${d.done} done · ${d.ms ? fmtDur(d.ms) : 'no'} focus time · ${d.logs} logs`}>
              <div className="bar-pair">
                <i className="b-done" style={{ height: `${(d.done / maxDone) * 100}%` }} />
                <i className="b-time" style={{ height: `${(d.ms / maxMs) * 100}%` }} />
              </div>
              <span>{d.date.slice(8)}</span>
            </div>
          ))}
        </div>
        <div className="grid-legend">
          <span>
            <i className="lg b-done" /> Tasks done
          </span>
          <span>
            <i className="lg b-time" /> Focus time
          </span>
        </div>
      </div>

      <div className="card">
        <h3>Goals</h3>
        {s.goals.map((g) => {
          const ts = s.tasks.filter((t) => t.goalId === g.id)
          const done = ts.filter((t) => t.status === 'done').length
          const ms = s.milestones.filter((m) => m.goalId === g.id)
          const pct = ts.length ? Math.round((done / ts.length) * 100) : 0
          return (
            <div key={g.id} className="goal-stat">
              <div className="gs-head">
                <b>{g.title}</b>
                <span className="muted small">{daysLeftLabel(g.deadline)}</span>
              </div>
              <div className="gs-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
              <div className="muted small">
                {done}/{ts.length} tasks · {ms.filter((m) => m.done).length}/{ms.length} milestones · {fmtDur(ts.reduce((a, t) => a + t.timeMs, 0))} focused
              </div>
            </div>
          )
        })}
        {!s.goals.length && (
          <button className="link" onClick={() => go('goals')}>
            Create your first goal
          </button>
        )}
      </div>
    </div>
  )
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="stat">
      <b>{n}</b>
      <span>{label}</span>
    </div>
  )
}

export function Flame() {
  return (
    <svg className="flame" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 1c.4 2.2 3.6 4 3.6 8a3.6 3.6 0 0 1-7.2 0c0-1.3.5-2.3 1.2-3 .1 1 .6 1.7 1.2 1.9C6.5 5.300 6.800 2.800 8 1z" />
    </svg>
  )
}
