import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { State } from './types'
import { cloud } from './cloud'

/**
 * State lives in memory, is saved to this browser on every change, and (when signed in)
 * is synced to Supabase as one row per user: public.user_state(user_id, data jsonb).
 * Other devices pick changes up live and whenever the tab regains focus. Last write wins.
 */
const KEY = 'pursuit:v2'
const OWNER = 'pursuit:owner' // whose data is in KEY: a user id, or absent for guest
const GUEST = 'pursuit:guest'
const GTOKEN = 'pursuit:gtoken'
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const CLIENT = Math.random().toString(36).slice(2) // identifies this tab's writes

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36)

export function initialState(): State {
  return {
    goals: [],
    milestones: [],
    logs: [],
    tasks: [],
    timer: null,
    selectedGoalId: null,
    focusId: null,
    today: { date: '', extra: [], skipped: [], order: null },
    sessions: [],
    tutorialSeen: false,
    settings: { googleClientId: '' },
  }
}

const merge = (data: Partial<State> | null | undefined): State => {
  const base = initialState()
  return { ...base, ...(data ?? {}), settings: { ...base.settings, ...(data?.settings ?? {}) } }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return merge(JSON.parse(raw))
  } catch {
    /* fall through */
  }
  return initialState()
}

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* storage unavailable */
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* storage unavailable */
    }
  },
}

export interface Toast {
  id: string
  msg: string
  action?: { label: string; run: () => void }
}

export interface Auth {
  status: 'loading' | 'out' | 'guest' | 'in'
  email?: string
  name?: string
}
export type Sync = 'device' | 'saving' | 'synced' | 'offline'

interface Ctx {
  s: State
  set: (f: (s: State) => State) => void
  toast: (msg: string, action?: Toast['action']) => void
  toasts: Toast[]
  dismiss: (id: string) => void
  auth: Auth
  sync: Sync
  /** false until the signed-in user's cloud data has been checked once */
  loaded: boolean
  canSignIn: boolean
  signIn: () => void
  signOut: () => void
  useAsGuest: () => void
  connectCalendar: () => void
  calendarToken: () => string | null
  clearCalendarToken: () => void
}

