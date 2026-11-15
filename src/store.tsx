import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { State } from './types'
import { emptyShared, merge3, normShared, pickShared, pickView, type Shared, type ViewState } from './spaces'
import { cloud } from './cloud'
import { SPACES } from './config'

/**
 * State lives in memory, is saved to this browser on every change, and (when signed in)
 * is synced to Supabase as one row per user: public.user_state(user_id, data jsonb).
 * Other devices pick changes up live and whenever the tab regains focus. Last write wins.
 */
const KEY = 'pursuit:v2'
const OWNER = 'pursuit:owner' // whose data is in KEY: a user id, or absent for guest
const GUEST = 'pursuit:guest'
const GTOKEN = 'pursuit:gtoken'
const SPACE = 'pursuit:space' // which space is open on this device
const viewKey = (id: string) => `pursuit:spaceview:${id}`
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const CLIENT = Math.random().toString(36).slice(2) // identifies this tab's writes
/** Test builds only (VITE_FAKE_SPACE=1): a signed-in user with one local space, no network. Compiled out of production. */
const FAKE = import.meta.env.VITE_FAKE_SPACE === '1'

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
    activeDates: [],
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

export interface SpaceInfo {
  id: string
  name: string
  code: string
  owner: string
  members: string[]
}
interface OpenSpace {
  id: string
  doc: Shared
  view: ViewState
}
const emptyView = (): ViewState => ({ timer: null, today: { date: '', extra: [], skipped: [], order: null }, focusId: null, selectedGoalId: null })
/** A space looks like a normal workspace to the rest of the app: shared content + this person's own view state. */
const compose = (sp: OpenSpace): State => ({ ...initialState(), ...sp.doc, ...sp.view, tutorialSeen: true })
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** One workspace: your own, or the selected space. */
export interface Ws {
  s: State
  set: (f: (s: State) => State) => void
  /** first name stamped on logs, sessions and finished tasks (spaces only) */
  by?: string
}

interface Ctx {
  /** your own workspace (same as `mine`) */
  s: State
  set: (f: (s: State) => State) => void
  mine: Ws
  /** the selected space, once loaded */
  team: Ws | null
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
  /** shared spaces */
  spaces: SpaceInfo[]
  spaceId: string | null
  space: SpaceInfo | null
  spaceLoading: boolean
  switchSpace: (id: string | null) => void
  createSpace: (name: string) => Promise<string | null>
  joinSpace: (code: string) => Promise<string | null>
  leaveSpace: (id: string) => Promise<void>
  connectCalendar: () => void
  calendarToken: () => string | null
  clearCalendarToken: () => void
}

