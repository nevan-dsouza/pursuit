import { useState } from 'react'
import { useStore } from './store'

const toSpaces = () => {
  location.hash = 'spaces'
}

/** The space dropdown used in the Home and Goals sidebars. Creating and joining happen on the Spaces page. */
export function SpacePicker() {
  const { auth, spaces, spaceId, switchSpace } = useStore()
  if (auth.status !== 'in' || !spaces.length)
    return (
      <button className="link small space-empty" onClick={toSpaces}>
        {auth.status !== 'in' ? 'Sign in on the Spaces page to work with others' : 'Create or join a space'} →
      </button>
    )
  return (
    <div className="space-pick">
      <select value={spaceId ?? ''} onChange={(e) => switchSpace(e.target.value || null)} title="Choose which space's tasks to show">
        <option value="">No space</option>
        {spaces.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </div>
  )
}

/** The Spaces page: your spaces, with + New Space and Join space on the right of the header. */
export function Spaces() {
  const { auth, canSignIn, signIn, spaces, spaceId, team, switchSpace, leaveSpace, toast } = useStore()
  const [modal, setModal] = useState<null | 'create' | 'join'>(null)
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null)
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast('Space code copied')
    } catch {
      toast(`Space code: ${code}`)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h2>Spaces</h2>
        <div className="spacer" />
        {auth.status === 'in' && (
          <div className="btn-row">
            <button className="primary" onClick={() => setModal('create')}>
              + New Space
            </button>
            <button className="secondary" onClick={() => setModal('join')}>
              Join space
            </button>
          </div>
        )}
      </header>
      <p className="muted spaces-intro">A space is a shared workspace. Everyone in it sees and works on the same goals, milestones and tasks. Pick a space on Home to see its tasks under your own.</p>

      {auth.status !== 'in' ? (
        <div className="card">
          <p className="muted">You need to be signed in to create a space or join one with a code.</p>
          {canSignIn ? (
            <button className="primary" onClick={signIn}>
              Sign in with Google
            </button>
          ) : (
            <div className="banner warn">Sign-in works when Pursuit is opened from its web address, not from a downloaded file.</div>
          )}
        </div>
      ) : spaces.length === 0 ? (
        <div className="card">
          <p className="muted">You are not in any space yet. Create one and share its code, or join someone else's with the code they give you.</p>
        </div>
      ) : (
        spaces.map((x) => {
          const shown = x.id === spaceId
          const doc = shown && team ? team.s : null
          return (
            <div key={x.id} className={`card space-card ${shown ? 'on' : ''}`}>
              <div className="space-card-head">
                <div>
                  <b className="space-name">{x.name}</b>
                  <div className="muted small">
                    {x.members.length} member{x.members.length === 1 ? '' : 's'}: {x.members.join(', ')}
                  </div>
                  {doc && (
                    <div className="muted small">
                      {doc.goals.length} goal{doc.goals.length === 1 ? '' : 's'} · {doc.tasks.filter((t) => t.status === 'open').length} open task{doc.tasks.filter((t) => t.status === 'open').length === 1 ? '' : 's'} · {doc.tasks.filter((t) => t.status === 'done').length} done
                    </div>
                  )}
                </div>
                {shown ? <span className="pill-stat shown">Shown on Home</span> : null}
              </div>
              <div className="space-card-foot">
                <span className="muted small">Code to invite people</span>
                <button className="code-chip" title="Copy the code" onClick={() => copy(x.code)}>
                  {x.code}
                </button>
                <div className="spacer" />
                {!shown && (
                  <button className="secondary small-btn" onClick={() => (switchSpace(x.id), toast(`${x.name} is now shown on Home`))}>
                    Show on Home
                  </button>
                )}
                <button
                  className="danger small-btn"
                  onBlur={() => setConfirmLeave(null)}
                  onClick={() => (confirmLeave === x.id ? (leaveSpace(x.id), setConfirmLeave(null), toast(`Left ${x.name}`)) : setConfirmLeave(x.id))}
                >
                  {confirmLeave === x.id ? 'Click again to leave' : 'Leave'}
                </button>
              </div>
            </div>
          )
        })
      )}
      {modal && <SpaceModal start={modal} onClose={() => setModal(null)} />}
    </div>
  )
}

export function SpaceModal({ onClose, start = 'create' }: { onClose: () => void; start?: 'create' | 'join' }) {
  const { createSpace, joinSpace, spaces, spaceId, toast } = useStore()
  const [tab, setTab] = useState<'create' | 'join'>(start)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(false)
  const made = created ? spaces.find((x) => x.id === spaceId) : undefined

  const submit = async () => {
    const value = tab === 'create' ? name.trim() : code.trim()
    if (!value || busy) return
    setBusy(true)
    setError('')
    const err = tab === 'create' ? await createSpace(value) : await joinSpace(value)
    setBusy(false)
    if (err) return setError(err)
    if (tab === 'create') setCreated(true)
    else {
      toast('Joined the space')
      onClose()
    }
  }
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Space code copied')
    } catch {
      /* the code is on screen to copy by hand */
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="tutorial" role="dialog" aria-label="New space" onClick={(e) => e.stopPropagation()}>
        {made ? (
          <>
            <h2 className="modal-title">“{made.name}” is ready</h2>
            <p>Share this code. The other person signs in to Pursuit with Google, opens Spaces, clicks “Join space” and enters it.</p>
            <button className="code-big" onClick={() => copy(made.code)} title="Copy">
              {made.code}
            </button>
            <div className="tut-actions">
              <span />
              <button className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title">{tab === 'join' ? 'Join a Space' : 'New Space'}</h2>
            <p>A space is a shared workspace. Everyone in it sees and works on the same goals and tasks.</p>
            <div className="seg">
              <button className={tab === 'create' ? 'on' : ''} onClick={() => (setTab('create'), setError(''))}>
                Create a space
              </button>
              <button className={tab === 'join' ? 'on' : ''} onClick={() => (setTab('join'), setError(''))}>
                Join with a code
              </button>
            </div>
            {tab === 'create' ? (
              <input autoFocus placeholder="Space name, e.g. Launch team" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            ) : (
              <input autoFocus className="code-input" placeholder="8-character code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            )}
            {error && <div className="banner warn">{error}</div>}
            <div className="tut-actions">
              <button className="link" onClick={onClose}>
                Cancel
              </button>
              <button className="primary" disabled={busy || !(tab === 'create' ? name.trim() : code.trim())} onClick={submit}>
                {busy ? 'Working…' : tab === 'create' ? 'Create space' : 'Join space'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
