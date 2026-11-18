import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from './store'
import type { View } from './types'
import { fmtClock, fmtDay, fmtDur, keyOf, today } from './dates'
import { commitTimer, streaks, timerElapsed, todayList, withMySpaceWork } from './logic'
import { Home, TaskGroup, type Focus } from './Home'
import { GoalList, Goals, type GoalNav, type GoalSel } from './Goals'
import { Meetings } from './Meetings'
import { Settings } from './Settings'
import { Brand } from './Brand'
import { Spaces } from './SpaceUI'
import { SPACES } from './config'
import { Shared } from './Shared'
import { Flame, Login, Stats, Tutorial } from './Extras'

const OWNER_HASH = 'e719f5715aff4be7e26ed390aceb0fd03d323850e143474c0b8ef2633afe4cc7'
const RAIL = 'pursuit:side-collapsed'
const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="sb-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)
const ICONS: Record<string, ReactNode> = {
  home: <path d="M3.500 9 10 3.500 16.500 9v7a1 1 0 0 1-1 1h-3.500v-4.500h-4V17H4.500a1 1 0 0 1-1-1z" />,
  goals: (
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.200" />
      <circle cx="10" cy="10" r="0.600" fill="currentColor" />
    </>
  ),
  meetings: (
    <>
      <rect x="3" y="4.500" width="14" height="12.500" rx="2" />
      <path d="M3 8.500h14M7 3v3M13 3v3" />
    </>
  ),
  shared: (
    <>
      <circle cx="7" cy="7.500" r="2.600" />
      <circle cx="14" cy="8.500" r="2.100" />
      <path d="M2.500 16c.4-2.600 2.200-4 4.500-4s4.100 1.400 4.500 4M12.500 12.200c2.600-.4 4.600.9 5 3.300" />
    </>
  ),
  stats: <path d="M4 16.500V11M8.500 16.500v-9M13 16.500v-6M17 16.500V4" />,
  settings: (
    <>
      <circle cx="10" cy="10" r="2.400" />
      <path d="M10 2.800v2M10 15.200v2M2.800 10h2M15.200 10h2M4.900 4.900l1.400 1.400M13.700 13.700l1.400 1.400M4.900 15.100l1.400-1.400M13.700 6.300l1.400-1.400" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="2.500" />
      <path d="M7.500 4v12" />
    </>
  ),
}

const VIEWS: View[] = ['shared', 'home', 'goals', 'meetings', 'spaces', 'stats', 'settings']
const fromHash = (): View => {
  const h = location.hash.slice(1) as View
  return VIEWS.includes(h) ? h : 'home'
}

