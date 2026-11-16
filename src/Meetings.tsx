import { useEffect, useState } from 'react'
import { useStore } from './store'
import { addDays, keyOf, today, weekday } from './dates'

/* Google Calendar, read-only. The access token comes from the Google sign-in (Supabase), asked for only on this page. */

interface Ev {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  hangoutLink?: string
  location?: string
  htmlLink?: string
  attendees?: { self?: boolean; responseStatus?: string }[]
}

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const MIN = 60000
const span = (ms: number) => {
  const m = Math.max(1, Math.round(ms / MIN))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}
const startMs = (e: Ev) => (e.start.dateTime ? new Date(e.start.dateTime).getTime() : 0)
const endMs = (e: Ev) => (e.end.dateTime ? new Date(e.end.dateTime).getTime() : 0)
const allDay = (e: Ev) => !e.start.dateTime
const joinLink = (e: Ev) => e.hangoutLink || e.location?.match(/https?:\/\/\S*(zoom\.us|teams\.microsoft|meet\.google|webex)\S*/i)?.[0]
/** A real meeting has other people or a call link; everything else is a block of your own time. */
const isMeeting = (e: Ev) => !!joinLink(e) || (e.attendees?.filter((a) => !a.self).length ?? 0) > 0
const ONLY = 'pursuit:meetings-only'
const dayParts = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return { wd: dt.toLocaleDateString(undefined, { weekday: 'short' }), n: d, long: dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) }
}