const StoreCtx = createContext<Ctx>(null!)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(load)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [auth, setAuth] = useState<Auth>({ status: cloud ? 'loading' : 'guest' })
  const [sync, setSync] = useState<Sync>('device')
  const [loaded, setLoaded] = useState(!cloud)

  const user = useRef<string | null>(null)
  const ready = useRef(false) // cloud checked for this user: safe to push
  const fromCloud = useRef(false) // the next state change came from the cloud: don't push it back
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRemote = useRef('')
  const latest = useRef(s)
  latest.current = s

  // always keep a copy on this device
  useEffect(() => ls.set(KEY, JSON.stringify(s)), [s])

  // push changes to the cloud, debounced
  useEffect(() => {
    if (!cloud || !ready.current || !user.current) return
    if (fromCloud.current) {
      fromCloud.current = false
      return
    }
    setSync('saving')
    if (pending.current) clearTimeout(pending.current)
    pending.current = setTimeout(async () => {
      pending.current = null
      const stamp = new Date().toISOString()
      const { error } = await cloud!.from('user_state').upsert({ user_id: user.current, data: latest.current, client_id: CLIENT, updated_at: stamp })
      if (!error) lastRemote.current = stamp
      setSync(error ? 'offline' : 'synced')
    }, 700)
  }, [s])

  const pull = useCallback(async () => {
    const id = user.current
    if (!cloud || !id || pending.current) return // unsaved local edits go first
    const { data, error } = await cloud.from('user_state').select('data, client_id, updated_at').eq('user_id', id).maybeSingle()
    if (id !== user.current) return
    if (error) {
      setSync('offline')
      setLoaded(true)
      return
    }
    const first = !ready.current
    ready.current = true
    if (!data) {
      setS((x) => ({ ...x })) // nothing in the cloud yet: upload what's on this device
    } else if (data.updated_at !== lastRemote.current && (first || data.client_id !== CLIENT)) {
      lastRemote.current = data.updated_at
      fromCloud.current = true
      setS(merge(data.data as Partial<State>))
    }
    setSync('synced')
    setLoaded(true)
  }, [])

  // auth
  useEffect(() => {
    if (!cloud) return
    const { data: sub } = cloud.auth.onAuthStateChange((_event, session) => {
      const u = session?.user
      if (session?.provider_token && ls.get('pursuit:gcal-wanted')) {
        try {
          sessionStorage.setItem(GTOKEN, JSON.stringify({ token: session.provider_token, exp: Date.now() + 50 * 60000 }))
        } catch {
          /* ignore */
        }
      }
      if (u) {
        if (user.current === u.id) return
        user.current = u.id
        ready.current = false
        const owner = ls.get(OWNER)
        if (owner && owner !== u.id) setS(initialState()) // another account's data was on this device
        ls.set(OWNER, u.id)
        setAuth({ status: 'in', email: u.email, name: (u.user_metadata?.full_name as string) || u.email })
        setTimeout(pull, 0) // never call Supabase from inside this callback
      } else {
        if (user.current) {
          user.current = null
          ready.current = false
          ls.del(OWNER)
          setS(initialState())
          setSync('device')
        }
        setLoaded(true)
        setAuth({ status: ls.get(GUEST) ? 'guest' : 'out' })
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [pull])

  // other devices: live updates, plus a check whenever the tab comes back
  useEffect(() => {
    if (!cloud || auth.status !== 'in' || !user.current) return
    const ch = cloud
      .channel('user_state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_state', filter: `user_id=eq.${user.current}` }, (p) => {
        if ((p.new as { client_id?: string })?.client_id !== CLIENT) pull()
      })
      .subscribe()
    const onVisible = () => document.visibilityState === 'visible' && pull()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', pull)
    return () => {
      cloud!.removeChannel(ch)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', pull)
    }
  }, [auth.status, pull])

  const oauth = (calendar: boolean) => {
    if (!cloud) return
    if (calendar) ls.set('pursuit:gcal-wanted', '1')
    cloud.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname, ...(calendar ? { scopes: CAL_SCOPE, queryParams: { prompt: 'consent' } } : {}) },
    })
  }

  const set = useCallback((f: (s: State) => State) => setS(f), [])
  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback(
    (msg: string, action?: Toast['action']) => {
      const id = uid()
      setToasts((t) => [...t.slice(-2), { id, msg, action }])
      setTimeout(() => dismiss(id), 5000)
    },
    [dismiss],
  )

  const value: Ctx = {
    s,
    set,
    toast,
    toasts,
    dismiss,
    auth,
    sync,
    loaded,
    canSignIn: !!cloud,
    signIn: () => oauth(false),
    signOut: () => {
      try {
        sessionStorage.removeItem(GTOKEN)
      } catch {
        /* ignore */
      }
      ls.del(GUEST)
      cloud?.auth.signOut()
    },
    useAsGuest: () => {
      ls.set(GUEST, '1')
      setAuth({ status: 'guest' })
    },
    connectCalendar: () => {
      try {
        sessionStorage.setItem('pursuit:return', 'meetings')
      } catch {
        /* ignore */
      }
      oauth(true)
    },
    calendarToken: () => {
      try {
        const raw = sessionStorage.getItem(GTOKEN)
        if (!raw) return null
        const { token, exp } = JSON.parse(raw)
        return Date.now() < exp ? token : null
      } catch {
        return null
      }
    },
    clearCalendarToken: () => {
      try {
        sessionStorage.removeItem(GTOKEN)
      } catch {
        /* ignore */
      }
    },
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export const useStore = () => useContext(StoreCtx)