export default function App() {
  const { s, set, mine, toasts, dismiss, auth, sync, loaded, team } = useStore()
  const [view, setView] = useState<View>(fromHash)
  const [now, setNow] = useState(Date.now())
  const [tutorial, setTutorial] = useState(false)
  const [focus, setFocus] = useState<Focus>(null)
  // the Shared page exists for one account only; the address is kept as a hash, not in the code
  const [owner, setOwner] = useState(false)
  useEffect(() => {
    let live = true
    const email = auth.status === 'in' ? (auth.email ?? '').trim().toLowerCase() : ''
    if (!email || !crypto?.subtle) return setOwner(false)
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)).then((buf) => {
      const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
      if (live) setOwner(hex === OWNER_HASH)
    })
    return () => {
      live = false
    }
  }, [auth.status, auth.email])
  const [goalSel, setGoalSel] = useState<GoalSel>(null)
  const [goalNew, setGoalNew] = useState<'mine' | 'team' | null>(null)
  const goalNav: GoalNav = { sel: goalSel, setSel: setGoalSel, creating: goalNew, setCreating: setGoalNew }
  const [rail, setRail] = useState(() => {
    try {
      return localStorage.getItem(RAIL) === '1'
    } catch {
      return false
    }
  })
  const toggleRail = () => {
    setRail(!rail)
    try {
      localStorage.setItem(RAIL, rail ? '0' : '1')
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    const h = () => setView(fromHash())
    window.addEventListener('hashchange', h)
    return () => (clearInterval(t), window.removeEventListener('hashchange', h))
  }, [])

  useEffect(() => {
    const live = s.timer?.start ? s : team?.s.timer?.start ? team.s : null
    document.title = live ? `${fmtClock(timerElapsed(live, now))} · Pursuit` : 'Pursuit'
  }, [now, s.timer, team?.s.timer])

  const go = (v: View) => {
    location.hash = v
    setView(v)
  }

  // after connecting Google Calendar, land back on Meetings
  useEffect(() => {
    if (auth.status !== 'in') return
    try {
      const back = sessionStorage.getItem('pursuit:return') as View | null
      if (back) {
        sessionStorage.removeItem('pursuit:return')
        go(back)
      }
    } catch {
      /* ignore */
    }
  }, [auth.status])

  if (auth.status === 'loading' || (auth.status === 'in' && !loaded)) return <div className="splash">Loading…</div>
  if (auth.status === 'out') return <Login />

  const showTutorial = tutorial || !s.tutorialSeen
  const closeTutorial = () => {
    setTutorial(false)
    if (!s.tutorialSeen) set((st) => ({ ...st, tutorialSeen: true }))
  }
  const streak = streaks(withMySpaceWork(s, team?.s ?? null, team?.by))

  const nav: [View, string][] = [
    ['home', 'Home'],
    ['goals', 'Goals'],
    ['meetings', 'Meetings'],
    ...(SPACES ? ([['spaces', 'Spaces']] as [View, string][]) : []),
    ...(owner ? ([['shared', 'Shared']] as [View, string][]) : []),
  ]

  // clicking a task anywhere opens it on Home; a timer running on another task is saved first
  const onFocus = (k: 'mine' | 'team', id: string) => {
    const open = s.timer?.taskId ?? team?.s.timer?.taskId
    if (open && open !== id) {
      if (s.timer) set((st) => commitTimer(st))
      if (team?.s.timer) team.set((st) => commitTimer(st, team.by))
    }
    setFocus({ k, id })
    if (view !== 'home') go('home')
  }
  const t0 = today()
  const myList = todayList(s)
  const curId = focus?.k === 'mine' && myList.some((t) => t.id === focus.id) ? focus.id : myList[0]?.id
  const doneToday = s.tasks.filter((t) => (t.status === 'done' && t.completedAt && keyOf(new Date(t.completedAt)) === t0) || (t.doneDays ?? []).includes(t0)).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const home = <Home go={go} now={now} focus={focus} onFocus={onFocus} setFocus={setFocus} />

  return (
    <div className={`app ${rail ? 'rail' : ''}`}>
      {/* desktop: everything lives in the sidebar */}
      <aside className="sidebar">
        <div className="sb-inner">
          <div className="sb-top">
            <button className="sb-mark" onClick={() => go('home')} aria-label="Pursuit" tabIndex={rail ? 0 : -1}>
              P<i />
            </button>
            <Brand onClick={() => go('home')} />
            <button className="sb-toggle" onClick={toggleRail} title={rail ? 'Keep the sidebar open' : 'Collapse the sidebar'} aria-label={rail ? 'Keep the sidebar open' : 'Collapse the sidebar'}>
              <Icon>{ICONS.panel}</Icon>
            </button>
          </div>

          <nav className="sb-nav">
            {[...nav, ['stats', 'Stats'] as [View, string]].map(([v, label]) => (
              <button key={v} className={`sb-item ${view === v ? 'on' : ''}`} onClick={() => go(v)} title={label}>
                <Icon>{ICONS[v] ?? ICONS.goals}</Icon>
                <span className="sb-label">{label}</span>
              </button>
            ))}
          </nav>

          {view === 'goals' ? (
            <div className="sb-tasks sb-goals" key="goals">
              <GoalList nav={goalNav} />
            </div>
          ) : (
          <div className="sb-tasks" key="tasks">
            <div className="tl-head">
              <span>My tasks</span>
              <span className="muted small">{fmtDay(t0)}</span>
            </div>
            <TaskGroup ws={mine} list={myList} curId={view === 'home' ? curId : undefined} onFocus={(id) => onFocus('mine', id)} emptyText="Nothing to do right now. Add a task below." />
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
          )}

          <div className="sb-foot">
            <button className={`sb-item sb-streak ${streak.activeToday ? 'lit' : ''}`} onClick={() => go('stats')} title={`${streak.current}-day streak`}>
              <span className="sb-flame">
                <Flame />
                <b>{streak.current}</b>
              </span>
              <span className="sb-label">
                {streak.current}-day streak{streak.activeToday ? '' : ' · not counted today yet'}
              </span>
            </button>
            <button className={`sb-item ${view === 'settings' ? 'on' : ''}`} onClick={() => go('settings')} title="Settings">
              <span className="sb-gear">
                <Icon>{ICONS.settings}</Icon>
                {sync === 'offline' && <i className="sync-dot" />}
              </span>
              <span className="sb-label">{auth.status === 'in' ? (auth.name ?? 'Settings') : 'Settings'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* phones: slim top bar + bottom tabs */}
      <nav className="navbar">
        <Brand onClick={() => go('home')} />
        <div className="nav-items">
          {nav.map(([v, label]) => (
            <button key={v} className={`nav-item ${view === v ? 'on' : ''}`} onClick={() => go(v)}>
              {label}
            </button>
          ))}
          <button className={`nav-item nav-stats ${view === 'stats' ? 'on' : ''}`} onClick={() => go('stats')}>
            Stats
          </button>
        </div>
        <button className={`streak-chip ${streak.activeToday ? 'lit' : ''} ${view === 'stats' ? 'on' : ''}`} onClick={() => go('stats')} title={`${streak.current}-day streak · open stats`}>
          <Flame /> {streak.current}
        </button>
        <button className={`nav-gear ${view === 'settings' ? 'on' : ''}`} onClick={() => go('settings')} title={`Settings${sync === 'offline' ? ' · not synced' : ''}`}>
          ⚙{sync === 'offline' && <i className="sync-dot" />}
        </button>
      </nav>
      <main>
        {view === 'home' && home}
        {view === 'goals' && <Goals nav={goalNav} />}
        {view === 'meetings' && <Meetings />}
        {view === 'spaces' && (SPACES ? <Spaces /> : home)}
        {view === 'shared' && (owner ? <Shared openGoal={(id) => (setGoalSel({ k: 'mine', id }), setGoalNew(null), go('goals'))} /> : home)}
        {view === 'stats' && <Stats go={go} />}
        {view === 'settings' && <Settings showTutorial={() => setTutorial(true)} />}
      </main>
      {showTutorial && <Tutorial onClose={closeTutorial} />}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.msg}</span>
            {t.action && (
              <button className="link" onClick={() => (t.action!.run(), dismiss(t.id))}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