export function Meetings() {
  const { auth, canSignIn, signIn, connectCalendar, calendarToken, clearCalendarToken } = useStore()
  const [token, setToken] = useState<string | null>(calendarToken)
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [only, setOnly] = useState(() => {
    try {
      return localStorage.getItem(ONLY) === '1'
    } catch {
      return false
    }
  })
  const toggleOnly = () => {
    setOnly(!only)
    try {
      localStorage.setItem(ONLY, only ? '0' : '1')
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(i)
  }, [])

  const t = today()
  const monday = addDays(addDays(t, -weekday(t)), weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  const fetchEvents = async (tok: string) => {
    setLoading(true)
    setError('')
    try {
      const [y, m, d] = monday.split('-').map(Number)
      const min = new Date(y, m - 1, d).toISOString()
      const max = new Date(y, m - 1, d + 7).toISOString()
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } })
      if (r.status === 401 || r.status === 403) {
        clearCalendarToken()
        setToken(null)
        throw new Error('Calendar access has expired. Connect again.')
      }
      if (!r.ok) throw new Error(`Google Calendar returned ${r.status}`)
      const data = await r.json()
      const items: Ev[] = (data.items ?? []).filter((e: Ev) => !e.attendees?.some((a) => a.self && a.responseStatus === 'declined'))
      setEvents(items)
    } catch (e: any) {
      setError(e.message ?? 'Could not load events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchEvents(token)
  }, [token, weekOffset])

  if (!canSignIn || auth.status !== 'in') {
    return (
      <div className="page">
        <h2>Meetings</h2>
        <p className="muted">See this week's Google Calendar meetings next to your tasks.</p>
        {canSignIn ? (
          <button className="primary" onClick={signIn}>
            Sign in with Google
          </button>
        ) : (
          <div className="banner warn">Meetings needs Google sign-in, which works when Pursuit is opened from its web address, not from a downloaded file.</div>
        )}
      </div>
    )
  }

  const evDay = (e: Ev) => (e.start.date ? e.start.date : keyOf(new Date(e.start.dateTime!)))
  const all = events ?? []
  const shown = only ? all.filter(isMeeting) : all
  const day = picked && days.includes(picked) ? picked : days.includes(t) ? t : days[0]
  const list = shown.filter((e) => evDay(e) === day)
  const timed = list.filter((e) => !allDay(e))
  const wholeDay = list.filter(allDay)

  // today at a glance: what is on now, what is next, and how long you are free
  const todays = shown.filter((e) => evDay(e) === t && !allDay(e))
  const current = todays.filter((e) => startMs(e) <= now && endMs(e) > now).sort((a, b) => endMs(a) - startMs(a) - (endMs(b) - startMs(b)))[0]
  const next = todays.find((e) => startMs(e) > now)
  const meetingsLeft = todays.filter((e) => isMeeting(e) && endMs(e) > now).length

  // the day as rows: events, the gaps between them, and a line for "now"
  type Row = { k: 'ev'; e: Ev } | { k: 'free'; from: number; to: number } | { k: 'now' }
  const rows: Row[] = []
  let edge = 0
  let nowPlaced = day !== t
  for (const e of timed) {
    const st = startMs(e)
    if (edge && st - edge >= 30 * MIN) {
      if (!nowPlaced && now >= edge && now < st) {
        rows.push({ k: 'now' })
        nowPlaced = true
      }
      rows.push({ k: 'free', from: edge, to: st })
    }
    if (!nowPlaced && now < st) {
      rows.push({ k: 'now' })
      nowPlaced = true
    }
    rows.push({ k: 'ev', e })
    edge = Math.max(edge, endMs(e))
  }
  if (!nowPlaced && timed.length) rows.push({ k: 'now' })

  const link = (e: Ev) => joinLink(e)
  const title = (e: Ev) => e.summary || '(No title)'

  return (
    <div className="page meet">
      <header className="page-head">
        <h2>Meetings</h2>
        <div className="spacer" />
        {token && (
          <>
            <button className={`chip-toggle ${only ? 'on' : ''}`} onClick={toggleOnly} title="Hide blocks of your own time, like commute or study">
              Meetings only
            </button>
            <button className="link small" onClick={() => (clearCalendarToken(), setToken(null), setEvents(null))}>
              Disconnect
            </button>
          </>
        )}
      </header>

      {error && <div className="banner warn">{error}</div>}

      {!token ? (
        <div className="connect">
          <p className="muted">Pursuit asks Google for read-only access to your calendar. Meetings are shown here and never stored.</p>
          <button className="primary" onClick={connectCalendar}>
            Connect Google Calendar
          </button>
        </div>
      ) : loading && !events ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          {weekOffset === 0 && (
            <div className="glance">
              <div className={`gl-card ${current ? 'live' : ''}`}>
                <div className="gl-label">{current ? 'Now' : 'Right now'}</div>
                {current ? (
                  <>
                    <div className="gl-title">{title(current)}</div>
                    <div className="gl-sub">ends in {span(endMs(current) - now)}</div>
                    <div className="gl-bar">
                      <i style={{ width: `${Math.min(100, ((now - startMs(current)) / (endMs(current) - startMs(current))) * 100)}%` }} />
                    </div>
                    {link(current) && (
                      <a className="join" href={link(current)} target="_blank" rel="noreferrer">
                        Join
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <div className="gl-title">You're free</div>
                    <div className="gl-sub">{next ? `for ${span(startMs(next) - now)}, until ${timeOf(startMs(next))}` : 'for the rest of today'}</div>
                  </>
                )}
              </div>
              <div className="gl-card">
                <div className="gl-label">Next</div>
                {next ? (
                  <>
                    <div className="gl-title">{title(next)}</div>
                    <div className="gl-sub">
                      in {span(startMs(next) - now)} · {timeOf(startMs(next))}
                    </div>
                    {link(next) && (
                      <a className="join" href={link(next)} target="_blank" rel="noreferrer">
                        Join
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <div className="gl-title muted">Nothing else today</div>
                  </>
                )}
              </div>
              <div className="gl-card">
                <div className="gl-label">Today</div>
                <div className="gl-title">
                  {meetingsLeft} meeting{meetingsLeft === 1 ? '' : 's'} left
                </div>
                <div className="gl-sub">{todays.length} items on the calendar</div>
              </div>
            </div>
          )}

          <div className="day-strip">
            <button className="icon" onClick={() => (setWeekOffset(weekOffset - 1), setPicked(null))} aria-label="Previous week">
              ‹
            </button>
            {days.map((d) => {
              const p = dayParts(d)
              const evs = shown.filter((e) => evDay(e) === d)
              const meets = evs.filter(isMeeting).length
              return (
                <button key={d} className={`ds-day ${d === day ? 'on' : ''} ${d === t ? 'is-today' : ''} ${d < t ? 'past' : ''}`} onClick={() => setPicked(d)}>
                  <span className="ds-wd">{p.wd}</span>
                  <span className="ds-n">{p.n}</span>
                  <span className="ds-count">{evs.length ? (meets ? `${meets} meeting${meets > 1 ? 's' : ''}` : `${evs.length} item${evs.length > 1 ? 's' : ''}`) : 'free'}</span>
                </button>
              )
            })}
            <button className="icon" onClick={() => (setWeekOffset(weekOffset + 1), setPicked(null))} aria-label="Next week">
              ›
            </button>
          </div>
          {weekOffset !== 0 && (
            <button className="link small back-week" onClick={() => (setWeekOffset(0), setPicked(null))}>
              ← Back to this week
            </button>
          )}

          <div className="agenda" key={day + (only ? 'm' : 'a')}>
            <div className="ag-head">
              <b>{dayParts(day).long}</b>
              {day === t && <span className="today-chip">today</span>}
            </div>
            {wholeDay.map((e) => (
              <a key={e.id} className="ag-allday" href={e.htmlLink} target="_blank" rel="noreferrer">
                All day · {title(e)}
              </a>
            ))}
            {!list.length && <div className="ag-empty">{only && all.some((e) => evDay(e) === day) ? 'No meetings. Only your own blocks are on this day.' : 'Nothing on the calendar.'}</div>}
            {rows.map((r, i) =>
              r.k === 'now' ? (
                <div key={'now' + i} className="ag-now">
                  <span>{timeOf(now)}</span>
                  <i />
                </div>
              ) : r.k === 'free' ? (
                <div key={'f' + i} className={`ag-free ${day === t && r.to < now ? 'ended' : ''}`}>
                  <span className="ag-time" />
                  <span className="ag-free-text">
                    Free · {span(r.to - r.from)}
                    <span className="muted"> · {timeOf(r.from)} to {timeOf(r.to)}</span>
                  </span>
                </div>
              ) : (
                (() => {
                  const e = r.e
                  const ended = endMs(e) < now
                  const live = startMs(e) <= now && endMs(e) > now
                  return (
                    <div key={e.id} className={`ag-row ${isMeeting(e) ? 'meeting' : 'block'} ${ended ? 'ended' : ''} ${live ? 'live' : ''}`}>
                      <span className="ag-time">
                        {timeOf(startMs(e))}
                        <small>{span(endMs(e) - startMs(e))}</small>
                      </span>
                      <span className="ag-bar" />
                      <a className="ag-title" href={e.htmlLink} target="_blank" rel="noreferrer" title="Open in Google Calendar">
                        {title(e)}
                        {live && <em>now</em>}
                      </a>
                      {link(e) && !ended && (
                        <a className="join" href={link(e)} target="_blank" rel="noreferrer">
                          Join
                        </a>
                      )}
                    </div>
                  )
                })()
              ),
            )}
          </div>
        </>
      )}
    </div>
  )
}
