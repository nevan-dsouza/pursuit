import { useEffect, useState } from 'react'
import { useStore } from './store'
import { addDays, fmtDay, keyOf, today, weekday } from './dates'

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

const timeOf = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '')

export function Meetings() {
  const { auth, canSignIn, signIn, connectCalendar, calendarToken, clearCalendarToken } = useStore()
  const [token, setToken] = useState<string | null>(calendarToken)
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)

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
  const nowMs = Date.now()

  return (
    <div className="page wide">
      <header className="page-head">
        <h2>Meetings</h2>
        <div className="week-nav">
          <button className="icon" onClick={() => setWeekOffset(weekOffset - 1)}>
            ‹
          </button>
          <span>
            {weekOffset === 0 ? 'This week' : `${fmtDay(days[0])} – ${fmtDay(days[6])}`}
          </span>
          <button className="icon" onClick={() => setWeekOffset(weekOffset + 1)}>
            ›
          </button>
        </div>
        <div className="spacer" />
        {token ? (
          <button className="link small" onClick={() => (clearCalendarToken(), setToken(null), setEvents(null))}>
            Disconnect
          </button>
        ) : null}
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
        <div className="week">
          {days.map((d) => {
            const list = (events ?? []).filter((e) => evDay(e) === d)
            return (
              <div key={d} className={`week-day ${d === t ? 'is-today' : ''} ${d < t ? 'past' : ''}`}>
                <div className="wd-head">
                  <span>{fmtDay(d)}</span>
                  {d === t && <span className="today-chip">today</span>}
                </div>
                {list.length ? (
                  list.map((e) => {
                    const ended = e.end.dateTime ? new Date(e.end.dateTime).getTime() < nowMs : d < t
                    return (
                      <div key={e.id} className={`ev ${ended ? 'ended' : ''}`}>
                        <div className="ev-time">{e.start.date ? 'All day' : `${timeOf(e.start.dateTime)} – ${timeOf(e.end.dateTime)}`}</div>
                        <div className="ev-title">{e.summary || '(No title)'}</div>
                        <div className="ev-links">
                          {e.hangoutLink && !ended && (
                            <a href={e.hangoutLink} target="_blank" rel="noreferrer">
                              Join
                            </a>
                          )}
                          {e.htmlLink && (
                            <a href={e.htmlLink} target="_blank" rel="noreferrer">
                              Open
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="muted small">No meetings</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
