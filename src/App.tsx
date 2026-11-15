import { useEffect, useState } from 'react'
import { useStore } from './store'
import type { View } from './types'
import { fmtClock } from './dates'
import { streaks, timerElapsed } from './logic'
import { Home } from './Home'
import { Goals } from './Goals'
import { Meetings } from './Meetings'
import { Settings } from './Settings'
import { Brand } from './Brand'
import { Flame, Login, Stats, Tutorial } from './Extras'

const VIEWS: View[] = ['home', 'goals', 'meetings', 'stats', 'settings']
const fromHash = (): View => {
  const h = location.hash.slice(1) as View
  return VIEWS.includes(h) ? h : 'home'
}

export default function App() {
  const { s, set, toasts, dismiss, auth, sync, loaded } = useStore()
  const [view, setView] = useState<View>(fromHash)
  const [now, setNow] = useState(Date.now())
  const [tutorial, setTutorial] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    const h = () => setView(fromHash())
    window.addEventListener('hashchange', h)
    return () => (clearInterval(t), window.removeEventListener('hashchange', h))
  }, [])

  useEffect(() => {
    document.title = s.timer?.start ? `${fmtClock(timerElapsed(s, now))} · Pursuit` : 'Pursuit'
  }, [now, s.timer])

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
  const streak = streaks(s)

  const nav: [View, string][] = [
    ['home', 'Home'],
    ['goals', 'Goals'],
    ['meetings', 'Meetings'],
  ]

  return (
    <div className="app">
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
        {view === 'home' && <Home go={go} now={now} />}
        {view === 'goals' && <Goals />}
        {view === 'meetings' && <Meetings />}
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
