import { useRef, useState } from 'react'
import { initialState, useStore } from './store'
import { today } from './dates'

export function Settings({ showTutorial }: { showTutorial: () => void }) {
  const { s, set, toast, auth, sync, canSignIn, signIn, signOut } = useStore()
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
        <span>Help</span>
        <div className="btn-row">
          <button className="secondary" onClick={showTutorial}>
            Show tutorial
          </button>
        </div>
      </div>

      <div className="field">
        <span>Your data</span>
        <small className="muted">Export a backup file, or restore one.</small>
        <div className="btn-row">
          <button className="secondary" onClick={exportData}>
            Export backup
          </button>
          <button className="secondary" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          <button
            className="danger"
            onBlur={() => setConfirmReset(false)}
            onClick={() => {
              if (!confirmReset) return setConfirmReset(true)
              set(() => ({ ...initialState(), tutorialSeen: true }))
              toast('All data cleared')
            }}
          >
            {confirmReset ? 'Click again to erase everything' : 'Reset all data'}
          </button>
        </div>
      </div>
    </div>
  )
}
