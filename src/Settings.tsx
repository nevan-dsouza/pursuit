import { useRef, useState } from 'react'
import { initialState, useStore } from './store'
import { today } from './dates'

export function Settings({ showTutorial }: { showTutorial: () => void }) {
  const { s, set, toast, auth, sync, canSignIn, signIn, signOut, spaces, spaceId, space, switchSpace, createSpace, joinSpace, leaveSpace } = useStore()
  const [newName, setNewName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null)
  const run = async (fn: () => Promise<string | null>, ok: string) => {
    setBusy(true)
    const err = await fn()
    setBusy(false)
    toast(err ?? ok)
    if (!err) (setNewName(''), setCode(''))
  }
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Code copied')
    } catch {
      toast(`Code: ${text}`)
    }
  }
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportData = () => {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pursuit-backup-${today()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      if (!Array.isArray(data.goals) || !Array.isArray(data.tasks)) throw new Error()
      set(() => ({ ...initialState(), ...data, timer: null }))
      toast('Backup restored')
    } catch {
      toast('That file is not a Pursuit backup')
    }
  }

  const syncLabel = { device: 'Saved on this device only', saving: 'Saving…', synced: 'Synced to your account', offline: 'Not synced. Changes are safe on this device and will sync when you are back online.' }[sync]

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="field">
        <span>Account</span>
        {auth.status === 'in' ? (
          <>
            <div>
              Signed in as <b>{auth.name}</b>
              {auth.email && auth.email !== auth.name ? ` (${auth.email})` : ''}
            </div>
            <small className="muted">{syncLabel}</small>
            <div className="btn-row">
              <button className="secondary" onClick={signOut}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <small className="muted">You are not signed in. Everything is saved on this device only.</small>
            {canSignIn ? (
              <div className="btn-row">
                <button className="primary" onClick={signIn}>
                  Sign in with Google to sync
                </button>
              </div>
            ) : (
              <small className="muted">Sign-in is available when Pursuit is opened from its web address, not from a downloaded file.</small>
            )}
          </>
        )}
      </div>

      <div className="field">
        <span>Spaces</span>
        <small className="muted">A space is a shared workspace: everyone in it sees the same goals, milestones, tasks and logs. Share its code with people who have signed in to Pursuit so they can join.</small>
        {auth.status !== 'in' ? (
          <small className="muted">Sign in to create or join a space.</small>
        ) : (
          <>
            {spaces.map((x) => (
              <div key={x.id} className={`space-row ${x.id === spaceId ? 'on' : ''}`}>
                <div className="space-main">
                  <b>{x.name}</b>
                  <span className="muted small">
                    {x.members.length} member{x.members.length === 1 ? '' : 's'}: {x.members.join(', ')}
                  </span>
                </div>
                <button className="code-chip" title="Copy the join code" onClick={() => copy(x.code)}>
                  {x.code}
                </button>
                {x.id === spaceId ? (
                  <button className="secondary small-btn" onClick={() => switchSpace(null)}>
                    Back to Personal
                  </button>
                ) : (
                  <button className="secondary small-btn" onClick={() => switchSpace(x.id)}>
                    Open
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
            ))}
            <div className="add-task">
              <input placeholder="New space name, e.g. Team launch" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newName.trim() && run(() => createSpace(newName.trim()), 'Space created')} />
              <button className="primary" disabled={busy || !newName.trim()} onClick={() => run(() => createSpace(newName.trim()), 'Space created')}>
                Create
              </button>
            </div>
            <div className="add-task">
              <input placeholder="Have a code? Enter it here" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && code.trim() && run(() => joinSpace(code.trim()), 'Joined the space')} />
              <button className="secondary" disabled={busy || !code.trim()} onClick={() => run(() => joinSpace(code.trim()), 'Joined the space')}>
                Join
              </button>
            </div>
          </>
        )}
      </div>

      <div className="field">
        <span>Help</span>
        <div className="btn-row">
          <button className="secondary" onClick={showTutorial}>
            Show tutorial
          </button>
        </div>
      </div>

      <div className="field">
        <span>{space ? `Data in “${space.name}”` : 'Your data'}</span>
        <small className="muted">{space ? 'Export a backup of this space. Import and reset are turned off in shared spaces so nobody wipes the team’s work by accident.' : 'Export a backup file, or restore one.'}</small>
        <div className="btn-row">
          <button className="secondary" onClick={exportData}>
            Export backup
          </button>
          {!space && (
            <button className="secondary" onClick={() => fileRef.current?.click()}>
              Import backup
            </button>
          )}
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          {!space && <button
            className="danger"
            onBlur={() => setConfirmReset(false)}
            onClick={() => {
              if (!confirmReset) return setConfirmReset(true)
              set(() => ({ ...initialState(), tutorialSeen: true }))
              toast('All data cleared')
            }}
          >
            {confirmReset ? 'Click again to erase everything' : 'Reset all data'}
          </button>}
        </div>
      </div>
    </div>
  )
}