const StoreCtx = createContext<Ctx>(null!)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(load)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [auth, setAuth] = useState<Auth>(FAKE ? { status: 'in', name: 'Test User', email: 'test@example.com' } : { status: cloud ? 'loading' : 'guest' })
  const [sync, setSync] = useState<Sync>('device')
  const [loaded, setLoaded] = useState(!cloud)

  const user = useRef<string | null>(null)
  const ready = useRef(false) // cloud checked for this user: safe to push
  const fromCloud = useRef(false) // the next state change came from the cloud: don't push it back
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRemote = useRef('')
  const latest = useRef(s)
  latest.current = s

  // ----- shared spaces -----
  const [spaces, setSpaces] = useState<SpaceInfo[]>(FAKE ? [{ id: 'fake', name: 'Launch team', code: 'ABCD2345', owner: 'me', members: ['Test User', 'Priya'] }] : [])
  const [spaceId, setSpaceId] = useState<string | null>(() => (!SPACES ? null : FAKE ? 'fake' : cloud ? ls.get(SPACE) : null))
  const [sp, setSp] = useState<OpenSpace | null>(() => (FAKE ? { id: 'fake', doc: normShared(JSON.parse(ls.get('pursuit:fake-space') ?? '{}')), view: emptyView() } : null))
  const spRef = useRef<OpenSpace | null>(null)
  spRef.current = sp
  const spBase = useRef<Shared>(emptyShared()) // the space as last seen on the server
  const spVersion = useRef(0)
  const spBusy = useRef(false)
  const spTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inSpace = SPACES && !!(sp && spaceId && sp.id === spaceId && auth.status === 'in')

  const flush = useRef(async () => {})
  flush.current = async () => {
    if (pending.current) clearTimeout(pending.current)
    pending.current = null
    if (!cloud || !user.current) return
    const stamp = new Date().toISOString()
    const { error } = await cloud.from('user_state').upsert({ user_id: user.current, data: latest.current, client_id: CLIENT, updated_at: stamp })
    if (!error) lastRemote.current = stamp
    setSync(error ? 'offline' : 'synced')
  }

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
    pending.current = setTimeout(() => flush.current(), 700)
  }, [s])

  // leaving or hiding the tab: save straight away instead of waiting
  useEffect(() => {
    const now = () => pending.current && flush.current()
    const onHide = () => document.visibilityState === 'hidden' && now()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', now)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', now)
    }
  }, [])

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

  const loadSpaces = useCallback(async () => {
    if (!SPACES || !cloud || !user.current) return
    const [a, b] = await Promise.all([cloud.from('spaces').select('id, name, code, owner'), cloud.from('space_members').select('space_id, display_name')])
    if (a.error || b.error) return
    const list: SpaceInfo[] = (a.data ?? []).map((x) => ({ ...x, members: (b.data ?? []).filter((m) => m.space_id === x.id).map((m) => m.display_name) }))
    list.sort((x, y) => x.name.localeCompare(y.name))
    setSpaces(list)
    const open = ls.get(SPACE)
    if (open && !list.some((x) => x.id === open)) {
      ls.del(SPACE)
      setSpaceId(null)
    }
  }, [])

  useEffect(() => {
    if (FAKE) return
    if (auth.status === 'in') loadSpaces()
    else {
      setSpaces([])
      setSp(null)
    }
  }, [auth.status, loadSpaces])

  /** Save the open space. If someone else saved first, merge their changes with ours task by task and try again. */
  const syncSpace = useCallback(async () => {
    if (!cloud || spBusy.current) return
    spBusy.current = true
    try {
      for (let i = 0; i < 5; i++) {
        const cur = spRef.current
        if (!cur || same(cur.doc, spBase.current)) break
        const local = cur.doc
        const v = spVersion.current
        const { data: rows, error } = await cloud
          .from('spaces')
          .update({ data: local, version: v + 1, client_id: CLIENT, updated_at: new Date().toISOString() })
          .eq('id', cur.id)
          .eq('version', v)
          .select('version')
        if (spRef.current?.id !== cur.id) return
        if (error) {
          setSync('offline')
          return
        }
        if (rows && rows.length) {
          spBase.current = local
          spVersion.current = v + 1
          continue // loop again in case more edits arrived while saving
        }
        const { data: remote, error: e2 } = await cloud.from('spaces').select('data, version').eq('id', cur.id).maybeSingle()
        if (e2 || !remote || spRef.current?.id !== cur.id) {
          setSync('offline')
          return
        }
        const theirs = normShared(remote.data)
        const merged = merge3(spBase.current, spRef.current!.doc, theirs)
        spBase.current = theirs
        spVersion.current = remote.version
        spRef.current = { ...spRef.current!, doc: merged }
        setSp((p) => (p && p.id === cur.id ? { ...p, doc: merged } : p))
      }
      setSync('synced')
    } finally {
      spBusy.current = false
    }
  }, [])

  const pullSpace = useCallback(async () => {
    const cur = spRef.current
    if (!cloud || !cur || spBusy.current) return
    const { data: remote, error } = await cloud.from('spaces').select('data, version').eq('id', cur.id).maybeSingle()
    if (error || !remote || spRef.current?.id !== cur.id || remote.version === spVersion.current) return
    const theirs = normShared(remote.data)
    const merged = merge3(spBase.current, spRef.current!.doc, theirs)
    spBase.current = theirs
    spVersion.current = remote.version
    setSp((p) => (p && p.id === cur.id ? { ...p, doc: merged } : p))
  }, [])

  // open the selected space and listen for other members' changes
  useEffect(() => {
    if (FAKE) return
    if (!cloud || auth.status !== 'in' || !spaceId) {
      setSp(null)
      return
    }
    let dead = false
    setSp(null)
    ;(async () => {
      const { data, error } = await cloud.from('spaces').select('data, version').eq('id', spaceId).maybeSingle()
      if (dead) return
      if (error || !data) {
        ls.del(SPACE)
        setSpaceId(null)
        return
      }
      const doc = normShared(data.data)
      spBase.current = doc
      spVersion.current = data.version
      let view = emptyView()
      try {
        view = { ...view, ...JSON.parse(ls.get(viewKey(spaceId)) ?? '{}') }
      } catch {
        /* keep the empty view */
      }
      setSp({ id: spaceId, doc, view })
    })()
    const ch = cloud
      .channel(`space-${spaceId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'spaces', filter: `id=eq.${spaceId}` }, (p) => {
        if ((p.new as { client_id?: string })?.client_id !== CLIENT) pullSpace()
      })
      .subscribe()
    const onVisible = () => document.visibilityState === 'visible' && (pullSpace(), loadSpaces())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      dead = true
      cloud!.removeChannel(ch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [auth.status, spaceId, pullSpace, loadSpaces])

  // save space edits (debounced) and remember this person's view of the space on this device
  useEffect(() => {
    if (!sp) return
    ls.set(viewKey(sp.id), JSON.stringify(sp.view))
    if (same(sp.doc, spBase.current)) return
    setSync('saving')
    if (spTimer.current) clearTimeout(spTimer.current)
    spTimer.current = setTimeout(syncSpace, 600)
  }, [sp, syncSpace])

  const switchSpace = (id: string | null) => {
    if (id) ls.set(SPACE, id)
    else ls.del(SPACE)
    setSpaceId(id)
  }
  const spaceRpc = async (fn: 'create_space' | 'join_space', args: Record<string, string>): Promise<string | null> => {
    if (!cloud) return 'Sign in to use spaces'
    const { data, error } = await cloud.rpc(fn, args)
    if (error) return error.message
    await loadSpaces()
    switchSpace((data as { id: string }).id)
    return null
  }
  const leaveSpace = async (id: string) => {
    if (!cloud || !user.current) return
    await cloud.from('space_members').delete().eq('space_id', id).eq('user_id', user.current)
    if (spaceId === id) switchSpace(null)
    await loadSpaces()
  }

  const oauth = (calendar: boolean) => {
    if (!cloud) return
    if (calendar) ls.set('pursuit:gcal-wanted', '1')
    cloud.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname, ...(calendar ? { scopes: CAL_SCOPE, queryParams: { prompt: 'consent' } } : {}) },
    })
  }

  // every change you make goes through here, so this is where a day gets marked as active
  const set = useCallback(
    (f: (s: State) => State) =>
      setS((prev) => {
        const next = f(prev)
        if (next === prev) return prev
        const changed = next.goals !== prev.goals || next.tasks !== prev.tasks || next.milestones !== prev.milestones || next.logs !== prev.logs || next.sessions !== prev.sessions
        const hasWork = next.goals.length + next.tasks.length + next.logs.length > 0
        const day = todayKey()
        if (!changed || !hasWork || (next.activeDates ?? []).includes(day)) return next
        return { ...next, activeDates: [...(next.activeDates ?? []), day] }
      }),
    [],
  )
  const setTeam = useCallback((f: (s: State) => State) => {
    setSp((prev) => {
      if (!prev) return prev
      const next = f(compose(prev))
      return { id: prev.id, doc: pickShared(next), view: pickView(next) }
    })
  }, [])
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
    mine: { s, set },
    team: inSpace ? { s: compose(sp!), set: setTeam, by: (auth.name ?? '').split(' ')[0] || 'Someone' } : null,
    spaces,
    spaceId,
    space: spaces.find((x) => x.id === spaceId) ?? null,
    spaceLoading: auth.status === 'in' && !!spaceId && !inSpace,
    switchSpace,
    createSpace: (name) => spaceRpc('create_space', { p_name: name }),
    joinSpace: (code) => spaceRpc('join_space', { p_code: code }),
    leaveSpace,
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
      ls.del(SPACE)
      setSpaceId(null)
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
