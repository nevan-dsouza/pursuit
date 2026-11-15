import { useState } from 'react'
import { useStore } from './store'

/** Space selector + "+ New Space". Used in the Home and Goals sidebars. */
export function SpacePicker() {
  const { auth, canSignIn, signIn, spaces, spaceId, space, switchSpace, toast } = useStore()
  const [modal, setModal] = useState<null | 'create' | 'join'>(null)
  if (auth.status !== 'in')
    return (
      <div className="space-note">
        <div className="muted small">Spaces let you share goals and tasks. You need to be signed in to create one or join with a code.</div>
        {canSignIn && (
          <button className="new-space" onClick={signIn}>
            Sign in with Google
          </button>
        )}
      </div>
    )

  const copy = async () => {
    if (!space) return
    try {
      await navigator.clipboard.writeText(space.code)
      toast('Space code copied')
    } catch {
      toast(`Space code: ${space.code}`)
    }
  }

  return (
    <div className="space-pick">
      {spaces.length > 0 && (
        <select value={spaceId ?? ''} onChange={(e) => switchSpace(e.target.value || null)} title="Choose which space to show">
          {!spaceId && <option value="">Choose a space…</option>}
          {spaces.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      )}
      <button className="new-space" onClick={() => setModal('create')}>
        + New Space
      </button>
      <button className="new-space join" onClick={() => setModal('join')}>
        Join with code
      </button>
      {space && (
        <button className="code-chip" onClick={copy} title={`Copy the code to invite people · ${space.members.join(', ')}`}>
          {space.code}
        </button>
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
            <p>Share this code. The other person signs in to Pursuit with Google, clicks “Join with code” on Home and enters it.</p>
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
