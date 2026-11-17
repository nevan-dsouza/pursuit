import { useEffect, useState } from 'react'
import { useStore } from './store'
import { fmtDay } from './dates'
import { OT, applyRemote, buildMine, describe, getToken, importGoal, items, readRemote, setToken, shareGoal, writeMine, type GoalDoc, type Item, type PlanDoc, type Remote } from './onetask'

/* Shared goals with a partner on onetask. Shown to one account only (see App). */
export function Shared({ openGoal }: { openGoal: (id: string) => void }) {
  const { s, set, toast } = useStore()
  const [token, setTok] = useState(getToken)
  const [draft, setDraft] = useState('')
  const [remote, setRemote] = useState<Remote | null>(null)
  const [busy, setBusy] = useState<'' | 'pull' | 'push'>('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [showOld, setShowOld] = useState(false)

  const pull = async (quiet = false) => {
    setBusy('pull')
    setError('')
    try {
      const r = await readRemote()
      setRemote(r)
      set((st) => applyRemote(st, r))
      if (!quiet) toast(`Pulled ${r.files.length} shared file${r.files.length === 1 ? '' : 's'}`)
      return r
    } catch (e: any) {
      setError(e.message ?? 'Could not read the shared branch')
      return null
    } finally {
      setBusy('')
    }
  }
  const push = async () => {
    setBusy('push')
    setError('')
    try {
      const r = await readRemote() // always work from the newest version on the branch
      const fresh = applyRemote(s, r)
      const { docs, state } = buildMine(fresh, r)
      const n = await writeMine(r, docs)
      set(() => state)
      setRemote(await readRemote())
      toast(n ? `Pushed ${n} file${n === 1 ? '' : 's'} to ${OT.me}/` : 'Nothing new to push')
    } catch (e: any) {
      setError(e.message ?? 'Could not push')
    } finally {
      setBusy('')
    }
  }
  useEffect(() => {
    if (token) pull(true)
  }, [token])

  const all = remote ? items(remote) : []
  const goals = all.filter((x) => x.kind === 'goal') as Item<GoalDoc>[]
  const taskPlans = new Set(s.goals.map((g) => g.taskPlanId).filter(Boolean))
  const plans = (all.filter((x) => x.kind === 'plan') as Item<PlanDoc>[]).filter((p) => !taskPlans.has(p.id))
  const linked = (id: string) => s.goals.find((g) => g.shareId === id)
  const mineShared = s.goals.filter((g) => g.shareId)
  const notShared = s.goals.filter((g) => !g.shareId)

  const live = goals.filter((g) => g.sharedBy.length > 0 || linked(g.id))
  const old = goals.filter((g) => !g.sharedBy.length && !linked(g.id))
  const goalRow = (it: Item<GoalDoc>) => {
              const g = linked(it.id)
              const entries = it.files.reduce((n, f) => n + (f.doc.kind === 'goal' ? f.doc.entries.length : 0), 0)
              return (
                <div key={it.id} className="sh-row">
                  <div className="sh-main">
                    <b>{it.newest.title}</b>
                    <span className="muted small">
                      Goal · {describe(it.newest)} · {entries} log{entries === 1 ? '' : 's'} · {it.sharedBy.length ? `shared by ${it.sharedBy.join(', ')}` : 'older goal, no partner shares it now'} · last saved by {it.newest.saved_by}
                    </span>
                  </div>
                  {g ? (
                    <button className="link small" onClick={() => openGoal(g.id)}>
                      In your goals →
                    </button>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() => {
                        set((st) => importGoal(st, it))
                        toast(`Added “${it.newest.title}” to your goals`)
                      }}
                    >
                      Add to my goals
                    </button>
                  )}
                </div>
              )
            }

  return (
    <div className="page shared">
      <header className="page-head">
        <h2>Shared</h2>
        <span className="muted small">
          {OT.owner}/{OT.repo} · {OT.branch} · you are {OT.me}
        </span>
        <div className="spacer" />
        {token && (
          <>
            <button className="secondary" disabled={!!busy} onClick={() => pull()}>
              {busy === 'pull' ? 'Pulling…' : 'Pull'}
            </button>
            <button className="primary" disabled={!!busy || !mineShared.length} onClick={push} title={mineShared.length ? `Write your side to ${OT.me}/ on the shared branch` : 'Share a goal first'}>
              {busy === 'push' ? 'Pushing…' : 'Push'}
            </button>
          </>
        )}
      </header>

      {error && <div className="banner warn">{error}</div>}

      {!token ? (
        <div className="card">
          <h3>Connect GitHub</h3>
          <p className="muted small">
            Paste a GitHub personal access token (classic) with the <b>repo</b> scope. Create one at github.com → Settings → Developer settings → Personal access tokens → Tokens (classic). You also need to be a collaborator on {OT.owner}/{OT.repo}. The token is kept in this browser only and is not synced to your account.
          </p>
          <div className="log-entry">
            <input type="password" autoComplete="off" placeholder="ghp_…" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="primary" disabled={!draft.trim()} onClick={() => (setToken(draft.trim()), setTok(draft.trim()), setDraft(''))}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <h3>On the shared branch</h3>
            {!remote && <p className="muted small">{busy ? 'Reading…' : 'Press Pull to read the branch.'}</p>}
            {remote && !live.length && !old.length && !plans.length && <p className="muted small">Nothing shared yet.</p>}
            {live.map(goalRow)}
            {plans.map((it) => (
              <div key={it.id} className="sh-row col">
                <button className="sh-main as-btn" onClick={() => setOpen(open === it.id ? null : it.id)}>
                  <b>{it.newest.title}</b>
                  <span className="muted small">
                    Plan · {describe(it.newest)} · last saved by {it.newest.saved_by} · {open === it.id ? 'hide' : 'read'}
                  </span>
                </button>
                {open === it.id && <p className="pre sh-body">{it.newest.body}</p>}
              </div>
            ))}
            {old.length > 0 && (
              <>
                <button className="link small sh-old" onClick={() => setShowOld(!showOld)}>
                  {showOld ? 'Hide' : 'Show'} {old.length} older goal{old.length === 1 ? '' : 's'} your partner no longer shares
                </button>
                {showOld && old.map(goalRow)}
              </>
            )}
            {remote && (
              <p className="muted small sh-foot">
                Read {new Date(remote.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                {remote.skipped.length ? ` · ${remote.skipped.length} file(s) could not be read` : ''}
              </p>
            )}
          </div>

          <div className="card">
            <h3>What you share</h3>
            <p className="muted small">
              Push writes each shared goal to {OT.me}/ on the branch: its title, dates, milestones, your logs, and its tasks as a checklist plan. Your partner's logs and any tasks they add or tick come back on Pull.
            </p>
            {mineShared.map((g) => (
              <div key={g.id} className="sh-row">
                <div className="sh-main">
                  <b>{g.title}</b>
                  <span className="muted small">
                    due {fmtDay(g.deadline)} · {s.tasks.filter((t) => t.goalId === g.id && t.status === 'open').length} open tasks · {s.logs.filter((l) => l.goalId === g.id && !l.ext && !l.note).length} of your logs
                  </span>
                </div>
                <button className="link small" onClick={() => set((st) => shareGoal(st, g.id, false))} title="Stops syncing this goal from Pursuit. Files already on the branch stay as they are.">
                  Stop sharing
                </button>
              </div>
            ))}
            {notShared.map((g) => (
              <div key={g.id} className="sh-row">
                <div className="sh-main">
                  <span>{g.title}</span>
                  <span className="muted small">not shared</span>
                </div>
                <button className="secondary" onClick={() => set((st) => shareGoal(st, g.id, true))}>
                  Share
                </button>
              </div>
            ))}
            {!s.goals.length && <p className="muted small">You have no goals yet.</p>}
          </div>

          <button className="link small" onClick={() => (setToken(''), setTok(''), setRemote(null))}>
            Remove the GitHub token from this browser
          </button>
        </>
      )}
    </div>
  )
}
